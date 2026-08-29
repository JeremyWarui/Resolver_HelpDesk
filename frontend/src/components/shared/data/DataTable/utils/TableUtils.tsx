 
import { type ColumnDef } from "@tanstack/react-table";
import { Eye, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/ticket/StatusBadge";
import { EscalationBadge } from "@/components/shared/ticket/EscalationBadge";
import { PriorityBadge } from "@/components/shared/ticket/PriorityBadge";
import { SLACountdown } from "@/components/shared/ticket/SLACountdown";
import type { Ticket } from "@/types";
import { sortableHeader } from './sortableHeader';
import { relativeTime } from '@/utils/date';

// Utility function to truncate text — guards against undefined/null values
const truncateText = (text: string | undefined | null, maxLength: number) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
};

// Column definitions
export const ticketNoColumn = (header: string = "Ticket ID"): ColumnDef<Ticket> => ({
  accessorKey: "ticket_no",
  header: sortableHeader(header),
  cell: ({ row }) => <div>{row.getValue("ticket_no")}</div>,
});

export const ticketTitleColumn = (header: string = "Service"): ColumnDef<Ticket> => ({
  // Tickets have no "title" field — use service_item.name as the display label.
  id: "title",
  accessorFn: (row) => {
    return row.service_item?.name ?? row.description ?? '';
  },
  header,
  cell: ({ row }) => {
    const val = row.getValue<string>("title");
    if (!val) return <span className="text-muted-foreground text-xs">—</span>;
    return (
      <div className="truncate text-sm" title={val}>
        {truncateText(val, 40)}
      </div>
    );
  },
  enableSorting: false,
  size: 180,
  maxSize: 180,
});

export const descriptionColumn = (header: string = "Description"): ColumnDef<Ticket> => ({
  accessorKey: "description",
  header,
  cell: ({ row }) => {
    const val = row.getValue("description") as string | null | undefined;
    if (!val) return <div className="text-muted-foreground text-xs">—</div>;
    return (
      <div className="max-w-[260px] truncate text-sm" title={val}>
        {truncateText(val, 55)}
      </div>
    );
  },
  enableSorting: false,
});

/**
 * Where the job is.
 *
 * Reads `location`, not a top-level `facility`: a Ticket carries the place
 * under `location`, and the facility sits inside it.
 *
 * Every location names a facility off the register — `validate_location` in
 * apps/facilities/validators.py refuses a null one for every type — so the
 * fallbacks below are defensive rather than a supported shape. `values` carries
 * the extra fields that type asks for, and identifies the spot within it.
 */
export const facilityColumn = (header: string = "Location"): ColumnDef<Ticket> => ({
  id: "facility",
  accessorFn: (row) => {
    const loc = row.location;
    if (!loc) return '';
    return loc.facility?.name ?? loc.facility_type?.name ?? '';
  },
  header,
  cell: ({ row }) => {
    const loc = row.original.location;
    const primary = loc?.facility?.name ?? loc?.facility_type?.name;
    if (!primary) return <div className="text-muted-foreground text-xs">—</div>;
    // e.g. {floor: "2", room: "204"} → "2, 204". Order comes from the server,
    // which only ever sends the keys that type declares.
    const detail = Object.values(loc?.values ?? {})
      .filter((v) => v !== null && v !== undefined && v !== '')
      .join(', ');
    return (
      <div>
        <div className="text-sm font-medium leading-tight">{primary}</div>
        {detail && (
          <div
            className="max-w-[160px] truncate text-xs leading-tight text-muted-foreground"
            title={detail}
          >
            {detail}
          </div>
        )}
      </div>
    );
  },
  enableSorting: false,
});

/** Trade — Plumbing, Electrical, Carpentry, … The column that tells one
 *  ticket from the next; every ticket in the system is Maintenance. */
export const tradeColumn = (header: string = "Trade"): ColumnDef<Ticket> => ({
  id: "tradeName",
  accessorFn: (row) => row.trade?.name ?? '',
  header: sortableHeader(header),
  cell: ({ row }) => <div>{(row.getValue("tradeName") as string) || "N/A"}</div>,
});

