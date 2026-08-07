import { useState, Suspense, lazy } from "react";
import { useLocation } from "react-router-dom";
import ComingSoonSection from "@/components/shared/ComingSoonSection";
import { RoleLayout } from "@/components/layout/RoleLayout";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";
import { TicketDetailPage } from "@/app/dashboard/tickets/TicketDetailPage";
import { TicketCreationWizard } from "@/components/shared/ticket/TicketCreationWizard";

const MyTicketsPage = lazy(() => import("@/features/user/MyTicketsPage"));

const MainContent = lazy(() => import("./Dashboard/DashboardLayout"));
const TicketsPage = lazy(() => import("./TicketsPage/TicketsPage"));
const TechniciansPage = lazy(() => import("./Technicians/TechniciansPage"));
const FacilitiesPage = lazy(() => import("./Facilities/FacilitiesPage"));
const SectionsPage = lazy(() => import("./Sections/SectionsPage"));
const ReportsPage = lazy(() => import("./Reports").then(module => ({ default: module.ReportsPageEnhanced })));
const OrganisationAnalyticsPage = lazy(() => import("./OrganisationAnalytics").then(m => ({ default: m.OrganisationAnalytics })));
const CampusesPage = lazy(() => import("./Campuses/CampusesPage"));
const DepartmentsPage = lazy(() => import("./Departments/DepartmentsPage"));
const ServicesPage = lazy(() => import("./ServicesPage"));
const UsersPage = lazy(() => import("./Users/UsersPage"));
const SLARulesPage = lazy(() => import("./SLARulesPage"));
const AuditLogPage = lazy(() => import("./AuditLogPage"));

const PageLoading = () => (
  <div className="flex items-center justify-center h-64">
    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
    <span className="ml-2 text-gray-600">Loading page...</span>
  </div>
);

const SECTION_FROM_PATH: Record<string, string> = {
  '': 'dashboard',
  tickets: 'tickets',
  reports: 'reports',
  analytics: 'analytics',
  schedule: 'schedule',
  technicians: 'technicians',
  facilities: 'facilities',
  sections: 'sections',
  campuses: 'campuses',
  departments: 'departments',
  catalogue: 'inventory',
  users: 'users',
  'sla-rules': 'sla-rules',
  'audit-log': 'audit-log',
  settings: 'settings',
};

const headerTitles: Record<string, string> = {
  dashboard: "Dashboard",
  tickets: "Tickets",
  reports: "Reports",
  analytics: "Organisation Analytics",
  schedule: "Schedule",
  technicians: "Technicians",
  facilities: "Facilities",
  sections: "Sections",
  campuses: "Campuses",
  departments: "Departments",
  inventory: "Service Catalogue",
  users: "Users",
  'sla-rules': "SLA Rules",
  'audit-log': "Audit Log",
  settings: "Settings",
};

function AdminLayoutContent() {
  const location = useLocation();
  const userData = useAuthStore((s) => s.user);
  const { isMyRequests } = useUIStore();
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  // Derive active section from URL path
  const getSection = (pathname: string): string => {
    const segments = pathname.split('/').filter(Boolean);
    const sub = segments[1] ?? '';
    return SECTION_FROM_PATH[sub] ?? 'dashboard';
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
      : (headerTitles[activeSection] ?? activeSection);

  return (
    <RoleLayout
      activeSection={activeSection}
      onSectionChange={(s) => { setSelectedTicketId(null); setActiveSection(s); }}
      role={userData?.role || 'admin'}
      title={displayTitle}
      currentUser={userData}
      // Never pass a data-fetch loading flag here: RoleLayout renders it as a
      // full-screen z-50 overlay that swallows every click (sidebar included)
      // while the analytics overview is slow — the dashboard widgets own their
      // loading skeletons instead.
      loading={false}
    >
      <Suspense fallback={<PageLoading />}>
          {isMyRequests ? (
            // Context switch (§1.2) — admin's own raised tickets, same as every role.
            <MyTicketsPage
              onNavigate={(s) => { if (s === 'submitTicket') setWizardOpen(true); }}
              onTicketSelect={setSelectedTicketId}
            />
          ) : (
          <>
          {activeSection === "dashboard" && <MainContent onTicketSelect={setSelectedTicketId} />}
          {activeSection === "tickets" && <TicketsPage onTicketSelect={setSelectedTicketId} />}
          {activeSection === "reports" && <ReportsPage />}
          {activeSection === "analytics" && <OrganisationAnalyticsPage />}
          {activeSection === "technicians" && <TechniciansPage />}
          {activeSection === "sections" && <SectionsPage />}
          {activeSection === "facilities" && <FacilitiesPage />}
          {activeSection === "campuses" && <CampusesPage />}
          {activeSection === "departments" && <DepartmentsPage />}
          {activeSection === "inventory" && <ServicesPage />}
          {activeSection === "users" && <UsersPage />}
          {activeSection === "sla-rules" && <SLARulesPage />}
          {activeSection === "audit-log" && <AuditLogPage />}
          {activeSection === "schedule" && <ComingSoonSection section="Schedule" />}
          {activeSection === "settings" && <ComingSoonSection section="Settings" />}
          </>
          )}
        </Suspense>

      <TicketDetailPage
        open={selectedTicketId !== null}
        ticketId={selectedTicketId}
        onClose={() => setSelectedTicketId(null)}
      />

      <TicketCreationWizard isOpen={wizardOpen} onOpenChange={setWizardOpen} />
    </RoleLayout>
  );
}

export default function AdminLayout() {
  return <AdminLayoutContent />;
}
