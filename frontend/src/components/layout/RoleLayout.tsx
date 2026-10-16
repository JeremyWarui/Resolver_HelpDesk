import type { ReactNode } from 'react';
import { Monitor, X } from 'lucide-react';
import type { User } from '@/types';
import { AppSidebar, MobileNav } from './AppSidebar';
import { DESK_ROLES } from '@/constants/roles';
import { useRole } from '@/lib/auth/permissions';
import { useUIStore } from '@/stores/uiStore';

interface RoleLayoutProps {
  title: string;
  currentUser?: User | null;
  children: ReactNode;
}

export function RoleLayout({ title, currentUser, children }: RoleLayoutProps) {
  const role = useRole();
  const { isMyRequests, phoneNoticeDismissedBy, dismissPhoneNotice } = useUIStore();
  const deskNotice =
    !!currentUser && !!role && DESK_ROLES.includes(role) && !isMyRequests
    && !phoneNoticeDismissedBy.includes(currentUser.id);

  const displayName = currentUser
    ? (currentUser.first_name
        ? `${currentUser.first_name} ${currentUser.last_name ?? ''}`.trim()
        : currentUser.username)
    : null;

  return (
    <div className="flex h-dvh bg-gray-50">
      <AppSidebar />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* A faint frosted strip: translucent white over the canvas, one hairline below. */}
        <header className="h-14 shrink-0 flex items-center justify-between gap-2 px-3 sm:px-5 bg-white/70 backdrop-blur-sm border-b border-black/[0.06] shadow-[0_1px_2px_rgb(30_35_32/0.04)]">
          <div className="flex items-center gap-1 min-w-0">
            <MobileNav />
            <h1 className="text-xl font-semibold text-foreground truncate">{title}</h1>
          </div>
          {displayName && (
            <span
              data-testid="signed-in-as"
              className="text-base font-medium text-foreground truncate max-w-[40%] hidden sm:block"
            >
              {displayName}
            </span>
          )}
        </header>

        {deskNotice && (
          <div
            role="note"
            className="sm:hidden flex items-start gap-2 px-3 py-2 text-xs text-muted-foreground bg-muted/60 border-b"
          >
            <Monitor className="h-4 w-4 shrink-0 mt-px" aria-hidden />
            <p className="flex-1">
              These pages are laid out for a computer. They open here too; wide tables scroll sideways.
            </p>
            <button
              type="button"
              onClick={() => currentUser && dismissPhoneNotice(currentUser.id)}
              className="shrink-0 rounded p-0.5 hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