export const raisedByColumn = (header: string = "Raised By"): ColumnDef<Ticket> => ({
  id: "raised_by",
  accessorFn: (row) => row.raised_by?.full_name || row.raised_by?.username || '',
  header,
  cell: ({ row }) => <div>{(row.getValue("raised_by") as string) || "N/A"}</div>,
  enableSorting: false,
});

export const statusColumn = (header: string = "Status"): ColumnDef<Ticket> => ({
  accessorKey: "status",
  header: sortableHeader(header),
  // The escalation marker rides along with the status rather than taking a
  // column: `status` is the one column no variant hides, so this is what makes
  // an escalated job legible to the technician holding it and to the HOS on
  // their ordinary Tickets list — neither of whom could see it before.
  cell: ({ row }) => {
    const ticket = row.original;
    return (
      <div className="flex flex-wrap items-center gap-1">
        <StatusBadge status={row.getValue("status") as Ticket["status"]} />
        <EscalationBadge level={ticket.current_level} />
      </div>
    );
  },
});

export const priorityColumn = (header: string = "Priority"): ColumnDef<Ticket> => ({
  accessorKey: "priority",
  header,
  cell: ({ row }) => (
    <PriorityBadge priority={row.getValue("priority") as Ticket["priority"]} />
  ),
  enableSorting: false,
});

// SLA countdown column — used in the sla variant.
// Shows a compact progress bar with colour-shifting timer.
export const slaCountdownColumn = (header: string = "SLA"): ColumnDef<Ticket> => ({
  id: "sla_countdown",
  accessorKey: "resolution_due_at",
  header,
  cell: ({ row }) => {
    const ticket = row.original;
    return (
      <SLACountdown
        dueDate={ticket.resolution_due_at}
        createdAt={ticket.created_at}
        isPaused={!!ticket.paused_at}
        compact
      />
    );
  },
  enableSorting: false,
  size: 140,
});

export const createdAtColumn = (header: string = "Created"): ColumnDef<Ticket> => ({
  accessorKey: "created_at",
  header: sortableHeader(header),
  cell: ({ row }) => {
    const createdAt = row.getValue("created_at") as string;
    const date = new Date(createdAt);
    return <div title={date.toLocaleString()}>{relativeTime(createdAt)}</div>;
  },
});

export const updatedAtColumn = (header: string = "Updated"): ColumnDef<Ticket> => ({
  accessorKey: "updated_at",
  header: sortableHeader(header),
  cell: ({ row }) => {
    const updatedAt = row.getValue("updated_at") as string;
    if (!updatedAt) return <div>N/A</div>;
    const date = new Date(updatedAt);
    return <div title={date.toLocaleString()}>{relativeTime(updatedAt)}</div>;
  },
});

export const assignedToColumn = (header: string = "Assigned To"): ColumnDef<Ticket> => ({
  accessorKey: "assigned_to",
  header,
  cell: ({ row }) => {
    const who = row.original.assigned_to;
    const display = who?.full_name || who?.username;
    return display
      ? <div>{display}</div>
      : <div className="text-muted-foreground">Unassigned</div>;
  },
  enableSorting: false,
});

// ─── Pending work ─────────────────────────────────────────────────────────────

/** Why the job is stopped. Label comes from the server — no vocabulary here. */
export const pendingReasonColumn = (header: string = "Reason"): ColumnDef<Ticket> => ({
  id: "pending_reason",
  accessorFn: (row) => row.pending_reason_display ?? "",
  header,
  cell: ({ row }) => {
    const t = row.original;
    if (!t.pending_reason_display) return <div className="text-muted-foreground">—</div>;
    return (
      // The width cap is what makes `truncate` mean anything: a table cell
      // sizes to its content, so without one the note simply widened the
      // column — pushing the Resume buttons, the whole point of the Pending
      // Work page, off the right edge behind a horizontal scrollbar. Full text
      // stays in the title attribute.
      <div className="min-w-0 max-w-[20rem]">
        <div className="font-medium">{t.pending_reason_display}</div>
        {t.pending_reason_note && (
          <div className="truncate text-xs text-muted-foreground" title={t.pending_reason_note}>
            {t.pending_reason_note}
          </div>
        )}
      </div>
    );
  },
  enableSorting: false,
});

