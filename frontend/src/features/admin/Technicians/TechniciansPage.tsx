import { useMemo, useState } from 'react';
import { Wrench, Users, ChevronRight, Plus, MapPin, Search, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useScopedTechnicians } from '@/hooks/technicians/useScopedTechnicians';
import { useSubSections } from '@/hooks/catalog/useSubSections';
import { usePerformanceTechnicians } from '@/hooks/analytics';
import TechnicianForm from './TechnicianForm';
import TechnicianDetails from './TechnicianDetails';
import type { Technician } from '@/types';

/**
 * Technicians, by trade.
 *
 * This replaced a flat sortable table of every technician, which could not
 * answer the question the page exists for — "who is in carpentry?" — without
 * the reader scanning a Sections column by eye. A technician's scope is a
 * `(section, sub_section)` pair, i.e. campus AND trade, so the roster is
 * genuinely two-dimensional and a single flat list has to drop one axis.
 *
 * Trade is the rail because that is the question asked most: staffing a trade,
 * or finding who can take a plumbing job. Campus is the grouping inside,
 * because that is the second half of the same pair.
 *
 * Trades with nobody in them still appear. A trade with no technician at a
 * campus still routes tickets there — they simply have nobody to be assigned
 * to, and that gap is the most useful thing this page can show.
 *
 * Every data source here (`useScopedTechnicians`, `useSubSections`,
 * `usePerformanceTechnicians`) is scoped server-side from the JWT, so the same
 * component serves an HOD or HOS unchanged — they simply see fewer rows. Only
 * the create/edit affordances are admin-only, which is what `manage` gates.
 * HOD/HOS previously had their own page listing names and usernames and
 * nothing else: no trade, no load, no campus.
 */

interface TechniciansPageProps {
  /** Show create/edit controls. Admin only — HOD and HOS read the same roster. */
  manage?: boolean;
}

const UNASSIGNED = -1;
const ALL = 0;

