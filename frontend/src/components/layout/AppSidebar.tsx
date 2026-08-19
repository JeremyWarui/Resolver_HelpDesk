import { NavLink } from 'react-router-dom';
import { LogOut, PanelLeftClose, PanelLeftOpen, Inbox, Briefcase, UserCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useRoleContext } from '@/lib/auth/roleContext';
import { useUIStore } from '@/stores/uiStore';
import { useLogout } from '@/hooks/useLogout';
import { SIDEBAR_CONFIG, type SidebarCount } from '@/constants/sidebarConfig';
import { useNavCounts } from '@/hooks/tickets/useNavCounts';
import { ROLE_BASE } from '@/constants/roleRoutes';

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

/** Badge colour per counted queue — the same token the rows and status pills
 *  use, so the sidebar number and the thing it counts are the same colour.
 *  Both are dark enough at full saturation to carry white text. */
const COUNT_COLOR: Record<SidebarCount, string> = {
  escalated: 'var(--status-escalated)',
  pending: 'var(--status-pending)',
};

export function AppSidebar() {
  const { role } = useRoleContext();
  const { sidebarOpen, toggleSidebar, isMyRequests, toggleMyRequests, setMyRequests } = useUIStore();
  const { handleLogout } = useLogout();

  // Pure requesters (role: null, SoT R15) use the 'user' sidebar config.
  const effectiveRole = role ?? 'user';
  const config = SIDEBAR_CONFIG[effectiveRole];
  const base = ROLE_BASE[effectiveRole];

  // Skipped for pure requesters and admins, whose sidebars carry no counted
  // item — asking for counts nothing renders would be two requests per load.
  const wantsCounts = config.items.some((item) => item.count);
  const navCounts = useNavCounts(wantsCounts);

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
        {config.items.map(({ id, label, icon: Icon, count }) => {
          const href = base + (SECTION_PATH[id] ?? '');
          const isBase = (SECTION_PATH[id] ?? '') === '';
          // Zero is not rendered at all: an empty queue should recede, and a
          // badge reading "0" draws the eye to precisely the item with nothing
          // in it.
          const n = count ? navCounts[count] : 0;
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
              title={
                !sidebarOpen
                  ? n > 0 ? `${label} — ${n}` : label
                  : undefined
              }
            >
              {/* `relative` so the collapsed-rail dot can anchor to the icon. */}
              <span className="relative shrink-0">
                <Icon className="h-4 w-4" />
                {/* Collapsed to the icon rail there is no room for a number, so
                    the badge degrades to a dot: it still says "something is in
                    here", and the count is in the tooltip. */}
                {!sidebarOpen && n > 0 && (
                  <span
                    aria-hidden
                    className="absolute -right-1 -top-1 h-2 w-2 rounded-full ring-2 ring-card"
                    style={{ backgroundColor: COUNT_COLOR[count!] }}
                  />
                )}
              </span>
              {sidebarOpen && <span className="truncate">{label}</span>}
              {sidebarOpen && n > 0 && (
                <span
                  className="ml-auto shrink-0 rounded-full px-1.5 min-w-5 text-center text-[11px] font-semibold leading-5 tabular-nums text-white"
                  style={{ backgroundColor: COUNT_COLOR[count!] }}
                  aria-label={`${n} ${label}`}
                >
                  {n > 99 ? '99+' : n}
                </span>
              )}
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