/**
 * How long the job has been on hold.
 *
 * Derived in the browser from `paused_at`, which is already in the payload —
 * no extra field, no extra query. Colour escalates with age because age is the
 * actionable part, and it is paired with the number so colour never carries the
 * meaning on its own.
 */
export const pendingForColumn = (header: string = "Pending for"): ColumnDef<Ticket> => ({
  id: "pending_for",
  accessorFn: (row) =>
    row.paused_at ? Date.now() - new Date(row.paused_at).getTime() : 0,
  header,
  cell: ({ row }) => {
    const pausedAt = row.original.paused_at;
    if (!pausedAt) return <div className="text-muted-foreground">—</div>;
    const days = Math.floor((Date.now() - new Date(pausedAt).getTime()) / 86_400_000);
    const tone =
      days >= 30 ? "text-status-escalated"
      : days >= 7 ? "text-status-progress"
      : "text-foreground";
    return (
      <div className={`font-medium tabular-nums ${tone}`}>
        {days === 0 ? "Today" : days === 1 ? "1 day" : `${days} days`}
      </div>
    );
  },
});

/**
 * Resume, and change-reason, on the row itself.
 *
 * The whole point of this table is that the HOS chases the blocker and then
 * clears it. Making them open the ticket to do that is four clicks to undo one
 * fact they already know.
 */
export function resumeActionColumn(options: {
  onResume: (ticket: Ticket) => void;
  onChangeReason: (ticket: Ticket) => void;
}): ColumnDef<Ticket> {
  return {
    id: "resume_actions",
    header: "Actions",
    cell: ({ row }) => (
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            options.onResume(row.original);
          }}
        >
          <Play className="mr-1 h-3.5 w-3.5" />
          Resume
        </Button>
        <Button
          variant="ghost"
          size="sm"
          title="Still blocked, but for a different reason"
          onClick={(e) => {
            e.stopPropagation();
            options.onChangeReason(row.original);
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
    ),
    enableSorting: false,
  };
}

// Always hidden. It exists only so DataTable's search box has a column to
// filter on — `TicketTable` builds the value it matches against.
export const searchFieldColumn = (): ColumnDef<Ticket> => ({
  accessorKey: "searchField",
  enableHiding: true,
});

// Actions column — only for user my-tickets variant.
// Shows "Rate & close" for resolved unrated tickets; "Rated" badge once feedback exists;
// otherwise a "View" hint (row is already clickable — no stopPropagation here) so the
// column never renders an empty gap for open/assigned/in_progress/pending/closed tickets.
export function rateAndCloseColumn(options: {
  onRate: (ticket: Ticket) => void;
}): ColumnDef<Ticket> {
  return {
    id: "rate_actions",
    header: "Actions",
    cell: ({ row }) => {
      const ticket = row.original;
      // `has_feedback`, not `feedback`: the list serializer sends the flag and
      // only the detail one nests the object, so `ticket.feedback` is always
      // undefined here — "Rate & close" never went away and "Rated" was
      // unreachable. AwaitingRatingBanner reads the flag on these same rows.
      if (ticket.status === "resolved" && !ticket.has_feedback) {
        return (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              options.onRate(ticket);
            }}
          >
            Rate &amp; close
          </Button>
        );
      }
      if (ticket.status === "resolved" && ticket.has_feedback) {
        return (
          <Badge variant="outline" className="text-xs">
            Rated
          </Badge>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Eye className="h-3.5 w-3.5" />
          View
        </span>
      );
    },
    enableSorting: false,
    size: 130,
  };
}
