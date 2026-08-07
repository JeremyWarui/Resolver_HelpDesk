// RatingWidget — 1–5 star rating + optional comment, submitted with Close.
// Used when a user confirms resolution of their ticket (Rate & Close).
// Reopen is a separate standalone action on the ticket detail page (QA B2c).
// RatingStars is the shared read-only display for submitted feedback (QA D3).

import { useState } from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface RatingSubmitPayload {
  rating: number;       // 1–5
  comment?: string;
}

const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

/** Read-only star row for submitted feedback (ticket detail, staff views). */
export function RatingStars({
  rating,
  comment,
  className,
}: {
  rating: number;
  comment?: string | null;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center gap-1.5">
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={cn(
                'h-4 w-4',
                n <= rating ? 'fill-yellow-400 text-yellow-400' : 'fill-none text-muted-foreground/50',
              )}
            />
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{RATING_LABELS[rating] ?? ''}</span>
      </div>
      {comment && (
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">“{comment}”</p>
      )}
    </div>
  );
}

interface RatingWidgetProps {
  onSubmit: (payload: RatingSubmitPayload) => Promise<void> | void;
  submitting?: boolean;
  className?: string;
  /** Only render when the ticket is resolved/closed and the viewer is the raiser. */
  isResolved?: boolean;
  isRaiser?: boolean;
}

export function RatingWidget({ onSubmit, submitting = false, className, isResolved = true, isRaiser = true }: RatingWidgetProps) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');

  if (!isResolved || !isRaiser) return null;

  const canSubmit = rating > 0;

  return (
    <div className={cn('space-y-5', className)}>
      {/* Stars */}
      <div className="space-y-2">
        <Label>How satisfied are you with the resolution?</Label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => {
            const filled = n <= (hovered || rating);
            return (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                onMouseEnter={() => setHovered(n)}
                onMouseLeave={() => setHovered(0)}
                className="p-0.5 focus:outline-none"
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
              >
                <Star
                  className={cn(
                    'h-8 w-8 transition-colors',
                    filled ? 'fill-yellow-400 text-yellow-400' : 'fill-none text-muted-foreground',
                  )}
                />
              </button>
            );
          })}
        </div>
        {rating > 0 && (
          <p className="text-xs text-muted-foreground">{RATING_LABELS[rating]}</p>
        )}
      </div>

      {/* Comment */}
      <div className="space-y-2">
        <Label>Additional feedback <span className="text-muted-foreground">(optional)</span></Label>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Tell us more about your experience…"
          rows={3}
          disabled={submitting}
        />
      </div>

      <Button
        onClick={() => onSubmit({ rating, comment: comment || undefined })}
        disabled={!canSubmit || submitting}
        className="w-full"
      >
        {submitting ? 'Submitting…' : 'Submit & close ticket'}
      </Button>
    </div>
  );
}
