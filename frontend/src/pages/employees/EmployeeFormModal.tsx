import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { getErrorMessage } from '@/lib/api';
import { applyFieldErrors } from '@/lib/forms';
import { queryKeys } from '@/lib/queryKeys';
import { nameField, optionalPhoneField } from '@/lib/validation';
import { employeesService } from '@/services/employees.service';
import type { Employee, EmployeePayload } from '@/types/employee';
import { EMPLOYEE_POSITION_LABELS, EMPLOYEE_POSITION_ORDER, EMPLOYEE_STATUS_LABELS, EMPLOYEE_STATUS_ORDER } from '@/utils/employeeLabels';

const schema = z
  .object({
    firstName: nameField('Ism'),
    lastName: nameField('Familiya'),
    phone: optionalPhoneField,
    position: z.enum(EMPLOYEE_POSITION_ORDER),
    baseSalary: z.string().refine((value) => /^\d{1,9}$/.test(value), 'Maosh butun son (so‘m) bo‘lishi kerak'),
    hireDate: z.string().min(1, 'Ishga kirgan sanani kiriting'),
    status: z.enum(EMPLOYEE_STATUS_ORDER),
    terminationDate: z.string(),
    userId: z.string(),
    note: z.string().trim().max(500, 'Izoh juda uzun'),
  })
  .refine((values) => values.status !== 'RESIGNED' || values.terminationDate !== '', {
    path: ['terminationDate'],
    message: 'Ishdan ketgan sanani kiriting',
  });

type FormValues = z.infer<typeof schema>;

function toPayload(values: FormValues, includeSalary: boolean): EmployeePayload {
  return {
    firstName: values.firstName,
    lastName: values.lastName,
    phone: values.phone || null,
    position: values.position,
    ...(includeSalary ? { baseSalary: Number(values.baseSalary) } : {}),
    hireDate: values.hireDate,
    status: values.status,
    terminationDate: values.terminationDate || null,
    note: values.note || null,
    userId: values.userId || null,
  };
}

interface EmployeeFormModalProps {
  employee?: Employee;
  onClose: () => void;
  onSaved: () => void;
}

export function EmployeeFormModal({ employee, onClose, onSaved }: EmployeeFormModalProps) {
  /** salary.view ruxsati yo‘q — maosh ko‘rsatilmaydi va o‘zgartirilmaydi */
  const salaryHidden = employee?.baseSalary === null;
  const [formError, setFormError] = useState<string | null>(null);

  const candidatesQuery = useQuery({ queryKey: queryKeys.employees.candidates, queryFn: employeesService.candidates });

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: employee?.firstName ?? '',
      lastName: employee?.lastName ?? '',
      phone: employee?.phone ?? '',
      position: employee?.position ?? 'ADMINISTRATOR',
      baseSalary: salaryHidden ? '0' : employee ? String(employee.baseSalary) : '',
      hireDate: employee?.hireDate ?? new Date().toISOString().slice(0, 10),
      status: employee?.status ?? 'ACTIVE',
      terminationDate: employee?.terminationDate ?? '',
      userId: employee?.user?.id ?? '',
      note: employee?.note ?? '',
    },
  });
  const status = useWatch({ control, name: 'status' });

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      employee ? employeesService.update(employee.id, toPayload(values, !salaryHidden)) : employeesService.create(toPayload(values, true)),
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError, ['firstName', 'lastName', 'phone', 'position', 'baseSalary', 'hireDate', 'terminationDate', 'userId'])) {
        setFormError(getErrorMessage(error));
      }
    },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    save.mutate(values);
  });

  // Tahrirda hozirgi bog'langan akkaunt ham ro'yxatda turadi
  const candidates = [
    ...(employee?.user ? [{ id: employee.user.id, firstName: employee.user.firstName, lastName: employee.user.lastName, email: employee.user.email, roleName: 'bog‘langan' }] : []),
    ...(candidatesQuery.data ?? []),
  ];

  return (
    <Modal
      open
      size="lg"
      title={employee ? 'Xodimni tahrirlash' : 'Xodim qo‘shish'}
      description={employee ? `${employee.firstName} ${employee.lastName}` : 'Administrator, buxgalter, farrosh va boshqa xodimlar'}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="employee-form" loading={save.isPending}>
            Saqlash
          </Button>
        </>
      }
    >
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}

      <form id="employee-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Ism" htmlFor="employee-firstName" error={errors.firstName?.message} required>
            <Input id="employee-firstName" autoFocus invalid={Boolean(errors.firstName)} {...register('firstName')} />
          </FormField>
          <FormField label="Familiya" htmlFor="employee-lastName" error={errors.lastName?.message} required>
            <Input id="employee-lastName" invalid={Boolean(errors.lastName)} {...register('lastName')} />
          </FormField>
          <FormField label="Telefon" htmlFor="employee-phone" error={errors.phone?.message}>
            <Input id="employee-phone" type="tel" placeholder="+998 90 123 45 67" invalid={Boolean(errors.phone)} {...register('phone')} />
          </FormField>
          <FormField label="Lavozim" htmlFor="employee-position" error={errors.position?.message} required>
            <Select id="employee-position" {...register('position')}>
              {EMPLOYEE_POSITION_ORDER.map((value) => (
                <option key={value} value={value}>
                  {EMPLOYEE_POSITION_LABELS[value]}
                </option>
              ))}
            </Select>
          </FormField>
          {!salaryHidden && (
            <FormField label="Oylik maosh (so‘m)" htmlFor="employee-baseSalary" error={errors.baseSalary?.message} required hint="Oy o‘rtasida kirgan/ketganda kunlarga proporsional">
              <Input id="employee-baseSalary" inputMode="numeric" invalid={Boolean(errors.baseSalary)} {...register('baseSalary')} />
            </FormField>
          )}
          <FormField label="Ishga kirgan sana" htmlFor="employee-hireDate" error={errors.hireDate?.message} required>
            <Input id="employee-hireDate" type="date" invalid={Boolean(errors.hireDate)} {...register('hireDate')} />
          </FormField>
          <FormField label="Holat" htmlFor="employee-status" error={errors.status?.message} required>
            <Select id="employee-status" {...register('status')}>
              {EMPLOYEE_STATUS_ORDER.map((value) => (
                <option key={value} value={value}>
                  {EMPLOYEE_STATUS_LABELS[value]}
                </option>
              ))}
            </Select>
          </FormField>
          {status === 'RESIGNED' && (
            <FormField label="Ishdan ketgan sana" htmlFor="employee-terminationDate" error={errors.terminationDate?.message} required>
              <Input id="employee-terminationDate" type="date" invalid={Boolean(errors.terminationDate)} {...register('terminationDate')} />
            </FormField>
          )}
          <FormField label="Tizim akkaunti" htmlFor="employee-userId" error={errors.userId?.message} hint="Ixtiyoriy — maosh xabarlari shu akkauntga boradi">
            <Select id="employee-userId" {...register('userId')}>
              <option value="">Bog‘lanmagan</option>
              {candidates.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.firstName} {user.lastName} · {user.roleName}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <FormField label="Izoh" htmlFor="employee-note" error={errors.note?.message}>
          <Textarea id="employee-note" rows={2} {...register('note')} />
        </FormField>
      </form>
    </Modal>
  );
}
