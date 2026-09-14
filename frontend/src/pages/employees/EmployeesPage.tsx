import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderLock, IdCard, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { TBody, TD, TH, THead, TR, Table, TableContainer, TableSkeleton } from '@/components/ui/Table';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { employeesService } from '@/services/employees.service';
import type { Employee, EmployeeListParams, EmployeePosition, EmployeeStatus } from '@/types/employee';
import {
  EMPLOYEE_POSITION_LABELS,
  EMPLOYEE_POSITION_ORDER,
  EMPLOYEE_STATUS_LABELS,
  EMPLOYEE_STATUS_ORDER,
  EMPLOYEE_STATUS_TONES,
} from '@/utils/employeeLabels';
import { formatDate, formatMoney, formatPhone } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { SALARY_STATUS_LABELS, SALARY_STATUS_TONES } from '@/utils/teacherLabels';
import { StaffDocumentsModal } from '@/pages/hr/StaffDocumentsModal';
import { EmployeeFormModal } from './EmployeeFormModal';

const PAGE_SIZE = 20;

type Dialog = { type: 'create' } | { type: 'edit'; employee: Employee } | { type: 'documents'; employee: Employee } | null;

/** Xodimlar (HR): o‘qituvchidan tashqari xodimlar, lavozim, maosh va holat */
export default function EmployeesPage() {
  const queryClient = useQueryClient();
  const canManage = usePermission(PERMISSIONS.EMPLOYEE_MANAGE);
  const canViewDocuments = usePermission(PERMISSIONS.STAFF_DOCUMENT_VIEW);
  const canManageDocuments = usePermission(PERMISSIONS.STAFF_DOCUMENT_MANAGE);
  const showActions = canManage || canViewDocuments;

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput.trim(), 400);
  const [status, setStatus] = useState<EmployeeStatus | ''>('');
  const [position, setPosition] = useState<EmployeePosition | ''>('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>(null);

  const params: EmployeeListParams = {
    page,
    limit: PAGE_SIZE,
    ...(search ? { search } : {}),
    ...(status ? { status } : {}),
    ...(position ? { position } : {}),
  };

  const query = useQuery({
    queryKey: queryKeys.employees.list(params),
    queryFn: () => employeesService.list(params),
    placeholderData: keepPreviousData,
  });

  const saved = () => {
    setDialog(null);
    void queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.salaries.all });
  };

  const changeFilter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Xodimlar"
        description="O‘qituvchidan tashqari xodimlar: lavozim, oylik maosh va holat"
        documentTitle="Xodimlar"
        actions={
          canManage ? (
            <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setDialog({ type: 'create' })}>
              Xodim qo‘shish
            </Button>
          ) : undefined
        }
      />

      <Card>
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row">
          <SearchInput
            value={searchInput}
            onChange={(value) => changeFilter(() => setSearchInput(value))}
            placeholder="Ism yoki telefon"
            className="sm:max-w-xs"
          />
          <Select
            value={position}
            onChange={(event) => changeFilter(() => setPosition(event.target.value as EmployeePosition | ''))}
            aria-label="Lavozim"
            wrapperClassName="sm:w-52"
          >
            <option value="">Barcha lavozimlar</option>
            {EMPLOYEE_POSITION_ORDER.map((value) => (
              <option key={value} value={value}>
                {EMPLOYEE_POSITION_LABELS[value]}
              </option>
            ))}
          </Select>
          <Select
            value={status}
            onChange={(event) => changeFilter(() => setStatus(event.target.value as EmployeeStatus | ''))}
            aria-label="Holat"
            wrapperClassName="sm:w-44 sm:ml-auto"
          >
            <option value="">Barcha holatlar</option>
            {EMPLOYEE_STATUS_ORDER.map((value) => (
              <option key={value} value={value}>
                {EMPLOYEE_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>

        {query.isPending ? (
          <TableSkeleton rows={6} columns={6} />
        ) : query.isError ? (
          <ErrorState error={query.error} retrying={query.isFetching} onRetry={() => void query.refetch()} />
        ) : query.data.items.length === 0 ? (
          <EmptyState
            icon={IdCard}
            title="Xodim topilmadi"
            description={canManage ? 'Administrator, buxgalter, farrosh kabi xodimlarni qo‘shing — maoshi Maoshlar bo‘limida hisoblanadi' : 'Filtrlarni o‘zgartirib ko‘ring'}
          />
        ) : (
          <>
            <TableContainer className={cn('transition-opacity', query.isPlaceholderData && 'opacity-60')}>
              <Table>
                <THead>
                  <tr>
                    <TH>Xodim</TH>
                    <TH>Lavozim</TH>
                    <TH className="text-right">Oylik maosh</TH>
                    <TH>Ishga kirgan</TH>
                    <TH>Holat</TH>
                    <TH>Joriy oy maoshi</TH>
                    {showActions && (
                      <TH className="w-12">
                        <span className="sr-only">Amallar</span>
                      </TH>
                    )}
                  </tr>
                </THead>
                <TBody>
                  {query.data.items.map((employee) => (
                    <TR key={employee.id} className={cn(employee.status === 'RESIGNED' && 'opacity-60')}>
                      <TD>
                        <p className="font-medium text-fg">
                          {employee.firstName} {employee.lastName}
                        </p>
                        <p className="text-xs text-fg-muted">
                          {employee.phone ? formatPhone(employee.phone) : 'Telefon kiritilmagan'}
                          {employee.user && ` · ${employee.user.email}`}
                        </p>
                      </TD>
                      <TD className="whitespace-nowrap text-fg">{EMPLOYEE_POSITION_LABELS[employee.position]}</TD>
                      <TD className="text-right whitespace-nowrap tabular-nums text-fg">{formatMoney(employee.baseSalary)}</TD>
                      <TD className="whitespace-nowrap text-fg-muted">
                        {formatDate(employee.hireDate)}
                        {employee.terminationDate && <p className="text-xs">ketgan: {formatDate(employee.terminationDate)}</p>}
                      </TD>
                      <TD>
                        <Badge tone={EMPLOYEE_STATUS_TONES[employee.status]}>{EMPLOYEE_STATUS_LABELS[employee.status]}</Badge>
                      </TD>
                      <TD className="whitespace-nowrap">
                        {employee.currentSalary ? (
                          <>
                            <Badge tone={SALARY_STATUS_TONES[employee.currentSalary.status]}>{SALARY_STATUS_LABELS[employee.currentSalary.status]}</Badge>
                            <p className="mt-1 text-xs text-fg-muted">
                              {formatMoney(employee.currentSalary.totalAmount)}
                              {employee.currentSalary.remainingAmount > 0 && ` · qolgan ${formatMoney(employee.currentSalary.remainingAmount)}`}
                            </p>
                          </>
                        ) : (
                          <span className="text-xs text-fg-subtle">Hisoblanmagan</span>
                        )}
                      </TD>
                      {showActions && (
                        <TD className="text-right">
                          <ActionMenu
                            label={`${employee.firstName} ${employee.lastName} amallari`}
                            items={[
                              ...(canManage ? [{ label: 'Tahrirlash', icon: Pencil, onSelect: () => setDialog({ type: 'edit', employee }) }] : []),
                              ...(canViewDocuments
                                ? [{ label: 'Hujjatlar', icon: FolderLock, onSelect: () => setDialog({ type: 'documents', employee }) }]
                                : []),
                            ]}
                          />
                        </TD>
                      )}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
            <Pagination
              page={page}
              totalPages={query.data.meta.totalPages}
              total={query.data.meta.total}
              limit={PAGE_SIZE}
              onPageChange={setPage}
              disabled={query.isPlaceholderData}
            />
          </>
        )}
      </Card>

      {dialog?.type === 'create' && <EmployeeFormModal onClose={() => setDialog(null)} onSaved={saved} />}
      {dialog?.type === 'edit' && <EmployeeFormModal employee={dialog.employee} onClose={() => setDialog(null)} onSaved={saved} />}
      {dialog?.type === 'documents' && (
        <StaffDocumentsModal
          owner="employee"
          entityId={dialog.employee.id}
          personName={`${dialog.employee.firstName} ${dialog.employee.lastName}`}
          canManage={canManageDocuments}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
