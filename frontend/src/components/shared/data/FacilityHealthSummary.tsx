import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FALLBACK_TRADE_THEME, TRADE_THEMES } from '@/constants/catalogue';
import type { OverviewFacility } from '@/types';

/** The Reports page's Facility Health on a dashboard: the building, its faults
 *  and the trades they fell in, with the way through to the rest. */
export default function FacilityHealthSummary({ rows, onSeeMore }: {
  rows: OverviewFacility[] | null;
  onSeeMore: () => void;
}) {
  const most = Math.max(1, ...(rows ?? []).map((r) => r.total));
  return (
    <Card aria-label="Facility Health">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Facility Health</CardTitle>
          <CardDescription>Buildings where faults keep coming back this week, and in which trade.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={onSeeMore}>See more in Reports</Button>
      </CardHeader>
      <CardContent>
        {rows == null ? (
          <Skeleton className="h-40 w-full" />
        ) : rows.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No building shows a pattern this week.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-left text-sm text-muted-foreground">
                  <th className="p-2 font-medium">Building</th>
                  <th className="p-2 text-right font-medium">Faults reported</th>
                  <th className="w-1/2 p-2 font-medium">By trade</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-t align-top">
                    <th scope="row" className="p-2 text-left font-medium">
                      {row.label}
                      <div className="text-xs font-normal text-muted-foreground">{row.campus} · {row.type}</div>
                    </th>
                    <td className="p-2 text-right font-semibold">{row.total}</td>
                    <td className="p-2">
                      <div className="flex h-3 overflow-hidden rounded" style={{ width: `${(row.total / most) * 100}%` }} aria-hidden>
                        {row.trades.map((t) => (
                          <span key={t.label} style={{ width: `${(t.total / row.total) * 100}%`, background: (TRADE_THEMES[t.code ?? ''] ?? FALLBACK_TRADE_THEME).color }} />
                        ))}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {row.trades.map((t) => `${t.label} ${t.total}`).join(' · ')}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
