import type { FilterOption } from "../DataTable";
import type { TicketFilterOption } from "@/lib/api/tickets";
import { STATUS_LABELS } from "@/constants/tickets";
import type { Ticket } from "@/types";

// Every list here comes from `/tickets/filter-options/` as {id, name}:
// `TicketFilterOption`.

export const createStatusFilter = (
  statusFilter: string,
  setStatusFilter: (value: string) => void,
  allStatuses: string[],
): FilterOption => ({
  label: "Filter by status",
  value: statusFilter,
  options: [
    { label: "All Statuses", value: "all" },
    { label: "Active", value: "active" },
    ...allStatuses.map((status) => ({
      label: STATUS_LABELS[status as Ticket['status']] ?? status,
      value: status,
    })),
  ],
  onFilterChange: setStatusFilter,
});

/** "All X" plus one option per row, for a filter driven by an id. */
const idFilter = (
  label: string,
  allLabel: string,
  current: string,
  onPick: (value: string) => void,
  rows: TicketFilterOption[],
): FilterOption => ({
  label,
  value: current,
  options: [
    { label: allLabel, value: "all" },
    ...rows.map((row) => ({ label: row.name, value: String(row.id) })),
  ],
  onFilterChange: onPick,
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
): FilterOption =>
  idFilter(
    "Filter by trade",
    "All Trades",
    String(tradeFilter),
    (value) => setTradeFilter(value === "all" ? null : Number(value)),
    allTrades,
  );

export const createTechnicianFilter = (
  technicianFilter: string,
  setTechnicianFilter: (value: string) => void,
  allTechnicians: TicketFilterOption[],
): FilterOption =>
  idFilter(
    "Filter by technician",
    "All Technicians",
    technicianFilter,
    setTechnicianFilter,
    allTechnicians,
  );

export const createUserFilter = (
  userFilter: string,
  setUserFilter: (value: string) => void,
  allUsers: TicketFilterOption[],
): FilterOption =>
  idFilter(
    "Filter by user",
    "All Users",
    userFilter,
    setUserFilter,
    allUsers,
  );
