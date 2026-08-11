/**
 * The estate register — every building, including the ones nobody has reported.
 *
 * This is deliberately not the facility card on the analytics page. Analytics
 * can only plot buildings that have tickets, so half the estate is invisible to
 * it: 19 of 37 in the demo data. "Which buildings have we heard nothing from"
 * is a real question and no chart can answer it — a silent building is either
 * well maintained or one nobody knows how to report, and those need opposite
 * responses.
 *
 * So: a register, not a dashboard. No charts here; they live on analytics and
 * repeating them would be the third surface answering one question.
 *
 * `/facilities/` is the register itself rather than ticket data — it is not
 * role-scoped, and deliberately so: the reference list of what the institution
 * owns is the same list for everyone. The ticket counts on each row come from
 * the same annotation the admin screen uses.
 */
import { useMemo, useState } from 'react';
import { Building2 } from 'lucide-react';
import { useFacilities } from '@/hooks/facilities/useFacilities';
import { FilterPills } from '@/components/shared/data/FilterPills';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { facilityTypeLabel } from '@/constants/facilityTypes';
import type { Facility } from '@/types';

export type FacilityRegisterRole = 'manager' | 'hod' | 'hos';

interface Props {
  role: FacilityRegisterRole;
}

/** The API returns the counts already annotated — no per-row request. */
interface FacilityRow extends Facility {
  openTickets?: number;
  resolvedTickets?: number;
  closedTickets?: number;
  facility_type_name?: string | null;
  code?: string;
}

const ALL = 'all';

export default function FacilityRegisterView({ role }: Props) {
  const { facilities, loading } = useFacilities();
  const [campus, setCampus] = useState<string>(ALL);
  const [search, setSearch] = useState('');

  const rows = facilities as FacilityRow[];

  const campuses = useMemo(
    () => [...new Set(rows.map((f) => f.campus_name).filter(Boolean))].sort() as string[],
    [rows],
  );

  const totals = useMemo(() => {
    const withCounts = rows.map((f) => ({
      ...f,
      total: (f.openTickets ?? 0) + (f.resolvedTickets ?? 0) + (f.closedTickets ?? 0),
    }));
    return {
      rows: withCounts,
      silent: withCounts.filter((f) => f.total === 0).length,
      open: withCounts.reduce((n, f) => n + (f.openTickets ?? 0), 0),
    };
  }, [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return totals.rows
      .filter((f) => campus === ALL || f.campus_name === campus)
      .filter(
        (f) =>
          !q ||
          f.name.toLowerCase().includes(q) ||
          (f.code ?? '').toLowerCase().includes(q),
      )
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [totals.rows, campus, search]);

  const pills = useMemo(
    () => [
      { key: ALL, label: 'All campuses', count: totals.rows.length },
      ...campuses.map((c) => ({
        key: c,
        label: c,
        count: totals.rows.filter((f) => f.campus_name === c).length,
      })),
    ],
    [campuses, totals.rows],
  );

  return (
    <main className="flex-1 overflow-y-auto bg-muted/30 p-4 space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Facilities</h1>
        <p className="text-sm text-muted-foreground">
          {role === 'manager'
            ? 'Every building the institution maintains, across all campuses.'
            : 'The buildings on your campus and what has been reported in each.'}
        </p>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  On the register
                </p>
                <p className="mt-1 text-3xl font-semibold tabular-nums">
                  {totals.rows.length}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  With open work
                </p>
                <p className="mt-1 text-3xl font-semibold tabular-nums">
                  {totals.rows.filter((f) => (f.openTickets ?? 0) > 0).length}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Never reported
                </p>
                <p className="mt-1 text-3xl font-semibold tabular-nums">{totals.silent}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  No ticket has ever been raised here
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <FilterPills pills={pills} active={campus} onChange={setCampus} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or code…"
              className="h-9 max-w-xs"
            />
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2.5 font-medium">Facility</th>
                      <th className="px-2 py-2.5 font-medium">Campus</th>
                      <th className="px-2 py-2.5 font-medium">Type</th>
                      <th className="px-1 py-2.5 text-right font-medium">Open</th>
                      <th className="px-1 py-2.5 text-right font-medium">Resolved</th>
                      <th className="px-1 py-2.5 text-right font-medium">Closed</th>
                      <th className="px-1 py-2.5 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {visible.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">
                          No facilities match.
                        </td>
                      </tr>
                    ) : (
                      visible.map((f) => (
                        <tr key={f.id} className={f.total === 0 ? 'bg-muted/20' : undefined}>
                          <td className="px-3 py-2.5 font-medium">
                            {f.name}
                            {f.code && (
                              <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                                {f.code}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-muted-foreground">
                            {f.campus_name ?? '—'}
                          </td>
                          <td className="px-2 py-2.5 text-muted-foreground">
                            {f.facility_type_name ?? facilityTypeLabel(f.type)}
                          </td>
                          <td className="px-1 py-2.5 text-right tabular-nums text-status-open">
                            {f.openTickets ?? 0}
                          </td>
                          <td className="px-1 py-2.5 text-right tabular-nums text-status-resolved">
                            {f.resolvedTickets ?? 0}
                          </td>
                          <td className="px-1 py-2.5 text-right tabular-nums text-muted-foreground">
                            {f.closedTickets ?? 0}
                          </td>
                          <td className="px-1 py-2.5 text-right font-medium tabular-nums">
                            {f.total === 0 ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              f.total
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {totals.silent > 0 && (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {totals.silent} building{totals.silent === 1 ? ' has' : 's have'} never had a
                ticket raised. That is either a building in good order or one whose
                occupants do not know how to report a fault — worth knowing which, because
                the two need opposite responses. Analytics cannot show these rows at all:
                a chart of tickets can only draw the buildings that have some.
              </span>
            </p>
          )}
        </>
      )}
    </main>
  );
}
