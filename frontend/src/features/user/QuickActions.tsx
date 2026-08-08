import { useState } from 'react';
import {
  ChevronDown, ChevronUp, AlertCircle,
  Hammer, BrickWall, PaintRoller, Droplets, Zap, Wrench,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useCatalog } from '@/hooks/catalog/useCatalog';
import type { CatalogSubSection } from '@/lib/api/catalogue';

// The requester's view of the catalogue.
//
// Internally these are sub-sections — the trade that scopes a technician. The
// requester is never shown that word: they are picking a kind of maintenance
// work, and who ends up doing it is the system's problem, not theirs.

// ── Theme per service ─────────────────────────────────────────────────────────
//
// Keyed on the seeded code. An unknown code still renders, in grey — a new
// service should appear the day it is seeded, not the day the frontend ships.

interface ServiceTheme {
  color: string;
  lightBg: string;
  icon: React.ElementType;
}

const SERVICE_THEMES: Record<string, ServiceTheme> = {
  CARP:  { color: '#854F0B', lightBg: 'bg-amber-100 dark:bg-amber-950/50',   icon: Hammer },
  MAS:   { color: '#5F5E5A', lightBg: 'bg-stone-200 dark:bg-stone-700/50',   icon: BrickWall },
  PAINT: { color: '#534AB7', lightBg: 'bg-violet-100 dark:bg-violet-950/50', icon: PaintRoller },
  PLUMB: { color: '#185FA5', lightBg: 'bg-blue-100 dark:bg-blue-950/50',     icon: Droplets },
  ELEC:  { color: '#A37A00', lightBg: 'bg-yellow-100 dark:bg-yellow-950/50', icon: Zap },
};

const FALLBACK_THEME: ServiceTheme = {
  color: '#6B7280',
  lightBg: 'bg-gray-100 dark:bg-gray-800/50',
  icon: Wrench,
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QuickActionItem {
  id: number;
  name: string;
  description: string;
}

interface QuickActionsProps {
  onServiceSelect: (ctx: {
    subSectionCode: string;
    item?: QuickActionItem;
  }) => void;
}

// ── ServiceBox ────────────────────────────────────────────────────────────────

const VISIBLE_ITEM_LIMIT = 4;

function ServiceBox({
  service,
  onServiceSelect,
}: {
  service: CatalogSubSection;
  onServiceSelect: QuickActionsProps['onServiceSelect'];
}) {
  const [expanded, setExpanded] = useState(false);
  const theme = SERVICE_THEMES[service.code] ?? FALLBACK_THEME;
  const ServiceIcon = theme.icon;

  const items = service.items ?? [];
  const visible = expanded ? items : items.slice(0, VISIBLE_ITEM_LIMIT);
  const hasMore = items.length > VISIBLE_ITEM_LIMIT;

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className={cn('w-7 h-7 rounded-md flex items-center justify-center shrink-0', theme.lightBg)}>
          <ServiceIcon className="h-3.5 w-3.5" style={{ color: theme.color }} />
        </div>
        <span className="text-[13px] font-semibold text-foreground flex-1 leading-tight truncate">
          {service.name}
        </span>
      </div>

      <Separator className="my-3" />

      {/* Service items — one per row, so the fault text stays readable in a
          narrow column. */}
      <div className="space-y-1.5 flex-1">
        {visible.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onServiceSelect({ subSectionCode: service.code, item })}
            className="w-full text-left rounded-md border border-transparent px-2 py-1.5 text-[12px] leading-snug text-card-foreground hover:bg-muted/60 hover:border-border transition-colors"
          >
            {item.name}
          </button>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        {hasMore ? (
          <button
            type="button"
            onClick={() => setExpanded(prev => !prev)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            {expanded ? (
              <><ChevronUp className="h-3 w-3" /> Less</>
            ) : (
              <><ChevronDown className="h-3 w-3" /> {items.length - VISIBLE_ITEM_LIMIT} more</>
            )}
          </button>
        ) : <span />}
        <button
          type="button"
          onClick={() => onServiceSelect({ subSectionCode: service.code })}
          className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline whitespace-nowrap"
        >
          Something else →
        </button>
      </div>
    </div>
  );
}

// ── QuickActions ──────────────────────────────────────────────────────────────

const QuickActions = ({ onServiceSelect }: QuickActionsProps) => {
  // Campus-scoped: a requester is only offered the services their campus
  // actually staffs, which is the same list the wizard opens on.
  const campusId = useAuthStore((s) => s.user?.primary_campus_id ?? null);
  const { data: services = [], isLoading, error } = useCatalog(campusId);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-7 rounded-md" />
              <Skeleton className="h-4 flex-1 rounded" />
            </div>
            <Skeleton className="h-px w-full" />
            <div className="space-y-1.5">
              {[1, 2, 3, 4].map(j => <Skeleton key={j} className="h-6 w-full rounded-md" />)}
            </div>
          </div>
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
      {services.map(service => (
        <ServiceBox key={service.id} service={service} onServiceSelect={onServiceSelect} />
      ))}
    </div>
  );
};

export default QuickActions;
