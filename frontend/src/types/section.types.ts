// Utility types for ticket and dashboard references
export interface NestedRef {
  id: number;
  code: string;
  name: string;
  campus_code?: string | null;
  department_code?: string | null;
}

export interface SectionHead {
  id: number;
  username: string;
  name: string;
}
