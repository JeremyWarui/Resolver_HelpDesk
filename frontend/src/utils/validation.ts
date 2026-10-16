import { z } from 'zod';

// The two forms that validate with zod. Everything else in the app validates
// against a server contract it already holds — the status modal against
// VALID_NEXT_STATUS — so there is nothing to restate
// here for them.

/** Only what FacilitySerializer accepts on write. There is no code, status or
 *  location column, and the type name is derived from the FK. */
export const createFacilitySchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  campus: z.coerce.number({ error: 'Campus is required' }),
  facility_type: z.coerce.number({ error: 'Type is required' }),
});

export type CreateFacilityFormValues = z.infer<typeof createFacilitySchema>;

export const ticketCommentSchema = z.object({
  comment: z.string().min(1, { message: 'Comment cannot be empty.' }),
});

export type TicketCommentFormValues = z.infer<typeof ticketCommentSchema>;
