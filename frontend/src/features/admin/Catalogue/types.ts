import type { ServiceCategory } from '@/types/catalogue';

export interface Department {
  id: number;
  name: string;
  code: string;
}

export interface SectionType {
  id: number;
  name: string;
  code: string;
  department_id: number;
  department_code: string;
  parent_id: number | null;
  parent_name: string | null;
  staff_label?: string;
  service_categories: ServiceCategory[];
}

/** Category enriched with the fields the list/detail endpoints actually return. */
export type CategoryWithPriority = ServiceCategory & {
  default_priority?: {
    id: number;
    name: string;
    response_minutes: number;
    resolution_minutes: number;
  } | null;
};
