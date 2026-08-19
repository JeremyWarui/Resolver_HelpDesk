export interface Technician {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  name?: string; // Computed: first_name + last_name
  email: string;
  role: 'technician';
  sections: number[]; // Array of section IDs
  section_names?: string[];
  /** The trades this technician works. Together with `sections` these are the
   *  `(section, sub_section)` pairs `scoped_ticket_qs` matches on — a
   *  technician sees a ticket only where both halves line up. Served by the
   *  /technicians/ roster. */
  sub_sections?: number[];
  sub_section_names?: string[];
  campus_name: string | null;          // primary_campus.name — plain name e.g. "Nairobi"
  primary_campus_id: number | null;
  primary_department_id: number | null;
  primary_department_name?: string | null;
}

// Technician Dashboard Types

