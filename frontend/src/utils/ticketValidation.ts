/**
 * Shared validation schemas and utilities for ticket forms
 * Consolidates validation logic across CreateTicket and edit forms
 */
import { z } from 'zod';

/**
 * Validation schema for creating a new ticket.
 * Only service_item_id + description (+optional location) — routing/priority resolved server-side (R6/R7).
 */
export const createTicketSchema = z.object({
  service_item_id: z.number().min(1, 'Please select a service.'),
  description: z.string().min(3, 'Description must be at least 3 characters.'),
  location: z.object({
    facility_type_id: z.number(),
    facility_id: z.number().optional(),
    values: z.record(z.string(), z.unknown()),
  }).optional(),
});

/**
 * Validation schema for updating ticket details (title, description, section, facility)
 */
export const updateTicketDetailsSchema = z.object({
  title: z.string().min(5, {
    message: 'Title must be at least 5 characters.',
  }).optional(),
  description: z.string().min(10, {
    message: 'Description must be at least 10 characters.',
  }).optional(),
  section_id: z.number().optional(),
  facility_id: z.number().optional(),
});

/**
 * Validation schema for updating ticket status
 */
export const updateTicketStatusSchema = z.object({
  status: z.enum(['open', 'assigned', 'in_progress', 'pending', 'resolved', 'closed']),
  assigned_to_id: z.number().nullable().optional(),
  pending_reason: z.string().min(1).optional(),
});

/**
 * Validation schema for ticket comments
 */
export const ticketCommentSchema = z.object({
  comment: z.string().min(1, { message: "Comment cannot be empty." }),
});

/**
 * Validation schema for ticket feedback
 */
export const ticketFeedbackSchema = z.object({
  rating: z.number().min(1).max(5, { message: "Rating must be between 1 and 5." }),
  comment: z.string().optional(),
});

// Export type inference helpers
export type CreateTicketFormValues = z.infer<typeof createTicketSchema>;
export type UpdateTicketDetailsFormValues = z.infer<typeof updateTicketDetailsSchema>;
export type UpdateTicketStatusFormValues = z.infer<typeof updateTicketStatusSchema>;
export type TicketCommentFormValues = z.infer<typeof ticketCommentSchema>;
export type TicketFeedbackFormValues = z.infer<typeof ticketFeedbackSchema>;
