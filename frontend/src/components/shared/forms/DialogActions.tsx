import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';

/**
 * Cancel and submit, at the foot of a dialog.
 *
 * Takes plain callbacks, so it works inside a form or without one.
 */
interface DialogActionsProps {
  onCancel: () => void;
  /** Omit inside a `<form>`: the submit button then submits its own form. */
  onSubmit?: () => void;
  /** A write is in flight — both buttons lock and the label changes. */
  pending?: boolean;
  pendingLabel?: string;
  submitLabel: string;
  /** Submit is unavailable for a reason of the caller's own, e.g. an
   *  incomplete form. `pending` already disables it. */
  disabled?: boolean;
}

export function DialogActions({
  onCancel,
  onSubmit,
  pending = false,
  pendingLabel = 'Saving…',
  submitLabel,
  disabled = false,
}: DialogActionsProps) {
  return (
    <DialogFooter className="gap-2">
      <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
        Cancel
      </Button>
      <Button
        type={onSubmit ? 'button' : 'submit'}
        onClick={onSubmit}
        disabled={pending || disabled}
      >
        {pending ? pendingLabel : submitLabel}
      </Button>
    </DialogFooter>
  );
}
