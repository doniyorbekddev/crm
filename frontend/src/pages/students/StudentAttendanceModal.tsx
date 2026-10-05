import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { StudentItem } from '@/types/student';
import { AttendancePanel } from './profile/AttendancePanel';

interface StudentAttendanceModalProps {
  student: StudentItem;
  onClose: () => void;
}

export function StudentAttendanceModal({ student, onClose }: StudentAttendanceModalProps) {
  return (
    <Modal
      open
      size="lg"
      title="Davomat kalendari"
      description={`${student.firstName} ${student.lastName} · ${student.code}`}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Yopish
        </Button>
      }
    >
      <AttendancePanel studentId={student.id} />
    </Modal>
  );
}
