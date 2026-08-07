/**
 * MobileShell — the PWA entrypoint for technicians at /tech/mobile.
 *
 * Screens / tabs:
 *  tickets → MobileTicketList + MobileTicketDetail
 *  notifications → MobileNotifications
 *  settings → inline settings panel
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ticket, Bell, Settings, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useQuery } from '@tanstack/react-query';
import { getNotifications } from '@/lib/api/notifications';
import { MobileTicketList } from './MobileTicketList';
import { MobileTicketDetail } from './MobileTicketDetail';
import { MobileNotifications } from './MobileNotifications';
import { PushSubscriptionManager } from './PushSubscriptionManager';
import { OfflineQueue } from './OfflineQueue';
import type { Ticket as TicketType } from '@/types';

type Tab = 'tickets' | 'notifications' | 'settings';

function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return isOnline;
}

export function MobileShell() {
  const [tab, setTab] = useState<Tab>('tickets');
  const [selectedTicket, setSelectedTicket] = useState<TicketType | null>(null);
  const isOnline = useOnlineStatus();
  const clearUser = useAuthStore(s => s.clearUser);
  const user = useAuthStore(s => s.user);
  const navigate = useNavigate();

  const displayName = user
    ? (user.first_name ? `${user.first_name} ${user.last_name ?? ''}`.trim() : user.username)
    : 'Technician';

  // Unread notification count for the badge
  const { data: notifs } = useQuery({
    queryKey: ['mobile-notifications'],
    queryFn: getNotifications,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
  const unreadCount = notifs?.filter(n => !n.read).length ?? 0;

  const handleSelectTicket = (ticket: TicketType) => {
    setSelectedTicket(ticket);
  };

  const handleBack = () => {
    setSelectedTicket(null);
  };

  const handleLogout = () => {
    clearUser();
    navigate('/auth', { replace: true });
  };

  const showingDetail = tab === 'tickets' && selectedTicket;

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50 overflow-hidden" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {/* Top header */}
      <header className="bg-white border-b border-border px-4 py-3 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Ticket className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none text-foreground">Resolver</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{displayName}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!isOnline && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
              Offline
            </span>
          )}
          <PushSubscriptionManager />
        </div>
      </header>

      {/* Screen content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'tickets' && !selectedTicket && (
          <MobileTicketList onSelect={handleSelectTicket} isOnline={isOnline} />
        )}
        {showingDetail && (
          <MobileTicketDetail ticket={selectedTicket} onBack={handleBack} isOnline={isOnline} />
        )}
        {tab === 'notifications' && (
          <MobileNotifications />
        )}
        {tab === 'settings' && (
          <MobileSettings displayName={displayName} onLogout={handleLogout} />
        )}
      </div>

      {/* Bottom tab bar — hidden when viewing ticket detail (full-screen feel) */}
      {!showingDetail && (
        <nav
          className="bg-white border-t border-border shrink-0 flex"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <BottomTab
            icon={Ticket}
            label="Tickets"
            active={tab === 'tickets'}
            onClick={() => { setSelectedTicket(null); setTab('tickets'); }}
          />
          <BottomTab
            icon={Bell}
            label="Notifications"
            active={tab === 'notifications'}
            badge={unreadCount > 0 ? unreadCount : undefined}
            onClick={() => setTab('notifications')}
          />
          <BottomTab
            icon={Settings}
            label="Settings"
            active={tab === 'settings'}
            onClick={() => setTab('settings')}
          />
        </nav>
      )}

      <OfflineQueue isOnline={isOnline} />
    </div>
  );
}

// ── BottomTab ─────────────────────────────────────────────────────────────────

interface BottomTabProps {
  icon: React.ElementType;
  label: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
}

function BottomTab({ icon: Icon, label, active, badge, onClick }: BottomTabProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 flex flex-col items-center justify-center gap-1 py-2.5 relative',
        'text-muted-foreground active:bg-gray-50 transition-colors',
        active && 'text-primary'
      )}
    >
      <div className="relative">
        <Icon className="h-5 w-5" />
        {badge != null && (
          <span className="absolute -top-1 -right-1.5 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </div>
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

// ── MobileSettings ────────────────────────────────────────────────────────────

interface SettingsProps {
  displayName: string;
  onLogout: () => void;
}

function MobileSettings({ displayName, onLogout }: SettingsProps) {
  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-y-auto">
      {/* Profile card */}
      <div className="mx-3 mt-4 bg-white rounded-xl border border-border p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-sm font-bold text-primary">
            {displayName.charAt(0).toUpperCase()}
          </span>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{displayName}</p>
          <p className="text-xs text-muted-foreground">Technician</p>
        </div>
      </div>

      {/* Push status */}
      <div className="mx-3 mt-3 bg-white rounded-xl border border-border divide-y divide-border/70">
        <div className="px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-foreground">Push notifications</span>
          <PushStatusLabel />
        </div>
        <div className="px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-foreground">App version</span>
          <span className="text-xs text-muted-foreground">Resolver PWA</span>
        </div>
      </div>

      {/* Logout */}
      <div className="mx-3 mt-3">
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-destructive/10 text-destructive text-sm font-semibold active:opacity-80"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}

function PushStatusLabel() {
  if (!('Notification' in window)) return <span className="text-xs text-muted-foreground">Unsupported</span>;
  const perm = Notification.permission;
  if (perm === 'granted') return <span className="text-xs text-green-600 font-medium">Enabled</span>;
  if (perm === 'denied') return <span className="text-xs text-destructive font-medium">Blocked</span>;
  return <span className="text-xs text-muted-foreground">Not yet set</span>;
}
