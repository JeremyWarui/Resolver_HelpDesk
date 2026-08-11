/**
 * Which building is consuming the section, and what kind of work it consumes.
 *
 * A table rather than a chart on purpose. The question is a lookup with several
 * columns — "how much, how late, and which trade" — and nineteen bars is a wall
 * nobody reads. Charts show shape; tables answer "which one".
 *
 * The dominant-trade column is the reason this exists. A building with twelve
 * tickets that are 80% plumbing is one drainage job to fix properly; the same
 * twelve spread across five trades is an old building. Those are different
 * decisions and a total alone cannot tell them apart.
 *
 * Rows marked "not registered" are real work at locations that carry no
 * Facility record — staff quarters, equipment, grounds. They were the largest
 * bucket in the data and used to render as a blank label. Naming them says what
 * is true and points at the asset register that does not exist yet.
 */
import { usePerformanceFacilities } from '@/hooks/analytics/usePerformanceFacilities';
import ChartCard from '@/components/shared/data/ChartCard';
import { Skeleton } from '@/components/ui/skeleton';
import type { AnalyticsParams, FacilityMixRow } from '@/types';

interface Props {
  params?: AnalyticsParams;
  enabled?: boolean;
  /** Rows to show before the "and N more" line. */
  limit?: number;
}

function slaTone(pct: number | null) {
  if (pct == null) return 'text-muted-foreground';
  if (pct >= 90) return 'text-status-resolved';
  if (pct >= 75) return 'text-status-progress';
  return 'text-status-escalated';
}

/** The trade split as text. Colour is not used here — nine trades exceed what
 *  categorical colour can carry, and the words are shorter than a legend. */
function mixLabel(row: FacilityMixRow) {
  if (row.trades.length === 0) return '—';
  return row.trades
    .slice(0, 3)
    .map((t) => `${t.trade} ${Math.round(t.share * 100)}%`)
    .join(' · ');
}

export function FacilityHealthTable({ params, enabled = true, limit = 12 }: Props) {
  const { data, loading } = usePerformanceFacilities(params, { enabled });
  const rows = data?.facilities ?? [];
  const shown = rows.slice(0, limit);
  const unregistered = rows.filter((r) => !r.registered).length;

  return (
    <ChartCard
      title="Facilities by ticket load"
      description="Which buildings the work comes from, and which trade dominates each one."
    >
      {loading ? (
        <Skeleton className="h-72 w-full" />
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No located tickets in this period.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm bg-card">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-2.5 font-medium">Facility</th>
                  <th className="px-1 py-2.5 text-right font-medium">Total</th>
                  <th className="px-1 py-2.5 text-right font-medium">Open</th>
                  <th className="px-1 py-2.5 text-right font-medium">Esc.</th>
                  <th className="px-1 py-2.5 text-right font-medium">SLA</th>
                  <th className="px-2 py-2.5 font-medium">Most issues</th>
                  <th className="px-2 py-2.5 font-medium">Trade split</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {shown.map((r) => (
                  <tr key={`${r.registered ? 'f' : 't'}-${r.facility_id ?? r.facility}`}>
                    <td className="px-2 py-2.5 font-medium">
                      {r.facility}
                      {!r.registered && (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                          no asset record
                        </span>
                      )}
                    </td>
                    <td className="px-1 py-2.5 text-right tabular-nums">{r.total}</td>
                    <td className="px-1 py-2.5 text-right tabular-nums text-status-open">
                      {r.open_count}
                    </td>
                    <td className="px-1 py-2.5 text-right tabular-nums">
                      <span
                        className={
                          r.escalated_count > 0
                            ? 'text-status-escalated'
                            : 'text-muted-foreground'
                        }
                      >
                        {r.escalated_count}
                      </span>
                    </td>
                    <td className={`px-1 py-2.5 text-right tabular-nums ${slaTone(r.sla_pct)}`}>
                      {r.sla_pct != null ? `${r.sla_pct}%` : '—'}
                    </td>
                    <td className="px-2 py-2.5">
                      {r.top_trade ?? (
                        <span className="text-muted-foreground" title="No single trade leads">
                          mixed
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-xs text-muted-foreground">
                      {mixLabel(r)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
            {rows.length > shown.length && (
              <p>
                Showing the {shown.length} busiest of {rows.length} locations.
              </p>
            )}
            {unregistered > 0 && (
              <p>
                {unregistered} row{unregistered === 1 ? '' : 's'} cover locations with no
                facility record — staff quarters, equipment and grounds are entered as
                free text, so their work groups by type rather than by the specific
                asset. Registering those assets is what would let a generator or a lift
                show its own repair history.
              </p>
            )}
            <p>
              A building whose work concentrates in one trade is usually one fault worth
              fixing properly. An even split across trades is usually age.
            </p>
          </div>
        </>
      )}
    </ChartCard>
  );
}

export default FacilityHealthTable;
