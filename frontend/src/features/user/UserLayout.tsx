import { RoleDashboardLayout } from '@/components/layout/RoleDashboardLayout';
import UserDashboard from './UserDashboard';
import MyTicketsPage from './MyTicketsPage';
import NotificationsPage from '@/features/shared/NotificationsPage';

/** Every section loads eagerly, unlike the other roles': `RoleDashboardLayout`
 *  already imports `MyTicketsPage` statically for the My Requests switch. */
const UserLayout = () => (
  <RoleDashboardLayout
    role="user"
    sections={({ onTicketSelect, onNavigate }) => ({
      dashboard:   <UserDashboard onNavigate={onNavigate} onTicketSelect={onTicketSelect} />,
      userTickets: <MyTicketsPage onNavigate={onNavigate} onTicketSelect={onTicketSelect} />,
      notifications: <NotificationsPage onTicketSelect={onTicketSelect} />,
    })}
  />
);

export default UserLayout;
