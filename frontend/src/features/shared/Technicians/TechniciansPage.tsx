import { useMemo, useState } from 'react';
import { Wrench, Users, Plus, MapPin, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { RailLayout, RailEmptyState, type RailGroup } from '@/components/shared/data/RailLayout';
import { useTechnicians } from '@/hooks/useTechnicians';
import { useTrades } from '@/hooks/useCatalogue';
import { useAnalytics } from '@/hooks/useAnalytics';
import { UserFormDialog } from '@/features/shared/users/UserFormDialog';
import { UnifiedDetailsSheet } from '@/components/shared/ticket/UnifiedDetailsSheet';
import type { Technician } from '@/types';

/**
 * The technician roster, by trade and then by campus — the two halves of a
 * technician's scope pair.
 *
 * A trade with nobody in it still appears: tickets route to it regardless, and
 * that gap is the most useful thing this page shows. Every source is scoped
 * server-side, so an HOD or HOS sees the same page with fewer rows; `manage`
 * gates the create and edit controls.
 */

interface TechniciansPageProps {
  /** Show create/edit controls. Admin only — HOD and HOS read the same roster. */
  manage?: boolean;
}

const UNASSIGNED = -1;
const ALL = 0;

export default function TechniciansPage({ manage = true }: TechniciansPageProps = {}) {
  const { technicians, loading, refetch } = useTechnicians();
  const { trades, loading: tradesLoading } = useTrades();
  // Open load per technician, as context beside the roster. A failure leaves
  // the badges off rather than blanking the page.
  const { data: load } = useAnalytics({ days: 30, group_by: 'technician' });

  const [selectedTradeId, setSelectedTradeId] = useState<number>(ALL);
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

  const displayName = (t: Technician) =>
    `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim() || t.username;

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

  const tradesWithCounts = useMemo(() => {
    const rows = trades.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      count: matching.filter((t) => t.trade_ids.includes(s.id)).length,
    }));
    const untraded = matching.filter((t) => t.trade_ids.length === 0).length;
    return { rows, untraded };
  }, [trades, matching]);

  const visible = useMemo(() => {
    if (selectedTradeId === ALL) return matching;
    if (selectedTradeId === UNASSIGNED) {
      return matching.filter((t) => t.trade_ids.length === 0);
    }
    return matching.filter((t) => t.trade_ids.includes(selectedTradeId));
  }, [matching, selectedTradeId]);

  // Campus is the other half of the scope pair, so it is the grouping inside a
  // trade rather than just another column.
  const byCampus = useMemo(() => {
    const groups = new Map<string, Technician[]>();
    for (const t of visible) {
      const key = t.primary_campus_name ?? 'No campus set';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([campus, list]) => [campus, list.sort((a, b) => displayName(a).localeCompare(displayName(b)))] as const);
  }, [visible]);

  const railGroups: RailGroup[] = [
    { entries: [{
      key: String(ALL),
      icon: <Users className="h-3.5 w-3.5 shrink-0" />,
      label: 'All technicians',
      count: matching.length,
    }] },
    { heading: 'Trades', entries: tradesWithCounts.rows.map((trade) => ({
      key: String(trade.id),
      icon: <Wrench className="h-3.5 w-3.5 shrink-0" />,
      label: trade.name,
      code: trade.code,
      count: trade.count,
    })) },
    ...(tradesWithCounts.untraded > 0
      ? [{ heading: 'Needs attention', entries: [{
          key: String(UNASSIGNED),
          icon: <AlertTriangle className="h-3.5 w-3.5 shrink-0" />,
          label: 'No trade assigned',
          count: tradesWithCounts.untraded,
          warn: true,
        }] }]
      : []),
  ];

  const selectedTrade = trades.find((s) => s.id === selectedTradeId);
  const heading =
    selectedTradeId === ALL
      ? 'All technicians'
      : selectedTradeId === UNASSIGNED
        ? 'No trade assigned'
        : (selectedTrade?.name ?? 'Trade');

  const isLoading = loading || tradesLoading;

  return (
    <RailLayout
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search technicians…"
      loading={isLoading}
      groups={railGroups}
      activeKey={String(selectedTradeId)}
      onSelect={(key) => setSelectedTradeId(Number(key))}
      noun={{ one: 'technician', many: 'technicians' }}
      emptyLabel="nobody assigned"
      warnWhenEmpty
    >
      {/* Technicians in the selected trade, grouped by campus. */}
      <div className="flex items-start justify-between gap-3 px-6 py-4 border-b bg-white">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            {heading}
            {selectedTrade && (
              <Badge variant="outline" className="text-xs font-mono">{selectedTrade.code}</Badge>
            )}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {visible.length} technician{visible.length === 1 ? '' : 's'}
            {selectedTradeId !== ALL && selectedTradeId !== UNASSIGNED
              ? ` across ${byCampus.length} campus${byCampus.length === 1 ? '' : 'es'}`
              : ''}
            {search && ' matching your search'}
          </p>
        </div>
        {manage && (
          <Button
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={() => { setEditing(null); setFormOpen(true); }}
          >
            <Plus className="h-4 w-4" />
            Add Technician
          </Button>
        )}
      </div>

      <div className="p-6 space-y-6">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : visible.length === 0 ? (
          <RailEmptyState
            icon={<Wrench className="h-10 w-10" />}
            title={search ? 'No technicians match your search' : `No technicians in ${heading}`}
            hint={search
              ? 'Try a name, username or campus.'
              : 'Tickets for this trade will route here but have nobody to be assigned to.'}
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
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSuccess={() => { setFormOpen(false); setEditing(null); refetch(); }}
        />
      )}

      <UnifiedDetailsSheet
        isOpen={viewing !== null}
        onOpenChange={(open) => { if (!open) setViewing(null); }}
        entity={viewing}
        entityType="technician"
        canEdit={manage}
        onUpdated={manage ? refetch : undefined}
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

  // Fixed widths, not space-between: the point of one row is that the columns
  // line up down the list, and name lengths vary. Narrow screens drop the
  // rightmost columns rather than letting them wrap.
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
          {trades.length === 0 ? (
            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-200 bg-amber-50">
              no trade
            </Badge>
          ) : (
            trades.slice(0, 3).map((t) => (
              <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
            ))
          )}
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
