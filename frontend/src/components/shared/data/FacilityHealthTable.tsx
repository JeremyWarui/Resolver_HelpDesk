import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import ChartCard from '@/components/shared/data/ChartCard';
import { useFacilityHealth } from '@/hooks/useAnalytics';
import type { AnalyticsParams } from '@/types';

interface Props {
  params?: AnalyticsParams;
}

/**
 * Facility health: every building on the register, and the work raised against
 * it by trade. `useFacilityHealth` does the join.
 *
 * The trade split is what turns volume into health: twelve tickets on one block
 * is a different problem when they are all plumbing than when they are spread
 * across five crafts.
 */
export default function FacilityHealthTable({ params }: Props) {
  const { rows, loading } = useFacilityHealth(params);
  const silent = rows.filter((f) => f.total === 0).length;

  return (
    <ChartCard
      title="Facility Health"
      description="Every building on the register, and which craft its work belongs to"
    >
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No facilities on the register
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Facility</TableHead>
                  <TableHead>Campus</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                  <TableHead className="text-center">Open</TableHead>
                  <TableHead className="text-center">Escalated</TableHead>
                  <TableHead>By trade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((f) => (
                  <TableRow key={f.id} className={f.total === 0 ? 'bg-muted/20' : undefined}>
                    <TableCell className="font-medium text-sm">{f.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{f.campus}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{f.type}</TableCell>
                    <TableCell className="text-center text-sm">
                      {f.total === 0 ? <span className="text-muted-foreground">—</span> : f.total}
                    </TableCell>
                    <TableCell className="text-center text-sm text-status-open">
                      {f.open || ''}
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      {f.escalated > 0 ? (
                        <span className="text-status-escalated">{f.escalated}</span>
                      ) : (
                        ''
                      )}
                    </TableCell>
                    <TableCell>
                      {f.trades.length === 0 ? (
                        <span className="text-xs text-muted-foreground">Never reported</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {f.trades.slice(0, 4).map((t) => (
                            <Badge
                              key={t.trade}
                              variant="outline"
                              className={`text-[10px] font-normal ${
                                t.trade === f.topTrade ? 'border-primary/40 text-primary' : ''
                              }`}
                            >
                              {t.trade} {t.total}
                            </Badge>
                          ))}
                          {f.trades.length > 4 && (
                            <span className="text-[10px] text-muted-foreground">
                              +{f.trades.length - 4}
                            </span>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {silent > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {silent} building{silent === 1 ? ' has' : 's have'} had no ticket raised in
              your scope — either well kept, or somewhere nobody knows how to report.
            </p>
          )}
        </>
      )}
    </ChartCard>
  );
}
