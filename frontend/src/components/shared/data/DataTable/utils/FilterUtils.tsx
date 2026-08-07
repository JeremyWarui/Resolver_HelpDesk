import { FilterOption } from "../DataTable";

export const createStatusFilter = (
  statusFilter: string,
  setStatusFilter: (value: string) => void,
  allStatuses: string[],
  setPageIndex?: (index: number) => void
): FilterOption => ({
  label: "Filter by status",
  defaultValue: statusFilter,
  value: statusFilter, // Add value for controlled component
  options: [
    { label: "All Statuses", value: "all" },
    ...allStatuses.map((status) => ({
      label: status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' '),
      value: status,
    })),
  ],
  onFilterChange: (value: string) => {
    setStatusFilter(value);
    if (setPageIndex) setPageIndex(0);
  },
});

export const createSectionFilter = (
  sectionFilter: string | number,
  setSectionFilter: (value: number | null | string) => void,
  allSections: Array<{ id: number; name: string } | string>,
  setPageIndex?: (index: number) => void
): FilterOption => ({
  label: "Filter by section",
  defaultValue: String(sectionFilter),
  value: String(sectionFilter), // Add value for controlled component
  options: [
    { label: "All Sections", value: "all" },
    ...allSections.map((section) => ({
      label: typeof section === "string" ? section : section.name,
      value: typeof section === "string" ? section : String(section.id),
    })),
  ],
  onFilterChange: (value: string) => {
    // Convert "all" to null, numbers to numbers, keep strings as strings
    if (value === "all") {
      setSectionFilter(null);
    } else if (!isNaN(Number(value))) {
      setSectionFilter(Number(value));
    } else {
      setSectionFilter(value);
    }
    if (setPageIndex) setPageIndex(0);
  },
});

export const createTechnicianFilter = (
  technicianFilter: string,
  setTechnicianFilter: (value: string) => void,
  allTechnicians: string[] | { id: number; name: string }[],
  uniqueTechnicians?: string[],
  setPageIndex?: (index: number) => void
): FilterOption => ({
  label: "Filter by technician",
  defaultValue: technicianFilter,
  value: technicianFilter, // Add value for controlled component
  options: [
    { label: "All Technicians", value: "all" },
    ...(allTechnicians.length > 0
      ? allTechnicians
      : uniqueTechnicians || []
    ).map((tech) => {
      // Handle both string and object formats
      if (typeof tech === 'string') {
        return { label: tech, value: tech };
      } else {
        return { label: tech.name, value: String(tech.id) };
      }
    }),
  ],
  onFilterChange: (value: string) => {
    setTechnicianFilter(value);
    if (setPageIndex) setPageIndex(0);
  },
});

export const createUserFilter = (
  userFilter: string,
  setUserFilter: (value: string) => void,
  allUsers: string[] | { id: number; name: string }[],
  setPageIndex?: (index: number) => void
): FilterOption => ({
  label: "Filter by user",
  defaultValue: userFilter,
  value: userFilter, // Add value for controlled component
  options: [
    { label: "All Users", value: "all" },
    ...allUsers.map((user) => {
      // Handle both string and object formats
      if (typeof user === 'string') {
        return { label: user, value: user };
      } else {
        return { label: user.name, value: String(user.id) };
      }
    }),
  ],
  onFilterChange: (value: string) => {
    setUserFilter(value);
    if (setPageIndex) setPageIndex(0);
  },
});
