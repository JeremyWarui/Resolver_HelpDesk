import type { FilterOption } from "../DataTable";
import type { TicketFilterOption } from "@/lib/api/tickets";

// Every list here comes from `/tickets/filter-options/` as {id, name} —
// `TicketFilterOption`. The factories used to accept `string[]` as well and
// branch on it at every call; nothing has ever passed one.

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

/** "All X" plus one option per row, for a filter driven by an id. */
const idFilter = (
  label: string,
  allLabel: string,
  current: string,
  onPick: (value: string) => void,
  rows: TicketFilterOption[],
  setPageIndex?: (index: number) => void
): FilterOption => ({
  label,
  defaultValue: current,
  value: current,
  options: [
    { label: allLabel, value: "all" },
    ...rows.map((row) => ({ label: row.name, value: String(row.id) })),
  ],
  onFilterChange: (value: string) => {
    onPick(value);
    if (setPageIndex) setPageIndex(0);
  },
});

/**
 * Filter by trade — Plumbing, Electrical, Carpentry, …
 *
 * Options come from `/tickets/filter-options/`, built from the caller's own
 * rows, so the list cannot advertise a trade whose tickets they are refused.
 */
export const createTradeFilter = (
  tradeFilter: string | number,
  setTradeFilter: (value: number | null) => void,
  allTrades: TicketFilterOption[],
  setPageIndex?: (index: number) => void
): FilterOption =>
  idFilter(
    "Filter by trade",
    "All Trades",
    String(tradeFilter),
    (value) => setTradeFilter(value === "all" ? null : Number(value)),
    allTrades,
    setPageIndex
  );

export const createTechnicianFilter = (
  technicianFilter: string,
  setTechnicianFilter: (value: string) => void,
  allTechnicians: TicketFilterOption[],
  setPageIndex?: (index: number) => void
): FilterOption =>
  idFilter(
    "Filter by technician",
    "All Technicians",
    technicianFilter,
    setTechnicianFilter,
    allTechnicians,
    setPageIndex
  );

export const createUserFilter = (
  userFilter: string,
  setUserFilter: (value: string) => void,
  allUsers: TicketFilterOption[],
  setPageIndex?: (index: number) => void
): FilterOption =>
  idFilter(
    "Filter by user",
    "All Users",
    userFilter,
    setUserFilter,
    allUsers,
    setPageIndex
  );
