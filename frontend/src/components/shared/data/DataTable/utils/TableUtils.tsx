/* eslint-disable react-refresh/only-export-components */
import { type ColumnDef } from "@tanstack/react-table";
import { ChevronDown, Eye, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/ticket/StatusBadge";
import { PriorityBadge } from "@/components/shared/ticket/PriorityBadge";
import { SLACountdown } from "@/components/shared/ticket/SLACountdown";
import type { Ticket } from "@/types";

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
    if (diffInHours < 1) {
      return `${Math.floor(diffInMs / (1000 * 60))} minutes ago`;
    }
    return `${Math.floor(diffInHours)} hours ago`;
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
  header: ({ column }) => (
    <div className="flex items-center space-x-1">
      <span>{header}</span>
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting()}
        className="p-0 h-4 w-4"
      >
        <ChevronDown className="h-3 w-3" />
      </Button>
    </div>
  ),
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

export const facilityColumn = <T,>(header: string = "Location"): ColumnDef<T> => ({
  accessorKey: "facility",
  header,
  cell: ({ row }) => {
    const val = row.getValue("facility");
    const facilityName = typeof val === 'object' && val !== null
      ? (val as { name: string }).name
      : (val as string | undefined);
    if (!facilityName) return <div className="text-muted-foreground text-xs">—</div>;
    const ticket = row.original as Record<string, unknown>;
    const sub = (ticket.room_name as string | null) || (ticket.location_detail as string | null);
    return (
      <div>
        <div className="text-sm font-medium leading-tight">{facilityName}</div>
        {sub && <div className="text-xs text-muted-foreground leading-tight truncate max-w-[140px]">{sub}</div>}
      </div>
    );
  },
  enableSorting: false,
});

export const sectionColumn = <T,>(header: string = "Section"): ColumnDef<T> => ({
  id: "sectionName",
  accessorFn: (row) => {
    const r = row as Record<string, unknown>;
    // Backend _SectionMinSerializer returns section_type_name (the human name),
    // not a top-level `name` field.
    const s = r.section as { section_type_name?: string; name?: string } | undefined;
    return s?.section_type_name ?? s?.name ?? '';
  },
  header: ({ column }) => (
    <div className="flex items-center space-x-1">
      <span>{header}</span>
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting()}
        className="p-0 h-4 w-4"
      >
        <ChevronDown className="h-3 w-3" />
      </Button>
    </div>
  ),
  cell: ({ row }) => <div>{(row.getValue("sectionName") as string) || "N/A"}</div>,
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
  header: ({ column }) => (
    <div className="flex items-center space-x-1">
      <span>{header}</span>
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting()}
        className="p-0 h-4 w-4"
      >
        <ChevronDown className="h-3 w-3" />
      </Button>
    </div>
  ),
  cell: ({ row }) => (
    <StatusBadge status={row.getValue("status") as Ticket["status"]} />
  ),
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
  header: ({ column }) => (
    <div className="flex items-center space-x-1">
      <span>{header}</span>
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting()}
        className="p-0 h-4 w-4"
      >
        <ChevronDown className="h-3 w-3" />
      </Button>
    </div>
  ),
  cell: ({ row }) => {
    const createdAt = row.getValue("created_at") as string;
    const date = new Date(createdAt);
    return <div title={date.toLocaleString()}>{formatRelativeTime(createdAt)}</div>;
  },
});

export const updatedAtColumn = <T,>(header: string = "Updated"): ColumnDef<T> => ({
  accessorKey: "updated_at",
  header: ({ column }) => (
    <div className="flex items-center space-x-1">
      <span>{header}</span>
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting()}
        className="p-0 h-4 w-4"
      >
        <ChevronDown className="h-3 w-3" />
      </Button>
    </div>
  ),
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

export const searchFieldColumn = <T,>(header: string = "Search Field"): ColumnDef<T> => ({
  accessorKey: "searchField",
  header,
  enableHiding: true,
});

// Action columns for different user roles
export function userActionsColumn<T>(options: {
  setSelectedTicket: (ticket: T) => void;
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
          className="flex items-center space-x-1"
          onClick={(e) => {
            e.stopPropagation();
            options.setSelectedTicket(ticket);
            options.setIsTicketDialogOpen(true);
          }}
        >
          <Eye className="mr-1 h-4 w-4" />
          <span>View</span>
        </Button>
      );
    },
  };
}

export function AdminActionsColumn<T>(options: {
  technicians: string[];
  statuses: string[];
  setSelectedTicket: (ticket: T) => void;
  setIsTicketDialogOpen: (open: boolean) => void;
  setActiveTab?: (tab: "view" | "edit") => void;
}): ColumnDef<T> {
  return {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      const ticket = row.original;
      return (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              options.setSelectedTicket(ticket);
              options.setActiveTab?.("view");
              options.setIsTicketDialogOpen(true);
            }}
          >
            <Eye className="mr-1 h-4 w-4" />
            View
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              options.setSelectedTicket(ticket);
              options.setActiveTab?.("edit");
              options.setIsTicketDialogOpen(true);
            }}
          >
            <Edit className="mr-1 h-4 w-4" />
            Edit
          </Button>
        </div>
      );
    },
  };
}

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
      if (ticket.status === "resolved" && !ticket.feedback) {
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
      if (ticket.status === "resolved" && ticket.feedback) {
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
