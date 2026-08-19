/* eslint-disable react-refresh/only-export-components */
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

// Utility function to truncate text — guards against undefined/null values
const truncateText = (text: string | undefined | null, maxLength: number) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
};

// Utility function to format relative time
const formatRelativeTime = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInHours = diffInMs / (1000 * 60 * 60);

  if (diffInHours < 24) {
    // Singular at 1, and "Just now" under a minute — this rendered "1 hours
    // ago" and, for a ticket seconds old, "0 minutes ago".
    if (diffInHours < 1) {
      const mins = Math.floor(diffInMs / (1000 * 60));
      if (mins < 1) return 'Just now';
      return `${mins} ${mins === 1 ? 'minute' : 'minutes'} ago`;
    }
    const hrs = Math.floor(diffInHours);
    return `${hrs} ${hrs === 1 ? 'hour' : 'hours'} ago`;
  }
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

// Column definitions
export const ticketNoColumn = <T,>(header: string = "Ticket ID"): ColumnDef<T> => ({
  accessorKey: "ticket_no",
  header: sortableHeader(header),
  cell: ({ row }) => <div>{row.getValue("ticket_no")}</div>,
});

export const ticketTitleColumn = <T,>(header: string = "Service"): ColumnDef<T> => ({
  // Tickets have no "title" field — use service_item.name as the display label.
  id: "title",
  accessorFn: (row) => {
    const t = row as unknown as Ticket;
    return t?.service_item?.name ?? t?.description ?? '';
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

export const descriptionColumn = <T,>(header: string = "Description"): ColumnDef<T> => ({
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
 * Reads `location`, not a top-level `facility` — a Ticket has never had one, so
 * this column printed an em dash on every row of every table. It was hidden in
 * every variant, which is why nobody saw it; making it visible on Pending Work
 * is what surfaced it.
 *
 * Half the location types have no Facility row by design (`building_dropdown:
 * false` in the backend's TYPE_SPECS — staff quarters, equipment, grounds), so
 * a null facility is normal rather than missing data. Those fall back to the
 * type name, with `values` carrying the detail that identifies the place.
 */
export const facilityColumn = <T,>(header: string = "Location"): ColumnDef<T> => ({
  id: "facility",
  accessorFn: (row) => {
    const loc = (row as unknown as Ticket).location;
    if (!loc) return '';
    return loc.facility?.name ?? loc.facility_type?.name ?? '';
  },
  header,
  cell: ({ row }) => {
    const loc = (row.original as unknown as Ticket).location;
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

/**
 * Trade (sub_section) — Plumbing, Electrical, Carpentry, …
 *
 * The column ticket tables should carry instead of `section`. Maintenance is
 * the only section type, so the section column printed the same word on every
 * row of every table; the trade is what distinguishes one ticket from the next.
 */
export const tradeColumn = <T,>(header: string = "Trade"): ColumnDef<T> => ({
  id: "tradeName",
  accessorFn: (row) => {
    const r = row as Record<string, unknown>;
    const s = r.sub_section as { name?: string } | undefined;
    return s?.name ?? '';
  },
  header: sortableHeader(header),
  cell: ({ row }) => <div>{(row.getValue("tradeName") as string) || "N/A"}</div>,
});

export const raisedByColumn = <T,>(header: string = "Raised By"): ColumnDef<T> => ({
  id: "raised_by",
  accessorFn: (row) => {
    const r = row as Record<string, unknown>;
    const rb = r.raised_by;
    if (typeof rb === 'string') return rb;
    if (rb && typeof rb === 'object') {
      const u = rb as { full_name?: string; username?: string };
      return u.full_name || u.username || '';
    }
    return '';
  },
  header,
  cell: ({ row }) => <div>{(row.getValue("raised_by") as string) || "N/A"}</div>,
  enableSorting: false,
});

export const statusColumn = <T,>(header: string = "Status"): ColumnDef<T> => ({
  accessorKey: "status",
  header: sortableHeader(header),
  // The escalation marker rides along with the status rather than taking a
  // column: `status` is the one column no variant hides, so this is what makes
  // an escalated job legible to the technician holding it and to the HOS on
  // their ordinary Tickets list — neither of whom could see it before.
  cell: ({ row }) => {
    const ticket = row.original as unknown as Ticket;
    return (
      <div className="flex flex-wrap items-center gap-1">
        <StatusBadge status={row.getValue("status") as Ticket["status"]} />
        <EscalationBadge level={ticket.current_level} />
      </div>
    );
  },
});

export const priorityColumn = <T,>(header: string = "Priority"): ColumnDef<T> => ({
  accessorKey: "priority",
  header,
  cell: ({ row }) => (
    <PriorityBadge priority={row.getValue("priority") as Ticket["priority"]} />
  ),
  enableSorting: false,
});

export const dueDateColumn = <T,>(header: string = "Due By"): ColumnDef<T> => ({
  accessorKey: "resolution_due_at",
  header,
  cell: ({ row }) => {
    const due = row.getValue("resolution_due_at") as string | null | undefined;
    if (!due) return <span className="text-xs text-muted-foreground">—</span>;
    const date = new Date(due);
    const isOverdue = date < new Date();
    return (
      <span className={`text-xs ${isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
        {date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
      </span>
    );
  },
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

export const createdAtColumn = <T,>(header: string = "Created"): ColumnDef<T> => ({
  accessorKey: "created_at",
  header: sortableHeader(header),
  cell: ({ row }) => {
    const createdAt = row.getValue("created_at") as string;
    const date = new Date(createdAt);
    return <div title={date.toLocaleString()}>{formatRelativeTime(createdAt)}</div>;
  },
});

export const updatedAtColumn = <T,>(header: string = "Updated"): ColumnDef<T> => ({
  accessorKey: "updated_at",
  header: sortableHeader(header),
  cell: ({ row }) => {
    const updatedAt = row.getValue("updated_at") as string;
    if (!updatedAt) return <div>N/A</div>;
    const date = new Date(updatedAt);
    return <div title={date.toLocaleString()}>{formatRelativeTime(updatedAt)}</div>;
  },
});

export const assignedToColumn = <T,>(header: string = "Assigned To"): ColumnDef<T> => ({
  accessorKey: "assigned_to",
  header,
  cell: ({ row }) => {
    const assignedTo = row.getValue("assigned_to");
    if (!assignedTo) return <div className="text-muted-foreground">Unassigned</div>;
    if (typeof assignedTo === 'object') {
      const u = assignedTo as { full_name?: string; name?: string; username?: string };
      const display = u.full_name || u.name || u.username;
      return <div>{display ?? 'Unassigned'}</div>;
    }
    if (typeof assignedTo === 'string') return <div>{assignedTo}</div>;
    return <div className="text-muted-foreground">Unassigned</div>;
  },
  enableSorting: false,
});

// ─── Pending work ─────────────────────────────────────────────────────────────

/** Why the job is stopped. Label comes from the server — no vocabulary here. */
export const pendingReasonColumn = <T,>(header: string = "Reason"): ColumnDef<T> => ({
  id: "pending_reason",
  accessorFn: (row) => (row as unknown as Ticket).pending_reason_display ?? "",
  header,
  cell: ({ row }) => {
    const t = row.original as unknown as Ticket;
    if (!t.pending_reason_display) return <div className="text-muted-foreground">—</div>;
    return (
      <div className="min-w-0">
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
export const pendingForColumn = <T,>(header: string = "Pending for"): ColumnDef<T> => ({
  id: "pending_for",
  accessorFn: (row) => {
    const pausedAt = (row as unknown as Ticket).paused_at;
    return pausedAt ? Date.now() - new Date(pausedAt).getTime() : 0;
  },
  header,
  cell: ({ row }) => {
    const pausedAt = (row.original as unknown as Ticket).paused_at;
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
export function resumeActionColumn<T>(options: {
  onResume: (ticket: T) => void;
  onChangeReason: (ticket: T) => void;
}): ColumnDef<T> {
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

export const searchFieldColumn = <T,>(header: string = "Search Field"): ColumnDef<T> => ({
  accessorKey: "searchField",
  header,
  enableHiding: true,
});

// Action columns for different user roles
export function technicianViewColumn<T>(options: {
  setSelectedTicket: (ticket: T | null) => void;
  setIsTicketDialogOpen: (open: boolean) => void;
}): ColumnDef<T> {
  return {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      const ticket = row.original;
      return (
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            options.setSelectedTicket(ticket);
            options.setIsTicketDialogOpen(true);
          }}
        >
          <Eye className="mr-1 h-4 w-4" />
          View
        </Button>
      );
    },
  };
}

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
