import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';

/** TZ 3.0 §54: klaviatura bilan oyna ichida qolish, yopilganda fokus qaytishi, ichma-ich oynalar */
function Harness({ onConfirmClose = () => {} }: { onConfirmClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Ochish
      </button>
      <Modal open={open} title="Tahrirlash" onClose={() => setOpen(false)}>
        <input aria-label="Ism" />
        <button type="button" onClick={() => setConfirm(true)}>
          O‘chirish
        </button>
      </Modal>
      <ConfirmDialog
        open={confirm}
        title="Ishonchingiz komilmi?"
        description="Qaytarib bo‘lmaydi"
        onConfirm={() => setConfirm(false)}
        onCancel={() => {
          setConfirm(false);
          onConfirmClose();
        }}
      />
    </>
  );
}

describe('useFocusTrap (Modal, ConfirmDialog)', () => {
  it('ochilganda fokus oynaga o‘tadi va Tab oyna ichida aylanadi', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Ochish' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    for (let index = 0; index < 5; index += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    await user.tab({ shift: true });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it('yopilganda fokus ochgan tugmaga qaytadi', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Ochish' });
    await user.click(opener);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('ichma-ich oynada Esc faqat ustkisini yopadi, fokus pastkisiga qaytadi', async () => {
    const user = userEvent.setup();
    const onConfirmClose = vi.fn();
    render(<Harness onConfirmClose={onConfirmClose} />);
    await user.click(screen.getByRole('button', { name: 'Ochish' }));
    const trigger = screen.getByRole('button', { name: 'O‘chirish' });
    await user.click(trigger);
    const alert = screen.getByRole('alertdialog');
    expect(alert).toContainElement(document.activeElement as HTMLElement);
    await user.tab();
    expect(alert).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard('{Escape}');
    expect(onConfirmClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
