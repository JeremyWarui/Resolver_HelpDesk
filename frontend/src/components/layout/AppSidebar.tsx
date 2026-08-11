import { NavLink } from 'react-router-dom';
import { LogOut, PanelLeftClose, PanelLeftOpen, Inbox, Briefcase, UserCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useRoleContext } from '@/lib/auth/roleContext';
import { useUIStore } from '@/stores/uiStore';
import { useLogout } from '@/hooks/useLogout';
import { SIDEBAR_CONFIG } from '@/constants/sidebarConfig';
import type { UserRole } from '@/types';

const ROLE_BASE: Record<UserRole, string> = {
  user: '/user',
  technician: '/technician',
  hos: '/section-head',
  hod: '/hod',
  manager: '/manager',
  admin: '/dashboard',
};

const SECTION_PATH: Record<string, string> = {
  dashboard:      '',
  userTickets:    '/tickets',
  submitTicket:   '/new',
  assignedTickets: '/assigned',
  report:         '/reports',
  tickets:        '/tickets',
  pending:        '/pending',
  escalated:      '/escalated',
  technicians:    '/technicians',
  sections:       '/sections',
  reports:        '/reports',
  analytics:      '/analytics',
  schedule:       '/schedule',
  facilities:     '/facilities',
  campuses:       '/campuses',
  departments:    '/departments',
  inventory:      '/catalogue',
  users:          '/users',
  sla:            '/sla',
  feedback:       '/feedback',
  'sla-rules':    '/sla-rules',
  workflows:      '/workflows',
  'audit-log':    '/audit-log',
  settings:       '/settings',
};

export function AppSidebar() {
  const { role } = useRoleContext();
  const { sidebarOpen, toggleSidebar, isMyRequests, toggleMyRequests, setMyRequests } = useUIStore();
  const { handleLogout } = useLogout();

  // Pure requesters (role: null, SoT R15) use the 'user' sidebar config.
  const effectiveRole = role ?? 'user';
  const config = SIDEBAR_CONFIG[effectiveRole];
  const base = ROLE_BASE[effectiveRole];

  return (
    <aside
      className={cn(
        'hidden sm:flex flex-col h-screen border-r border-border bg-card shrink-0 transition-[width] duration-200 overflow-hidden',
        sidebarOpen ? 'w-52' : 'w-14',
      )}
    >
      {/* Brand + toggle */}
      <div className={cn(
        'flex items-center h-14 border-b border-border px-3 shrink-0',
        sidebarOpen ? 'justify-between' : 'justify-center',
      )}>
        {sidebarOpen && (
          <span className="text-base font-bold text-primary tracking-tight truncate">
            Resolver
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={toggleSidebar}
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {sidebarOpen
            ? <PanelLeftClose className="h-4 w-4" />
            : <PanelLeftOpen className="h-4 w-4" />
          }
        </Button>
      </div>

      {/* Role subtitle */}
      {sidebarOpen && config.subtitle && (
        <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {config.subtitle}
        </p>
      )}

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {config.items.map(({ id, label, icon: Icon }) => {
          const href = base + (SECTION_PATH[id] ?? '');
          const isBase = (SECTION_PATH[id] ?? '') === '';
          return (
            <NavLink
              key={id}
              to={href}
              end={isBase}
              // Navigation always exits My Requests mode — otherwise the layouts
              // keep rendering the requester view and sidebar clicks appear dead
              // (isMyRequests is persisted, so this survived reloads too).
              onClick={() => setMyRequests(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-2.5 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  !sidebarOpen && 'justify-center px-0',
                )
              }
              title={!sidebarOpen ? label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {sidebarOpen && <span className="truncate">{label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Context switch — Staff workspace ↔ My Requests (universal requester §1.2) */}
      {effectiveRole !== 'user' && (
        <div className="shrink-0 p-2 border-t border-border">
          <button
            onClick={toggleMyRequests}
            className={cn(
              'flex items-center gap-3 w-full px-2.5 py-2 rounded-md text-sm font-medium transition-colors',
              isMyRequests
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              !sidebarOpen && 'justify-center px-0',
            )}
            title={!sidebarOpen ? (isMyRequests ? 'Staff workspace' : 'My Requests') : undefined}
          >
            {isMyRequests
              ? <Briefcase className="h-4 w-4 shrink-0" />
              : <Inbox className="h-4 w-4 shrink-0" />
            }
            {sidebarOpen && (
              <span>{isMyRequests ? 'Staff workspace' : 'My Requests'}</span>
            )}
          </button>
        </div>
      )}

      {/* Profile + Logout */}
      <div className="shrink-0 p-2 border-t border-border space-y-0.5">
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 w-full px-2.5 py-2 rounded-md text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              !sidebarOpen && 'justify-center px-0',
            )
          }
          title={!sidebarOpen ? 'My Profile' : undefined}
        >
          <UserCircle className="h-4 w-4 shrink-0" />
          {sidebarOpen && <span>My Profile</span>}
        </NavLink>
        <button
          onClick={handleLogout}
          className={cn(
            'flex items-center gap-3 w-full px-2.5 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors',
            !sidebarOpen && 'justify-center px-0',
          )}
          title={!sidebarOpen ? 'Logout' : undefined}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {sidebarOpen && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
