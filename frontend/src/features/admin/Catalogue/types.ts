import type { SubSection } from '@/types/catalogue';

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
  sub_sections: SubSection[];
}