export default function TechniciansPage({ manage = true }: TechniciansPageProps = {}) {
  const { technicians, loading, refetch } = useScopedTechnicians();
  const { subSections, loading: tradesLoading } = useSubSections();
  // Live open-load per technician. Not fatal if it fails — the roster is the
  // point and the counts are context, so a failure leaves the badges off
  // rather than blanking the page.
  const { data: load } = usePerformanceTechnicians({ days: 30 });

  const [selectedTradeId, setSelectedTradeId] = useState<number>(ALL);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Technician | null>(null);
  const [viewing, setViewing] = useState<Technician | null>(null);

  // A technician with no tickets in the window is absent from the breakdown
  // entirely, which is not the same as the load being unknown. Absent means
  // zero; only a missing response means unknown, and then no badge is shown at
  // all rather than claiming everyone is idle.
  const loadKnown = load != null;
  const openCountById = useMemo(() => {
    const map = new Map<number, number>();
    for (const row of load?.breakdown ?? []) map.set(row.technician_id, row.open_count);
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
      [displayName(t), t.username, t.email, t.campus_name ?? '']
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [technicians, search]);

  const tradesWithCounts = useMemo(() => {
    const rows = subSections.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      count: matching.filter((t) => (t.sub_sections ?? []).includes(s.id)).length,
    }));
    const untraded = matching.filter((t) => (t.sub_sections ?? []).length === 0).length;
    return { rows, untraded };
  }, [subSections, matching]);

  const visible = useMemo(() => {
    if (selectedTradeId === ALL) return matching;
    if (selectedTradeId === UNASSIGNED) {
      return matching.filter((t) => (t.sub_sections ?? []).length === 0);
    }
    return matching.filter((t) => (t.sub_sections ?? []).includes(selectedTradeId));
  }, [matching, selectedTradeId]);

  // Campus is the other half of the scope pair, so it is the grouping inside a
  // trade rather than just another column.
  const byCampus = useMemo(() => {
    const groups = new Map<string, Technician[]>();
    for (const t of visible) {
      const key = t.campus_name ?? 'No campus set';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([campus, list]) => [campus, list.sort((a, b) => displayName(a).localeCompare(displayName(b)))] as const);
  }, [visible]);

  const selectedTrade = subSections.find((s) => s.id === selectedTradeId);
  const heading =
    selectedTradeId === ALL
      ? 'All technicians'
      : selectedTradeId === UNASSIGNED
        ? 'No trade assigned'
        : (selectedTrade?.name ?? 'Trade');

  const isLoading = loading || tradesLoading;

  return (
    <div className="flex-1 flex overflow-hidden bg-gray-50">
      {/* ── Rail: trades ────────────────────────────────────────────────── */}
      <div className="w-72 shrink-0 border-r bg-white flex flex-col overflow-hidden">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              placeholder="Search technicians…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm pl-8"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {isLoading ? (
            [1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 rounded-md" />)
          ) : (
            <>
              <RailItem
                icon={<Users className="h-3.5 w-3.5 shrink-0" />}
                label="All technicians"
                count={matching.length}
                active={selectedTradeId === ALL}
                onClick={() => setSelectedTradeId(ALL)}
              />

              <p className="px-3 pt-3 pb-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                Trades
              </p>

              {tradesWithCounts.rows.map((trade) => (
                <RailItem
                  key={trade.id}
                  icon={<Wrench className="h-3.5 w-3.5 shrink-0" />}
                  label={trade.name}
                  code={trade.code}
                  count={trade.count}
                  searching={search.trim().length > 0}
                  active={selectedTradeId === trade.id}
                  onClick={() => setSelectedTradeId(trade.id)}
                />
              ))}

              {tradesWithCounts.untraded > 0 && (
                <>
                  <p className="px-3 pt-3 pb-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                    Needs attention
                  </p>
                  <RailItem
                    icon={<AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                    label="No trade assigned"
                    count={tradesWithCounts.untraded}
                    active={selectedTradeId === UNASSIGNED}
                    onClick={() => setSelectedTradeId(UNASSIGNED)}
                    warn
                  />
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Detail: technicians in the selected trade, grouped by campus ─── */}
      <div className="flex-1 overflow-y-auto">
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
            <EmptyState search={search} heading={heading} />
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
                <div className="space-y-1.5">
                  {list.map((tech) => (
                    <TechnicianRow
                      key={tech.id}
                      tech={tech}
                      name={displayName(tech)}
                      openCount={loadKnown ? (openCountById.get(tech.id) ?? 0) : undefined}
                      showTrades={selectedTradeId === ALL || selectedTradeId === UNASSIGNED}
                      onView={() => setViewing(tech)}
                      onEdit={manage ? () => { setEditing(tech); setFormOpen(true); } : undefined}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {manage && (
        <TechnicianForm
          isOpen={formOpen}
          onOpenChange={(open) => { setFormOpen(open); if (!open) setEditing(null); }}
          technician={editing}
          onSuccess={() => { setFormOpen(false); setEditing(null); refetch(); }}
        />
      )}

      <TechnicianDetails
        isOpen={viewing !== null}
        onOpenChange={(open) => { if (!open) setViewing(null); }}
        technician={viewing}
        onUpdated={manage ? refetch : undefined}
      />
    </div>
  );
}

function RailItem({
  icon, label, code, count, active, onClick, warn = false, searching = false,
}: {
  icon: React.ReactNode;
  label: string;
  code?: string;
  count: number;
  active: boolean;
  onClick: () => void;
  warn?: boolean;
  /** A zero means "no match" while a search is running, not "nobody works
   *  here" — saying the latter would misreport staffing to anyone typing. */
  searching?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-md transition-colors flex items-center gap-2 group/item ${
        active ? 'bg-primary/10' : 'hover:bg-gray-50'
      }`}
    >
      <span className={active ? 'text-primary' : warn ? 'text-amber-500' : 'text-gray-400'}>{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`text-sm font-medium truncate ${active ? 'text-primary' : 'text-gray-700'}`}>
            {label}
          </span>
          {code && (
            <Badge
              variant="outline"
              className={`text-[10px] font-mono ml-auto shrink-0 ${active ? 'border-primary/40 text-primary' : ''}`}
            >
              {code}
            </Badge>
          )}
        </div>
        <p className={`text-xs mt-0.5 ${count === 0 && !searching ? 'text-amber-600' : 'text-gray-400'}`}>
          {count === 0
            ? (searching ? 'no match' : 'nobody assigned')
            : `${count} technician${count === 1 ? '' : 's'}`}
        </p>
      </div>
      <ChevronRight
        className={`h-3.5 w-3.5 shrink-0 transition-opacity ${
          active ? 'text-primary opacity-100' : 'text-gray-300 opacity-0 group-hover/item:opacity-100'
        }`}
      />
    </button>
  );
}

function TechnicianRow({
  tech, name, openCount, showTrades, onView, onEdit,
}: {
  tech: Technician;
  name: string;
  openCount?: number;
  showTrades: boolean;
  onView: () => void;
  /** Omitted for read-only viewers — the Edit button is not rendered at all. */
  onEdit?: () => void;
}) {
  const initials = name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  const trades = tech.sub_section_names ?? [];

  return (
    <div className="flex items-center gap-3 p-3 bg-white border rounded-lg hover:border-gray-300 transition-colors">
      <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
        {initials || '?'}
      </div>

      <button onClick={onView} className="flex-1 min-w-0 text-left">
        <div className="text-sm font-medium text-gray-900 truncate">{name}</div>
        <div className="text-xs text-gray-400 truncate">
          <span className="font-mono">@{tech.username}</span>
          {tech.email && <span className="ml-2">{tech.email}</span>}
        </div>
      </button>

      {showTrades && (
        <div className="hidden md:flex items-center gap-1 shrink-0">
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
      )}

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
    </div>
  );
}

function EmptyState({ search, heading }: { search: string; heading: string }) {
  return (
    <div className="text-center py-16">
      <Wrench className="h-10 w-10 mx-auto mb-3 text-gray-200" />
      <p className="text-sm font-medium text-gray-600">
        {search ? 'No technicians match your search' : `No technicians in ${heading}`}
      </p>
      <p className="text-xs text-gray-400 mt-1">
        {search
          ? 'Try a name, username or campus.'
          : 'Tickets for this trade will route here but have nobody to be assigned to.'}
      </p>
    </div>
  );
}
