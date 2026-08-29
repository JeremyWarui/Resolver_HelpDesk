import { useMemo, useState } from 'react';
import { Building2, MapPin, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { RailLayout, RailEmptyState, type RailGroup } from '@/components/shared/data/RailLayout';
import { useFacilityHealth, type FacilityHealthRow } from '@/hooks/useAnalytics';
import FacilityForm from './FacilityForm';
import { UnifiedDetailsSheet } from '@/components/shared/ticket/UnifiedDetailsSheet';
import type { Facility } from '@/types';

/**
 * The estate register: every building the institution maintains, campus on the
 * rail.
 *
 * Campus is the rail because it is how the estate is walked — an HOS runs one,
 * a manager compares five. The rail only ever filters: the rows stay grouped by
 * campus and the card stays the same, so what a reader learns at All facilities
 * is what they read on every campus tab.
 *
 * Silent buildings are rows, not absences. A ticket breakdown can only draw the
 * buildings that have tickets, and "which have we heard nothing from" is the
 * question a register exists to answer.
 *
 * Every source is scoped server-side, so an HOD or HOS sees the same page with
 * their own numbers; `manage` gates the create and edit controls.
 */

/** Ever, for this system — so a row with no tickets really has none. */
const ALL_TIME = { days: 3650 };

const ALL = 'all';

interface FacilitiesPageProps {
  /** Show create and edit controls. Admin only; everyone else reads. */
  manage?: boolean;
}

export default function FacilitiesPage({ manage = true }: FacilitiesPageProps = {}) {
  const { rows, loading, refetch } = useFacilityHealth(ALL_TIME);

  const [campus, setCampus] = useState<string>(ALL);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [viewing, setViewing] = useState<Facility | null>(null);

  // Search narrows the register and the rail counts follow it, so typing a name
  // shows which campus it is at rather than making the reader hunt.
  const matching = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((f) =>
      [f.name, f.campus, f.type].join(' ').toLowerCase().includes(q),
    );
  }, [rows, search]);

  const campuses = useMemo(
    () => [...new Set(rows.map((f) => f.campus))].sort(),
    [rows],
  );

  const visible = useMemo(
    () => (campus === ALL ? matching : matching.filter((f) => f.campus === campus)),
    [matching, campus],
  );

  // Always by campus. Picking a campus narrows this to one group rather than
  // re-cutting it, so the rail is a filter and never a second layout.
  const groups = useMemo(() => {
    const map = new Map<string, FacilityHealthRow[]>();
    for (const f of visible) {
      if (!map.has(f.campus)) map.set(f.campus, []);
      map.get(f.campus)!.push(f);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([key, list]) =>
          [key, [...list].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))] as const,
      );
  }, [visible]);

  const railGroups: RailGroup[] = [
    { entries: [{
      key: ALL,
      icon: <Building2 className="h-3.5 w-3.5 shrink-0" />,
      label: 'All facilities',
      count: matching.length,
    }] },
    { heading: 'Campuses', entries: campuses.map((name) => ({
      key: name,
      icon: <MapPin className="h-3.5 w-3.5 shrink-0" />,
      label: name,
      count: matching.filter((f) => f.campus === name).length,
    })) },
  ];

  const heading = campus === ALL ? 'All facilities' : campus;
  const silent = visible.filter((f) => f.total === 0).length;

  return (
    <RailLayout
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search facilities…"
      loading={loading}
      groups={railGroups}
      activeKey={campus}
      onSelect={setCampus}
      noun={{ one: 'facility', many: 'facilities' }}
      emptyLabel="none on the register"
    >
      {/* The campus's facilities, always grouped by campus. */}
      <div className="flex items-start justify-between gap-3 px-6 py-4 border-b bg-white">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">{heading}</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {visible.length} facilit{visible.length === 1 ? 'y' : 'ies'}
            {groups.length > 1 && ` across ${groups.length} campuses`}
            {silent > 0 && ` · ${silent} never reported`}
            {search && ' matching your search'}
          </p>
        </div>
        {manage && (
          <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Facility
          </Button>
        )}
      </div>

      <div className="p-6 space-y-6">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : visible.length === 0 ? (
          <RailEmptyState
            icon={<Building2 className="h-10 w-10" />}
            title={search ? 'No facilities match your search' : `No facilities at ${heading}`}
            hint={search
              ? 'Try a name, campus or type.'
              : 'Add one so tickets can be raised against it.'}
          />
        ) : (
          groups.map(([label, list]) => (
            <div key={label}>
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">{label}</span>
                <span className="text-xs text-gray-400">
                  {list.length} facilit{list.length === 1 ? 'y' : 'ies'}
                </span>
              </div>
              <ul className="space-y-1.5">
                {list.map((f) => (
                  <FacilityRow key={f.id} row={f} onView={() => setViewing(f.facility)} />
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      {manage && formOpen && (
        <FacilityForm
          isOpen={formOpen}
          onOpenChange={setFormOpen}
          onSuccess={() => { setFormOpen(false); refetch(); }}
        />
      )}

      <UnifiedDetailsSheet
        isOpen={viewing !== null}
        onOpenChange={(open) => { if (!open) setViewing(null); }}
        entity={viewing}
        entityType="facility"
        canEdit={manage}
        onUpdated={manage ? refetch : undefined}
      />
    </RailLayout>
  );
}

function FacilityRow({ row, onView }: { row: FacilityHealthRow; onView: () => void }) {
  // Fixed widths, not space-between: one row only reads if the columns line up
  // down the list, and facility names vary in length.
  return (
    <li className="flex items-center gap-3 p-3 bg-white border rounded-lg hover:border-gray-300 transition-colors">
      <button onClick={onView} className="w-56 shrink-0 text-left text-sm font-medium text-gray-900 truncate">
        {row.name}
      </button>

      <span className="hidden md:block w-32 shrink-0 truncate text-xs text-gray-400">
        {row.type}
      </span>

      {/* The trade split is what turns volume into health: twelve tickets on one
          block is a different problem when they are all plumbing. */}
      <div className="hidden md:flex items-center gap-1 shrink-0 ml-auto">
        {row.trades.length === 0 ? (
          <Badge variant="outline" className="text-[10px] text-gray-400">
            never reported
          </Badge>
        ) : (
          row.trades.slice(0, 3).map((t) => (
            <Badge
              key={t.trade}
              variant="outline"
              className={`text-[10px] font-normal ${
                t.trade === row.topTrade ? 'border-primary/40 text-primary' : ''
              }`}
            >
              {t.trade} {t.total}
            </Badge>
          ))
        )}
        {row.trades.length > 3 && (
          <span className="text-[10px] text-gray-400">+{row.trades.length - 3}</span>
        )}
      </div>

      {row.escalated > 0 && (
        <Badge
          variant="outline"
          className="text-xs shrink-0 text-status-escalated border-status-escalated/30 bg-status-escalated/5"
          title="Tickets that climbed above the technician"
        >
          {row.escalated} escalated
        </Badge>
      )}

      <Badge
        variant="outline"
        className={`text-xs shrink-0 ${
          row.open === 0 ? 'text-gray-400' : 'text-status-open border-status-open/30 bg-status-open/5'
        }`}
        title="Tickets open here now"
      >
        {row.open} open
      </Badge>
    </li>
  );
}
