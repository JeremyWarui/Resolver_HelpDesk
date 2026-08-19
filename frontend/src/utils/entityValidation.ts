import { z } from 'zod';

export const createSectionSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  description: z.string().max(200).optional(),
  code: z.string().optional(),
  campus_department: z.coerce.number({ error: 'Campus/Department is required' }),
  section_type: z.coerce.number({ error: 'Section type is required' }),
});

// Only what FacilitySerializer accepts on write. The form used to collect
// facility_code / type / status / location: of those, `code` is the real field
// name, `type` and `status` are read-only, and `location` is not a column.
export const createFacilitySchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  code: z.string().optional(),
  campus: z.coerce.number({ error: 'Campus is required' }),
  facility_type: z.coerce.number({ error: 'Type is required' }),
});

export const createTechnicianSchema = z.object({
  // No name fields: username and name are derived from the email server-side
  // (backend/apps/accounts/identity.py).
  email: z.string().email({ message: 'Valid email required' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
  section_id: z.number({ message: 'A section is required' }),
  // At least one trade: a technician scoped to no trade sees no tickets, which
  // the server refuses rather than creating a silently useless account.
  sub_section_ids: z.array(z.number()).min(1, { message: 'Pick at least one trade' }),
  primary_department_id: z.number().nullable().optional(),
});

export type CreateSectionFormValues = z.infer<typeof createSectionSchema>;
export type CreateFacilityFormValues = z.infer<typeof createFacilitySchema>;
export type CreateTechnicianFormValues = z.infer<typeof createTechnicianSchema>;

export default {};
