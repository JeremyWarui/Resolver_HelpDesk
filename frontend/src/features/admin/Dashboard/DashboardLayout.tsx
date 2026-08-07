import RoleDashboardView from "@/features/shared/RoleDashboardView";

/**
 * Admin dashboard body. The implementation now lives in the shared,
 * role-scoped RoleDashboardView; this thin wrapper preserves the existing
 * default export so AdminLayout's import is unchanged.
 */
interface Props { onTicketSelect?: (id: number) => void; }
const MainContent = ({ onTicketSelect }: Props) => <RoleDashboardView role="admin" onTicketSelect={onTicketSelect} />;

export default MainContent;
