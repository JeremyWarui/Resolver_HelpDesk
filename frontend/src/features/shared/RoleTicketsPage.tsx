import { Button } from "@/components/ui/button";
import { Plus, Download } from "lucide-react";
import TicketsTable from "@/features/admin/TicketsPage/TicketsTable";
import {
  AdminStatsCards,
  ManagerStatsCards,
  HODStatsCards,
  SectionHeadStatsCards,
} from "@/components/shared/data/StatCards";

export type TicketsRole = "admin" | "manager" | "hod" | "hos";

/**
 * Shared, role-scoped Tickets page.
 *
 * Lifted from the Admin TicketsPage (header + StatCards strip + filterable
 * TicketsTable titled "Tickets"). Every data source — the stat cards and the
 * ticket table — scopes server-side by the caller's JWT role, so the only
 * role-specific surface here is the header copy and which StatCards renders.
 */

// Role-specific StatCards component. Rendered with NO props — each component
// self-fetches its scoped data.
const STAT_CARDS: Record<TicketsRole, React.ComponentType> = {
  admin: AdminStatsCards,
  manager: ManagerStatsCards,
  hod: HODStatsCards,
  hos: SectionHeadStatsCards,
};

// Role-specific header copy. Admin text is preserved exactly as before.
const HEADER: Record<TicketsRole, { title: string; subtitle: string }> = {
  admin: { title: "All Tickets", subtitle: "Manage and track all maintenance tickets" },
  manager: { title: "Department Tickets", subtitle: "Tickets across your department" },
  hod: { title: "Tickets", subtitle: "Tickets in your campus department" },
  hos: { title: "Tickets", subtitle: "Tickets in your section(s)" },
};

interface Props {
  role: TicketsRole;
  onTicketSelect?: (ticketId: number) => void;
}

const RoleTicketsPage = ({ role, onTicketSelect }: Props) => {
  const StatCards = STAT_CARDS[role];
  const { subtitle } = HEADER[role];

  return (
    <div className="flex-1 overflow-y-auto p-3 bg-gray-50">
      <div className="flex justify-between mb-2">
        <div>
          <p className="text-sm text-gray-600">{subtitle}</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-1"
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button
            size="sm"
            className="flex items-center gap-1 bg-primary hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            New Ticket
          </Button>
        </div>
      </div>

      {/* Global stats (reuses same data from dashboard) */}
      <StatCards />

      {/* Tickets table with integrated quick filters */}
      <TicketsTable role={role} onTicketSelect={onTicketSelect} />
    </div>
  );
};

export default RoleTicketsPage;
