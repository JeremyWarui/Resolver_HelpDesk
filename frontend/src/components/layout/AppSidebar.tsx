import { useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LogOut, Menu, PanelLeftClose, PanelLeftOpen, Inbox, Briefcase, UserCircle, MessageSquarePlus,
} from 'lucide-react';
import { SendFeedbackDialog } from '@/components/shared/feedback/SendFeedbackDialog';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useRole } from '@/lib/auth/permissions';
import { useUIStore } from '@/stores/uiStore';
import { useLogout } from '@/hooks/useAuth';
import { ROLE_NAV, sectionFromPath, sidebarSection, type SidebarCount } from '@/constants/roleNav';
import { useNavCounts } from '@/hooks/tickets/useNavCounts';
import { useNotifications } from '@/hooks/useNotifications';
import { useNewSystemFeedbackCount } from '@/hooks/useSystemFeedback';
import { ROLE_BASE } from '@/constants/roles';

/** Badge colour per counted queue — the same token the rows and status pills
 *  use, so the sidebar number and the thing it counts are the same colour.
 *  Both are dark enough at full saturation to carry white text. */
const COUNT_COLOR: Record<SidebarCount, string> = {
  escalated: 'var(--status-escalated)',
  pending: 'var(--status-pending)',
  notifications: 'var(--status-escalated)',
  systemFeedback: 'var(--status-open)',
};

/** The rail's surface: KSG brown, darkest at the top. The desktop rail and
 *  the phone drawer both wear it. */
const RAIL_SURFACE = 'bg-gradient-to-b from-ksg-brown-night to-ksg-brown-deep text-white';

/** The selected row: a glass tile tinted faintly lime, with a lime icon. */
const RAIL_ACTIVE = cn(
  'font-semibold bg-gradient-to-b from-ksg-green/12 to-ksg-green/5 [&_svg]:text-ksg-green',
  'shadow-[inset_0_1px_0_rgb(255_255_255/0.15),inset_0_0_0_1px_rgb(203_211_0/0.22),0_4px_12px_rgb(0_0_0/0.14)]',
);

/** Every entry on the rail — nav links, the context switch, profile, logout —
 *  is the same row: icon, optional label, active tint, and a collapse to a
 *  centred icon. */
function railItem(active: boolean, expanded: boolean): string {
  return cn(
    'flex items-center gap-3 w-full px-2.5 py-2.5 rounded-[10px] text-sm font-medium text-white transition-colors',
    active ? RAIL_ACTIVE : 'hover:bg-white/10',
    !expanded && 'justify-center px-0',
  );
}

interface RailProps {
  expanded: boolean;
  /** Collapses or expands the desktop rail. Absent in the phone drawer. */
  onToggle?: () => void;
  /** Called after any choice, so the phone drawer can close itself. */
  onNavigate?: () => void;
  /** Drawn in the phone drawer: sections marked `desktopOnly` are left out. */
  phone?: boolean;
}

