// The requester's verdict on a resolved ticket: 1–5 stars and an optional
// comment, submitted together with the close.
//
// `RatingStars` is the read-only counterpart, for showing a rating that has
// already been given. Reopening is a separate action on the ticket detail.

import { useState } from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { rovingKeyDown } from '@/utils/roving';

const STAR_KEYS = ['1', '2', '3', '4', '5'] as const;

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
  /** Stars already chosen, when the requester picked them before the dialog opened. */
  initialRating?: number;
  className?: string;
}

/** Whether a ticket may be rated at all is the caller's decision — this only
 *  ever mounts inside `RatingModal`, which the "Rate & close" action opens. */
export function RatingWidget({ onSubmit, submitting = false, initialRating = 0, className }: RatingWidgetProps) {
  const [rating, setRating] = useState(initialRating);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');

  const canSubmit = rating > 0;

  return (
    <div className={cn('space-y-5', className)}>
      {/* Stars */}
      <div className="space-y-2">
        <Label id="rating-stars-label">How satisfied are you with the resolution?</Label>
        <div className="flex gap-1" role="radiogroup" aria-labelledby="rating-stars-label">
          {STAR_KEYS.map((key) => {
            const n = Number(key);
            const filled = n <= (hovered || rating);
            const checked = rating === n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={checked}
                // With nothing chosen the first star takes focus; after that the chosen one.
                tabIndex={checked || (rating === 0 && n === 1) ? 0 : -1}
                onClick={() => setRating(n)}
                onKeyDown={(e) => {
                  // From nothing chosen, Right lands on one star and Left on five:
                  // start just past the end the key moves away from.
                  const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
                  const from = rating ? String(rating) : back ? '1' : '5';
                  rovingKeyDown(e, STAR_KEYS, from, (k) => setRating(Number(k)));
                }}
                onMouseEnter={() => setHovered(n)}
                onMouseLeave={() => setHovered(0)}
                className="p-0.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500"
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
        <Label htmlFor="rating-comment">
          Additional feedback <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="rating-comment"
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
