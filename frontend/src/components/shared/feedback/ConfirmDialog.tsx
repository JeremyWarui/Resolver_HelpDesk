// The confirmation every irreversible action goes through: delete a campus, a
// user, a trade, a service item.
//
// `description` takes a ReactNode rather than a string because most callers
// format the entity's name inside the sentence.

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  variant?: 'default' | 'destructive';
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  variant = 'default',
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const handleConfirm = async (e: React.MouseEvent) => {
    e.preventDefault();
    await onConfirm();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={loading}
            className={cn(
              variant === 'destructive' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
            )}
          >
            {loading ? 'Working…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
