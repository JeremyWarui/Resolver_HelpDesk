/**
 * Validation for the ticket comment form.
 *
 * This file also carried schemas for create, detail-edit, status-update and
 * feedback. None had a consumer: the wizard validates step by step against
 * TYPE_SPECS, the status modal against VALID_NEXT_STATUS, and the rating widget
 * against its own bounds. The status one also spelled out a sixth copy of the
 * status vocabulary that nothing checked anything against.
 */
import { z } from 'zod';

export const ticketCommentSchema = z.object({
  comment: z.string().min(1, { message: 'Comment cannot be empty.' }),
});

export type TicketCommentFormValues = z.infer<typeof ticketCommentSchema>;
