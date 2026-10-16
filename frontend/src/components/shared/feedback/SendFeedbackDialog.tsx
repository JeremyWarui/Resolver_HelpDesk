import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DialogActions } from '@/components/shared/forms/DialogActions';
import { useSendSystemFeedback } from '@/hooks/useSystemFeedback';
import { handleDRFError } from '@/utils/handleDRFError';
import { cn } from '@/lib/utils';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_MESSAGE_MAX as MESSAGE_MAX,
  FEEDBACK_MESSAGE_MIN as MESSAGE_MIN,
} from '@/constants/systemFeedback';
import { rovingKeyDown } from '@/utils/roving';
import type { SystemFeedbackCategory } from '@/types';

const CATEGORY_KEYS = FEEDBACK_CATEGORIES.map((c) => c.key);

/** Feedback about the system itself, sent to the admin with the page it came from. */
export function SendFeedbackDialog({ open, onOpenChange }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { pathname } = useLocation();
  const send = useSendSystemFeedback();
  const [category, setCategory] = useState<SystemFeedbackCategory>('idea');
  const [message, setMessage] = useState('');
  const trimmed = message.trim();

  const close = () => {
    onOpenChange(false);
    setMessage('');
    setCategory('idea');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    send.mutate(
      { category, message: trimmed, page: pathname },
      {
        onSuccess: () => {
          toast.success('Thank you. Your feedback was sent.');
          close();
        },
        onError: (error) => handleDRFError(error, { fallbackMessage: 'Could not send your feedback' }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>
            Tell us what works, what does not, or what you need from Resolver. To report a fault,
            raise a ticket instead.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label id="feedback-category">What kind of feedback?</Label>
            <div role="radiogroup" aria-labelledby="feedback-category" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {FEEDBACK_CATEGORIES.map(({ key, label, icon: Icon }) => {
                const active = category === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    tabIndex={active ? 0 : -1}
                    onClick={() => setCategory(key)}
                    onKeyDown={(e) => rovingKeyDown(e, CATEGORY_KEYS, category, setCategory)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg border px-3 py-2.5 text-sm transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active
                        ? 'border-primary bg-primary/5 text-primary font-medium'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50',
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-message">Your feedback</Label>
            <Textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={MESSAGE_MAX}
              rows={5}
              placeholder="What happened, or what would help?"
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>Sent with the page you are on: {pathname}</span>
              <span className="tabular-nums">{message.length}/{MESSAGE_MAX}</span>
            </div>
          </div>

          <DialogActions
            onCancel={close}
            pending={send.isPending}
            pendingLabel="Sending…"
            submitLabel="Send feedback"
            disabled={trimmed.length < MESSAGE_MIN}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
