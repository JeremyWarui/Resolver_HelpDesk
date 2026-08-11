/**
 * What share of each technician's work is which trade.
 *
 * Deliberately called *mix*, never workload or capacity. Mix is the share of a
 * person's jobs that were plumbing; capacity is how much of their time is
 * consumed. Ten lightbulbs and ten roof repairs count the same here, so this
 * cannot say who is busy — and a bar labelled "workload" will be read as though
 * it can, and used to argue for headcount. The count sits beside every bar so
 * the reader can see the sample they are judging.
 *
 * Self-fetching and role-gated: the endpoint 403s for technicians by design
 * (it is a peer ranking with a second axis), so the caller passes `enabled`.
 */
import { usePerformanceTradeMix } from '@/hooks/analytics/usePerformanceTradeMix';
import ChartCard from '@/components/shared/data/ChartCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useTradeColours, tradeBucket } from '@/constants/tradeColours';
import type { AnalyticsParams } from '@/types';

interface Props {
  params?: AnalyticsParams;
  enabled?: boolean;
}

export function TechnicianTradeMix({ params, enabled = true }: Props) {
  const { data, loading } = usePerformanceTradeMix(params, { enabled });
  const technicians = data?.technicians ?? [];

  // Shared with the facility chart below, so a trade is the same colour in both.
  const tradeColour = useTradeColours();

  return (
    <ChartCard
      title="Work mix by technician"
      description="Share of each person's jobs by trade. Job counts, not hours — this shows what people work on, not how busy they are."
    >
      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : technicians.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No assigned work in this period.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Legend — needed because the bars are too thin to label inline.
              Every segment also has its count in the row below, so colour is
              never the only thing carrying the meaning. */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {[...tradeColour].map(([trade, colour]) => (
              <span key={trade} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: colour }}
                />
                {trade}
              </span>
            ))}
          </div>

          <div className="space-y-3">
            {technicians.map((tech) => (
              <div key={tech.technician_id} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium" title={tech.name}>
                    {tech.name}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {tech.total} job{tech.total === 1 ? '' : 's'} · {tech.open_count} open
                  </span>
                </div>

                <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                  {tech.trades.map((slice) => (
                    <div
                      key={slice.trade_id}
                      style={{
                        width: `${slice.share * 100}%`,
                        backgroundColor: tradeColour.get(tradeBucket(slice.trade, tradeColour)),
                      }}
                      title={`${slice.trade}: ${slice.total} of ${tech.total}`}
                    />
                  ))}
                </div>

                <p className="text-xs text-muted-foreground">
                  {tech.trades
                    .map((s) => `${s.trade} ${Math.round(s.share * 100)}% (${s.total})`)
                    .join(' · ')}
                </p>
              </div>
            ))}
          </div>

          <p className="border-t border-border pt-3 text-xs text-muted-foreground">
            A trade that dominates the mix while few people can work it is a
            staffing signal. A person on one trade is not necessarily
            under-used — they may be the only one qualified for it.
          </p>
        </div>
      )}
    </ChartCard>
  );
}

export default TechnicianTradeMix;
