import { z } from 'zod';

export const createSectionSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  description: z.string().max(200).optional(),
  code: z.string().optional(),
  campus_department: z.coerce.number({ error: 'Campus/Department is required' }),
  section_type: z.coerce.number({ error: 'Section type is required' }),
});

export const createFacilitySchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  facility_code: z.string().optional(),
  campus: z.coerce.number({ error: 'Campus is required' }),
  type: z.string().optional(),
  status: z.string().optional(),
  location: z.string().optional(),
});

export const createTechnicianSchema = z.object({
  first_name: z.string().min(1, { message: 'First name is required' }),
  last_name: z.string().min(1, { message: 'Last name is required' }),
  email: z.string().email({ message: 'Valid email required' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
  sections: z.array(z.number()).optional(),
  primary_department_id: z.number().nullable().optional(),
});

export type CreateSectionFormValues = z.infer<typeof createSectionSchema>;
export type CreateFacilityFormValues = z.infer<typeof createFacilitySchema>;
export type CreateTechnicianFormValues = z.infer<typeof createTechnicianSchema>;

export default {};
