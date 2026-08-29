import type { ReactNode } from 'react';
import type { User } from '@/types';
import { AppSidebar } from './AppSidebar';
import { NotificationCenter } from '@/components/shared/feedback/NotificationCenter';

interface RoleLayoutProps {
  title: string;
  currentUser?: User | null;
  children: ReactNode;
}

export function RoleLayout({ title, currentUser, children }: RoleLayoutProps) {
  const displayName = currentUser
    ? (currentUser.first_name
        ? `${currentUser.first_name} ${currentUser.last_name ?? ''}`.trim()
        : currentUser.username)
    : null;

  return (
    <div className="flex h-screen bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top header bar */}
        <header className="h-14 shrink-0 border-b border-border bg-card flex items-center justify-between px-5">
          <h1 className="text-lg font-semibold text-foreground truncate">{title}</h1>
          <div className="flex items-center gap-3">
            {displayName && (
              <span className="text-xs text-muted-foreground hidden sm:block">{displayName}</span>
            )}
            <NotificationCenter />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
