import { useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { RoleLayout } from '@/components/layout/RoleLayout';
import { TicketDetailPage } from '@/app/dashboard/tickets/TicketDetailPage';
import { TicketCreationWizard } from '@/components/shared/ticket/TicketCreationWizard';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import MyTicketsPage from '@/features/user/MyTicketsPage';
import type { RoleNavConfig } from '@/config/roleNav';

export interface SectionCtx {
  onTicketSelect: (id: number | null) => void;
  userId?: number;
}

interface RoleDashboardLayoutProps {
  nav: RoleNavConfig;
  sections: (ctx: SectionCtx) => Record<string, ReactNode>;
  renderWrapper?: (node: ReactNode) => ReactNode;
}

export function RoleDashboardLayout({ nav, sections, renderWrapper }: RoleDashboardLayoutProps) {
  const location = useLocation();
  const userData = useAuthStore((s) => s.user);
  const { isMyRequests } = useUIStore();
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const getSection = (pathname: string): string => {
    const sub = pathname.split('/').filter(Boolean)[1] ?? '';
    return nav.sectionFromPath[sub] ?? 'dashboard';
  };

  const [activeSection, setActiveSection] = useState<string>(getSection(location.pathname));
  const [prevPathname, setPrevPathname] = useState(location.pathname);
  const [prevIsMyRequests, setPrevIsMyRequests] = useState(isMyRequests);

  if (prevPathname !== location.pathname) {
    setPrevPathname(location.pathname);
    setSelectedTicketId(null);
    setActiveSection(getSection(location.pathname));
  }

  if (prevIsMyRequests !== isMyRequests) {
    setPrevIsMyRequests(isMyRequests);
    setSelectedTicketId(null);
  }

  const displayTitle = selectedTicketId !== null
    ? 'Ticket Detail'
    : isMyRequests
      ? 'My Requests'
      : nav.headerTitle[activeSection] ?? 'Dashboard';

  const sectionMap = sections({ onTicketSelect: setSelectedTicketId, userId: userData?.id });
  const activeNode = sectionMap[activeSection] ?? sectionMap.dashboard ?? null;

  const content = isMyRequests
    ? (
      <MyTicketsPage
        onNavigate={(s) => { if (s === 'submitTicket') setWizardOpen(true); }}
        onTicketSelect={setSelectedTicketId}
      />
    )
    : (renderWrapper ? renderWrapper(activeNode) : <>{activeNode}</>);

  return (
    <RoleLayout
      activeSection={activeSection}
      onSectionChange={(s) => {
        setSelectedTicketId(null);
        setActiveSection(s);
      }}
      role={userData?.role || nav.defaultRole}
      title={displayTitle}
      currentUser={userData}
      loading={false}
    >
      {content}

      <TicketDetailPage
        open={selectedTicketId !== null}
        ticketId={selectedTicketId}
        onClose={() => setSelectedTicketId(null)}
      />

      <TicketCreationWizard
        isOpen={wizardOpen}
        onOpenChange={setWizardOpen}
      />
    </RoleLayout>
  );
}

export default RoleDashboardLayout;
