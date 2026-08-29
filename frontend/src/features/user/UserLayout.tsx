import { RoleDashboardLayout } from '@/components/layout/RoleDashboardLayout';
import UserDashboard from './UserDashboard';
import MyTicketsPage from './MyTicketsPage';

/** Both sections load eagerly, unlike the other roles': the dashboard is the
 *  landing page, and `RoleDashboardLayout` already imports `MyTicketsPage`
 *  statically for the My Requests switch — so splitting it here would emit a
 *  chunk for something already in the shell's bundle. */
const UserLayout = () => (
  <RoleDashboardLayout
    role="user"
    sections={({ onTicketSelect, onNavigate }) => ({
      dashboard:   <UserDashboard onNavigate={onNavigate} onTicketSelect={onTicketSelect} />,
      userTickets: <MyTicketsPage onNavigate={onNavigate} onTicketSelect={onTicketSelect} />,
    })}
  />
);

export default UserLayout;
