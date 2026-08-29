import { AlertCircle, Wrench } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useCatalog } from '@/hooks/useCatalogue';
import { TRADE_ICONS } from '@/constants/catalogue';
import type { TicketQuickStart } from '@/components/shared/ticket/TicketCreationWizard';

// The requester's view of the catalogue: one card per kind of maintenance work.
//
// Internally these are trades — the trade that scopes a technician. The
// requester is never shown that word: they are picking a kind of work, and who
// ends up doing it is the system's problem, not theirs.
//
// A card names the trade and nothing else. The faults under it are the wizard's
// first step, and listing them here as well made the requester choose a service
// twice: once from a card that showed four of the trade's five or six items
// behind a "more" toggle, then again from the full list the wizard opens on.

// ── Theme per service ─────────────────────────────────────────────────────────
//
// Keyed on the seeded code. An unknown code still renders, in grey — a new
// service should appear the day it is seeded, not the day the frontend ships.

// Colour only — the icon comes from TRADE_ICONS, shared with the wizard.
interface ServiceTheme {
  color: string;
  lightBg: string;
}

const SERVICE_THEMES: Record<string, ServiceTheme> = {
  CARP:  { color: '#854F0B', lightBg: 'bg-amber-100 dark:bg-amber-950/50' },
  MAS:   { color: '#5F5E5A', lightBg: 'bg-stone-200 dark:bg-stone-700/50' },
  PAINT: { color: '#534AB7', lightBg: 'bg-violet-100 dark:bg-violet-950/50' },
  PLUMB: { color: '#185FA5', lightBg: 'bg-blue-100 dark:bg-blue-950/50' },
  ELEC:  { color: '#A37A00', lightBg: 'bg-yellow-100 dark:bg-yellow-950/50' },
};

const FALLBACK_THEME: ServiceTheme = {
  color: '#6B7280',
  lightBg: 'bg-gray-100 dark:bg-gray-800/50',
};

interface QuickActionsProps {
  /** The trade the requester picked. The wizard opens on that trade's fault
   *  list, which is where a service item is actually chosen. */
  onServiceSelect: (quickStart: TicketQuickStart) => void;
}

const QuickActions = ({ onServiceSelect }: QuickActionsProps) => {
  // The same list the wizard opens on: every campus runs all five trades.
  const { data: services = [], isLoading, error } = useCatalog();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground gap-2">
        <AlertCircle className="h-8 w-8 text-destructive opacity-60" />
        <p className="text-sm font-medium text-destructive">Could not load services</p>
        <p className="text-xs">{error instanceof Error ? error.message : 'Please try again.'}</p>
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground gap-2">
        <Wrench className="h-8 w-8 opacity-20" />
        <p className="text-sm">No maintenance services available at your campus.</p>
        <p className="text-xs opacity-70">Contact your administrator to set up the service catalogue.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 items-start">
      {services.map((service) => {
        const theme = SERVICE_THEMES[service.code] ?? FALLBACK_THEME;
        // Indexed rather than called: a function returning a component reads as
        // one created during render.
        const ServiceIcon = TRADE_ICONS[service.code] ?? Wrench;

        return (
          <button
            key={service.id}
            type="button"
            onClick={() => onServiceSelect({ tradeCode: service.code })}
            className="flex w-full flex-col items-center gap-2.5 rounded-xl border border-border bg-card p-4 text-center transition-colors hover:border-primary/40 hover:bg-muted/40"
          >
            <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', theme.lightBg)}>
              <ServiceIcon className="h-5 w-5" style={{ color: theme.color }} />
            </div>
            <span className="text-[13px] font-semibold leading-tight text-foreground">
              {service.name} Services
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default QuickActions;