/** The navigation itself, drawn by the desktop rail and the phone drawer alike. */
function RailContent({ expanded, onToggle, onNavigate, phone = false }: RailProps) {
  const role = useRole();
  const { isMyRequests, toggleMyRequests, setMyRequests } = useUIStore();
  const { handleLogout } = useLogout();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  // A plain requester has no role claim and gets the 'user' sidebar.
  const effectiveRole = role ?? 'user';
  const config = ROLE_NAV[effectiveRole];
  const base = ROLE_BASE[effectiveRole];

  // The ticket queues are skipped for sidebars with no queue item: two
  // requests per load for counts nothing renders. The unread count is the
  // polled notification feed, which the Notifications page shares.
  const wantsQueueCounts = config.items.some(
    (item) => item.count === 'escalated' || item.count === 'pending',
  );
  const queueCounts = useNavCounts(wantsQueueCounts);
  const { unreadCount } = useNotifications();
  const newFeedback = useNewSystemFeedbackCount(effectiveRole === 'admin');
  const navCounts: Record<SidebarCount, number> = {
    ...queueCounts,
    notifications: unreadCount,
    systemFeedback: newFeedback,
  };

  return (
    <>
      {/* Brand + toggle */}
      <div className={cn(
        'flex items-center h-14 border-b border-white/10 px-3 shrink-0',
        expanded ? 'justify-between' : 'justify-center',
      )}>
        {expanded && (
          <span className="text-base font-bold tracking-tight truncate">
            Resolver
          </span>
        )}
        {onToggle && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-white hover:bg-white/10 hover:text-white"
            onClick={onToggle}
            aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {expanded
              ? <PanelLeftClose className="h-4 w-4" />
              : <PanelLeftOpen className="h-4 w-4" />
            }
          </Button>
        )}
      </div>

      {expanded && config.subtitle && (
        <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/70">
          {config.subtitle}
        </p>
      )}

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1" aria-label="Sections">
        {config.items.filter((item) => !item.parent && !(phone && item.desktopOnly)).map(({ id, path, label, icon: Icon, count }) => {
          const href = base + (path ? `/${path}` : '');
          // The section on screen, or the one whose tab is: a tab's own address
          // lights the entry it belongs to.
          const current = pathname.startsWith(base)
            && sidebarSection(config, sectionFromPath(config, pathname)) === id;
          // Zero renders nothing: an empty queue should recede.
          const n = count ? navCounts[count] : 0;
          return (
            <Link
              key={id}
              to={href}
              // Navigation always exits My Requests mode, or the layout keeps
              // rendering the requester view and the click appears dead.
              onClick={() => {
                setMyRequests(false);
                onNavigate?.();
              }}
              className={railItem(current, expanded)}
              aria-current={current ? 'page' : undefined}
              title={!expanded ? (n > 0 ? `${label} — ${n}` : label) : undefined}
            >
              <span className="relative shrink-0">
                <Icon className="h-4 w-4" />
                {/* Collapsed to icons there is no room for a number, so the
                    badge becomes a dot and the count moves to the tooltip. */}
                {!expanded && n > 0 && (
                  <span
                    aria-hidden
                    className="absolute -right-1 -top-1 h-2 w-2 rounded-full ring-2 ring-ksg-brown-night"
                    style={{ backgroundColor: COUNT_COLOR[count!] }}
                  />
                )}
              </span>
              {expanded && <span className="truncate">{label}</span>}
              {expanded && n > 0 && (
                <span
                  className="ml-auto shrink-0 rounded-full px-1.5 min-w-5 text-center text-[11px] font-semibold leading-5 tabular-nums text-white"
                  style={{ backgroundColor: COUNT_COLOR[count!] }}
                  aria-label={`${n} ${label}`}
                >
                  {n > 99 ? '99+' : n}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Staff workspace ↔ the account's own raised tickets. */}
      {effectiveRole !== 'user' && (
        <div className="shrink-0 p-2 border-t border-white/10">
          <button
            onClick={() => {
              // Off the workspace (the profile page) there is nothing to toggle
              // in place, so go to the workspace already showing My Requests.
              if (pathname.startsWith(base)) {
                toggleMyRequests();
              } else {
                setMyRequests(true);
                navigate(base);
              }
              onNavigate?.();
            }}
            className={railItem(isMyRequests, expanded)}
            title={!expanded ? (isMyRequests ? 'Staff workspace' : 'My Requests') : undefined}
          >
            {isMyRequests
              ? <Briefcase className="h-4 w-4 shrink-0" />
              : <Inbox className="h-4 w-4 shrink-0" />
            }
            {expanded && <span>{isMyRequests ? 'Staff workspace' : 'My Requests'}</span>}
          </button>
        </div>
      )}

      <div className="shrink-0 p-2 border-t border-white/10 space-y-1">
        {/* The admin is who reads it, so the admin has nothing to send. */}
        {effectiveRole !== 'admin' && (
          <button
            onClick={() => setFeedbackOpen(true)}
            className={railItem(false, expanded)}
            title={!expanded ? 'Send feedback' : undefined}
          >
            <MessageSquarePlus className="h-4 w-4 shrink-0" />
            {expanded && <span>Send feedback</span>}
          </button>
        )}
        <NavLink
          to="/profile"
          onClick={() => {
            setMyRequests(false);
            onNavigate?.();
          }}
          className={({ isActive }) => railItem(isActive, expanded)}
          title={!expanded ? 'My Profile' : undefined}
        >
          <UserCircle className="h-4 w-4 shrink-0" />
          {expanded && <span>My Profile</span>}
        </NavLink>
        <button
          onClick={handleLogout}
          className={railItem(false, expanded)}
          title={!expanded ? 'Logout' : undefined}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {expanded && <span>Logout</span>}
        </button>
      </div>

      <SendFeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  );
}

/** The collapsible rail, from the `sm` breakpoint up. It floats as a card
 *  inset from the window's edges. */
export function AppSidebar() {
  const { sidebarOpen, toggleSidebar } = useUIStore();

  return (
    <aside
      className={cn(
        'hidden sm:flex flex-col shrink-0 overflow-hidden transition-[width] duration-200',
        'm-2.5 mr-0 h-[calc(100dvh-1.25rem)] rounded-2xl shadow-[0_8px_24px_rgb(30_35_32/0.18)]',
        RAIL_SURFACE,
        sidebarOpen ? 'w-52' : 'w-14',
      )}
    >
      <RailContent expanded={sidebarOpen} onToggle={toggleSidebar} />
    </aside>
  );
}

/** Below `sm`: a menu button that opens the same navigation as a drawer. It
 *  carries a dot while anything is unread, since the drawer hides the badge. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const { unreadCount } = useNotifications();

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="sm:hidden relative h-9 w-9 shrink-0 -ml-2"
        onClick={() => setOpen(true)}
        aria-label={unreadCount > 0 ? `Open menu, ${unreadCount} unread` : 'Open menu'}
      >
        <Menu className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" aria-hidden />
        )}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className={cn('w-64 p-0 flex flex-col gap-0 border-0 sm:hidden', RAIL_SURFACE)}>
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <RailContent expanded phone onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
