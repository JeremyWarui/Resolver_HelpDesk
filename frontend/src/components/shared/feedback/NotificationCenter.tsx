import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useNotificationStore } from '@/stores/notificationStore';
import { NotificationItem } from './NotificationItem';

const MAX_VISIBLE = 8;

export function NotificationCenter() {
  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const clearAll = useNotificationStore((s) => s.clearAll);

  const visible = notifications.slice(0, MAX_VISIBLE);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-80 p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 pr-10 flex-row items-center justify-between space-y-0">
          <SheetTitle className="text-base">Notifications</SheetTitle>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={markAllRead}
            >
              Mark all read
            </Button>
          )}
        </SheetHeader>

        <Separator />

        {visible.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground py-12">
            <Bell className="h-8 w-8 opacity-40" />
            <p className="text-sm">No notifications yet</p>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="py-1">
              {visible.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkRead={markRead}
                />
              ))}
            </div>
          </ScrollArea>
        )}

        {notifications.length > 0 && (
          <>
            <Separator />
            <div className="px-4 py-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-8 text-xs text-muted-foreground"
                onClick={clearAll}
              >
                Clear all
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
