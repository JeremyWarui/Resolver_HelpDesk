import RoleDashboardView from "@/features/shared/RoleDashboardView";

/**
 * Manager dashboard homepage — now the shared, role-scoped RoleDashboardView.
 * All analytics/ticket/report endpoints scope server-side by JWT, so the
 * manager gets a real department overview (stats cards, flow/demand charts,
 * recent tickets, export) with no dead legacy fields.
 */
interface Props { onTicketSelect?: (id: number) => void; }
const ManagerDashboard = ({ onTicketSelect }: Props) => <RoleDashboardView role="manager" onTicketSelect={onTicketSelect} />;

export default ManagerDashboard;
