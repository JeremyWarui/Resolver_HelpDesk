import { useMemo, useState } from 'react';
import { Wrench, Users, Plus, MapPin, Grid3x3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { RailLayout, RailEmptyState, type RailGroup } from '@/components/shared/data/RailLayout';
import { useTechnicians } from '@/hooks/useTechnicians';
import { useAnalytics, useCover } from '@/hooks/useAnalytics';
import { UserFormDialog } from '@/features/shared/users/UserFormDialog';
import { UnifiedDetailsSheet } from '@/components/shared/ticket/UnifiedDetailsSheet';
import CoverByTrade from './CoverByTrade';
import type { Technician } from '@/types';

/**
 * The technician roster by campus, and Cover by trade: who can work each trade
 * at each campus, the two halves of a technician's scope pair.
 *
 * A trade with nobody at a campus still has a cell: tickets route to it
 * regardless, and that gap is the most useful thing this page shows. Every
 * source is scoped server-side, so an HOD or HOS sees the same page with one
 * campus; `manage` gates the create and edit controls.
 */

interface TechniciansPageProps {
  /** Show create/edit controls. Admin only — HOD and HOS read the same roster. */
  manage?: boolean;
}

const ALL = 'all';
const COVER = 'cover';
const campusKey = (id: number) => `campus:${id}`;

export default function TechniciansPage({ manage = true }: TechniciansPageProps = {}) {
  const { technicians, loading, refetch } = useTechnicians();
  const { cover, loading: coverLoading, refetch: refetchCover } = useCover();
  // Open load per technician, as context beside the roster. A failure leaves
  // the badges off rather than blanking the page.
  const { data: load } = useAnalytics({ days: 30, group_by: 'technician' });

  const [selected, setSelected] = useState<string>(ALL);
  const [gap, setGap] = useState<{ campusId: number; tradeId: number } | null>(null);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Technician | null>(null);
  const [viewing, setViewing] = useState<Technician | null>(null);

  // A technician with no tickets in the window is absent from the breakdown,
  // which means zero. Only a missing response means unknown, and then no badge
  // is shown at all rather than claiming everyone is idle.
  const loadKnown = load != null;
  const openCountById = useMemo(() => {
    const map = new Map<number, number>();
    for (const row of load?.breakdown ?? []) map.set(Number(row.key), row.open);
    return map;
  }, [load]);

  const displayName = (t: Technician) => t.full_name;

  // Search filters the roster, and the rail counts follow it — so typing a name
  // shows you which trade they are in rather than making you hunt for them.
  const matching = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return technicians;
    return technicians.filter((t) =>
      [displayName(t), t.username, t.email, t.primary_campus_name ?? '']
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [technicians, search]);

  const visible = useMemo(() => {
    if (selected.startsWith('campus:')) {
      const id = Number(selected.slice('campus:'.length));
      return matching.filter((t) => t.campus_ids.includes(id));
    }
    return matching;
  }, [matching, selected]);

  // Campus is the other half of the scope pair, so the roster is grouped by it.
  // A picked campus is one group: someone based elsewhere who works a trade there belongs to it.
  const pickedCampus = cover?.campuses.find((c) => campusKey(c.id) === selected)?.name;
  const byCampus = useMemo(() => {
    const groups = new Map<string, Technician[]>();
    for (const t of visible) {
      const key = pickedCampus ?? t.primary_campus_name ?? 'No campus set';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([campus, list]) => [campus, list.sort((a, b) => displayName(a).localeCompare(displayName(b)))] as const);
  }, [visible, pickedCampus]);

  const gaps = cover?.gaps ?? 0;
  const railGroups: RailGroup[] = [
    { entries: [
      {
        key: ALL,
        icon: <Users className="h-3.5 w-3.5 shrink-0" />,
        label: 'All technicians',
        count: matching.length,
      },
      {
        key: COVER,
        icon: <Grid3x3 className="h-3.5 w-3.5 shrink-0" />,
        label: 'Cover by trade',
        count: gaps,
        sub: cover == null ? '' : gaps
          ? `${gaps} gap${gaps === 1 ? '' : 's'} across ${cover.gap_campuses} campus${cover.gap_campuses === 1 ? '' : 'es'}`
          : 'Every trade covered',
        alert: gaps > 0,
      },
    ] },
    { heading: 'Campuses', entries: (cover?.campuses ?? []).map((c) => ({
      key: campusKey(c.id),
      icon: <MapPin className="h-3.5 w-3.5 shrink-0" />,
      label: c.name,
      count: matching.filter((t) => t.campus_ids.includes(c.id)).length,
    })) },
  ];

  const heading =
    selected === COVER ? 'Cover by trade' : pickedCampus ?? 'All technicians';
  const subheading = selected === COVER
    ? `${cover?.trades.length ?? 0} trades × ${cover?.campuses.length ?? 0} campus${cover?.campuses.length === 1 ? '' : 'es'}`
    : `${visible.length} technician${visible.length === 1 ? '' : 's'}${search ? ' matching your search' : ''}`;

  const isLoading = loading || coverLoading;

  return (
    <RailLayout
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search technicians…"
      loading={isLoading}
      groups={railGroups}
      activeKey={selected}
      onSelect={setSelected}
      noun={{ one: 'technician', many: 'technicians' }}
      emptyLabel="nobody assigned"
      warnWhenEmpty
    >
      {/* The roster for the selected campus, grouped by campus; or the cover grid. */}
      <div className="flex items-start justify-between gap-3 px-6 py-4 border-b bg-white">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">{heading}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{subheading}</p>
        </div>
        {manage && (
          <Button
            size="sm"
            variant="brand"
            className="gap-1.5 shrink-0"
            onClick={() => { setEditing(null); setGap(null); setFormOpen(true); }}
          >
            <Plus className="h-4 w-4" />
            Add Technician
          </Button>
        )}
      </div>

      <div className="p-6 space-y-6">
        {selected === COVER ? (
          <CoverByTrade
            cover={cover}
            onFillGap={manage ? (campusId, tradeId) => { setEditing(null); setGap({ campusId, tradeId }); setFormOpen(true); } : undefined}
          />
        ) : isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : visible.length === 0 ? (
          <RailEmptyState
            icon={<Wrench className="h-10 w-10" />}
            title={search ? 'No technicians match your search' : `No technicians at ${heading}`}
            hint={search
              ? 'Try a name, username or campus.'
              : 'Tickets raised here route to a trade with nobody to be assigned to.'}
          />
        ) : (
          byCampus.map(([campus, list]) => (
            <div key={campus}>
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">{campus}</span>
                <span className="text-xs text-gray-400">
                  {list.length} technician{list.length === 1 ? '' : 's'}
                </span>
              </div>
              <ul className="space-y-1.5">
                {list.map((tech) => (
                  <TechnicianRow
                    key={tech.id}
                    tech={tech}
                    name={displayName(tech)}
                    openCount={loadKnown ? (openCountById.get(tech.id) ?? 0) : undefined}
                    onView={() => setViewing(tech)}
                    onEdit={manage ? () => { setEditing(tech); setFormOpen(true); } : undefined}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      {manage && formOpen && (
        <UserFormDialog
          editing={editing}
          lockRole="technician"
          preset={gap ?? undefined}
          onClose={() => { setFormOpen(false); setEditing(null); setGap(null); }}
          onSuccess={() => { setFormOpen(false); setEditing(null); setGap(null); refetch(); refetchCover(); }}
        />
      )}

      <UnifiedDetailsSheet
        isOpen={viewing !== null}
        onOpenChange={(open) => { if (!open) setViewing(null); }}
        entity={viewing}
        entityType="technician"
        canEdit={manage}
        onUpdated={manage ? () => { refetch(); refetchCover(); } : undefined}
      />
    </RailLayout>
  );
}

function TechnicianRow({
  tech, name, openCount, onView, onEdit,
}: {
  tech: Technician;
  name: string;
  openCount?: number;
  onView: () => void;
  /** Omitted for read-only viewers — the Edit button is not rendered at all. */
  onEdit?: () => void;
}) {
  const initials = name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  const trades = tech.trade_names ?? [];

  // Fixed widths, so the columns line up down the list whatever the name
  // lengths. Narrow screens drop the rightmost columns.
  return (
    <li className="flex items-center gap-3 p-3 bg-white border rounded-lg hover:border-gray-300 transition-colors">
      <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
        {initials || '?'}
      </div>

      <button onClick={onView} className="w-48 shrink-0 text-left text-sm font-medium text-gray-900 truncate">
        {name}
      </button>

      <span className="hidden md:block w-40 shrink-0 truncate font-mono text-xs text-gray-400">
        @{tech.username}
      </span>

      <span className="hidden lg:block flex-1 min-w-0 truncate text-xs text-gray-400">
        {tech.email}
      </span>

      {/* Every trade they work, whichever one the rail is filtered to: a
          carpenter who also paints is still a painter on the carpentry tab. */}
      <div className="hidden md:flex items-center gap-1 shrink-0 ml-auto">
        {trades.slice(0, 3).map((t) => (
          <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
        ))}
        {trades.length > 3 && (
          <span className="text-[10px] text-gray-400">+{trades.length - 3}</span>
        )}
      </div>

      {openCount !== undefined && (
        <Badge
          variant="outline"
          className={`text-xs shrink-0 ${
            openCount === 0 ? 'text-gray-400' : 'text-status-open border-status-open/30 bg-status-open/5'
          }`}
          title="Open tickets currently assigned"
        >
          {openCount} open
        </Badge>
      )}

      {onEdit && (
        <Button variant="ghost" size="sm" className="shrink-0 text-xs h-7" onClick={onEdit}>
          Edit
        </Button>
      )}
    </li>
  );
}
