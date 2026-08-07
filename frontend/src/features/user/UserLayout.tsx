import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ComingSoonSection from '@/components/shared/ComingSoonSection';
import { RoleLayout } from '@/components/layout/RoleLayout';
import { useAuthStore } from '@/stores/authStore';
import UserDashboard from './UserDashboard';
import MyTicketsPage from './MyTicketsPage';
import { TicketCreationWizard } from '@/components/shared/ticket/TicketCreationWizard';
import { TicketDetailPage } from '@/app/dashboard/tickets/TicketDetailPage';

const PATH_TO_SECTION: Record<string, string> = {
  '/user/tickets':  'userTickets',
  '/user/settings': 'settings',
};

const UserLayoutContent = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isCreateTicketOpen, setIsCreateTicketOpen] = useState(false);
  const [ticketRefreshKey, setTicketRefreshKey] = useState(0);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);

  const userData = useAuthStore((s) => s.user);

  const activeSection = PATH_TO_SECTION[location.pathname] ?? 'dashboard';
  const [prevSection, setPrevSection] = useState(activeSection);

  if (prevSection !== activeSection) {
    setPrevSection(activeSection);
    if (activeSection !== 'userTickets') setSelectedTicketId(null);
  }

  // /user/new opens the wizard from any page — it maps to the 'dashboard'
  // section, so a section-change check would miss dashboard → New Ticket.
  useEffect(() => {
    if (location.pathname === '/user/new') {
      setIsCreateTicketOpen(true);
      navigate('/user', { replace: true });
    }
  }, [location.pathname, navigate]);

  const handleTicketCreated = () => {
    setTicketRefreshKey((prev) => prev + 1);
  };

  const handleSectionChange = (section: string) => {
    if (section === 'submitTicket') {
      setIsCreateTicketOpen(true);
      return;
    }
    const pathMap: Record<string, string> = {
      dashboard:   '/user',
      userTickets: '/user/tickets',
      settings:    '/user/settings',
    };
    navigate(pathMap[section] ?? '/user');
  };

  return (
    <>
      <RoleLayout
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        role={userData?.role || 'user'}
        title={selectedTicketId !== null ? 'Ticket Detail' : activeSection === 'userTickets' ? 'My Tickets' : activeSection === 'settings' ? 'Settings' : 'Dashboard'}
        currentUser={userData}
        loading={false}
      >
        <>
          {activeSection === 'dashboard' && (
            <UserDashboard
              key={`dashboard-${ticketRefreshKey}`}
              onNavigate={handleSectionChange}
              onTicketSelect={setSelectedTicketId}
            />
          )}
          {activeSection === 'userTickets' && (
            <MyTicketsPage
              key={`user-${ticketRefreshKey}`}
              onNavigate={handleSectionChange}
              onTicketSelect={setSelectedTicketId}
            />
          )}
          {activeSection === 'settings' && (
            <ComingSoonSection section='Settings' />
          )}
        </>

        <TicketDetailPage
          open={selectedTicketId !== null}
          ticketId={selectedTicketId}
          onClose={() => setSelectedTicketId(null)}
        />
      </RoleLayout>

      <TicketCreationWizard
        isOpen={isCreateTicketOpen}
        onOpenChange={setIsCreateTicketOpen}
        onSuccess={handleTicketCreated}
      />
    </>
  );
};

const UserLayout = () => <UserLayoutContent />;

export default UserLayout;
