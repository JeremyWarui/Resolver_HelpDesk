import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { RoleLayout } from '@/components/layout/RoleLayout';
import { TicketDetailPage } from '@/app/dashboard/TicketDetailPage';
import {
  TicketCreationWizard,
  type TicketQuickStart,
} from '@/components/shared/ticket/TicketCreationWizard';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import MyTicketsPage from '@/features/user/MyTicketsPage';
import { ROLE_NAV, sectionFromPath, sectionTitle } from '@/constants/roleNav';
import { ROLE_BASE } from '@/constants/roles';
import type { UserRole } from '@/types';

interface SectionCtx {
  onTicketSelect: (id: number | null) => void;
  /** Move to another of this role's sections, by nav id. A section that opens
   *  the wizard takes an optional pre-fill, so a page can send someone
   *  straight to a chosen service without mounting a second wizard of its
   *  own — the shell owns the only one. */
  onNavigate: (sectionId: string, quickStart?: TicketQuickStart) => void;
  userId?: number;
}

interface RoleDashboardLayoutProps {
  role: UserRole;
  sections: (ctx: SectionCtx) => Record<string, ReactNode>;
}

const PageLoading = () => (
  <div className="flex items-center justify-center h-64">
    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
    <span className="ml-2 text-muted-foreground">Loading page...</span>
  </div>
);

/**
 * The shell every signed-in role renders inside: sidebar, header, the active
 * section, and the two things reachable from anywhere — a ticket's detail and
 * the creation wizard.
 *
 * Which sections exist and where they live is `ROLE_NAV`; a layout supplies
 * only what each one renders.
 */
export function RoleDashboardLayout({ role, sections }: RoleDashboardLayoutProps) {
  const queryClient = useQueryClient();
  const nav = ROLE_NAV[role];
  const base = ROLE_BASE[role];
  const location = useLocation();
  const navigate = useNavigate();
  const userData = useAuthStore((s) => s.user);
  const { isMyRequests } = useUIStore();
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);

  const activeSection = sectionFromPath(nav, location.pathname);
  // A section that opens the wizard is an address, not a page: /user/new is
  // the wizard, reachable by link and by bookmark.
  const opensWizard = nav.items.find((item) => item.id === activeSection)?.opensWizard ?? false;

  // Seeded from the path so a direct load of that address opens it, then held
  // by the path check below.
  const [wizardOpen, setWizardOpen] = useState(opensWizard);
  const [quickStart, setQuickStart] = useState<TicketQuickStart | undefined>(undefined);
  const [prevPathname, setPrevPathname] = useState(location.pathname);
  const [prevIsMyRequests, setPrevIsMyRequests] = useState(isMyRequests);

  // A ticket's detail must not stay open over a different page.
  if (prevPathname !== location.pathname) {
    setPrevPathname(location.pathname);
    setSelectedTicketId(null);
    if (opensWizard) setWizardOpen(true);
  }
  if (prevIsMyRequests !== isMyRequests) {
    setPrevIsMyRequests(isMyRequests);
    setSelectedTicketId(null);
  }

  // The URL is the external system: the wizard is a dialog, so its address is
  // rewritten away once it has done its job.
  useEffect(() => {
    if (opensWizard) navigate(base, { replace: true });
  }, [opensWizard, base, navigate]);

  const handleNavigate = (sectionId: string, quick?: TicketQuickStart) => {
    const item = nav.items.find((i) => i.id === sectionId);
    if (item?.opensWizard) {
      setQuickStart(quick);
      setWizardOpen(true);
      return;
    }
    navigate(base + (item?.path ? `/${item.path}` : ''));
  };

  const displayTitle = selectedTicketId !== null
    ? 'Ticket Detail'
    : isMyRequests
      ? 'My Requests'
      : sectionTitle(nav, activeSection);

  const sectionMap = sections({
    onTicketSelect: setSelectedTicketId,
    onNavigate: handleNavigate,
    userId: userData?.id,
  });

  return (
    <RoleLayout title={displayTitle} currentUser={userData}>
      <Suspense fallback={<PageLoading />}>
        {isMyRequests
          ? (
            // Context switch: this account's own raised tickets, which
            // every role has, whatever else they can see.
            <MyTicketsPage onNavigate={handleNavigate} onTicketSelect={setSelectedTicketId} />
          )
          : (sectionMap[activeSection] ?? sectionMap[nav.items[0].id] ?? null)}
      </Suspense>

      <TicketDetailPage
        open={selectedTicketId !== null}
        ticketId={selectedTicketId}
        onClose={() => setSelectedTicketId(null)}
      />

      <TicketCreationWizard
        isOpen={wizardOpen}
        quickStart={quickStart}
        onOpenChange={(open) => {
          setWizardOpen(open);
          // Cleared on close so the next plain "New Ticket" opens at step 1.
          if (!open) setQuickStart(undefined);
        }}
        onSuccess={() => {
          // A new ticket belongs in every list and every figure on screen.
          queryClient.invalidateQueries({ queryKey: ['tickets'] });
          queryClient.invalidateQueries({ queryKey: ['analytics'] });
        }}
      />
    </RoleLayout>
  );
}
