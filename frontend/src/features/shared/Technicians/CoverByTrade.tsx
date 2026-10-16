import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { CoverEnvelope } from '@/types';
import { cn } from '@/lib/utils';

/**
 * Who can work each trade at each campus: a trade a row, a campus a column.
 * A red cell is a service a requester can pick that no technician will see.
 * With `onFillGap`, a red cell opens Add Technician for that pair.
 */
export default function CoverByTrade({ cover, onFillGap }: {
  cover: CoverEnvelope | null;
  onFillGap?: (campusId: number, tradeId: number) => void;
}) {
  if (cover == null) return <Skeleton className="h-64 w-full rounded-xl" />;
  const cell = (campus: number, trade: number) =>
    cover.cells.find((c) => c.campus === campus && c.trade === trade);

  return (
    <Card aria-label="Cover by trade" className="p-6">
      <p className="mb-4 text-sm text-gray-700">
        A technician sees a ticket only where the campus and the trade both line up. Each cell counts
        technicians who match; a red cell is a service a requester can pick but nobody can work.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="p-2 text-left font-medium">Trade</th>
              {cover.campuses.map((c) => <th key={c.id} className="p-2 text-center font-medium">{c.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {cover.trades.map((t) => (
              <tr key={t.id} className="border-t">
                <th scope="row" className="p-2 text-left font-medium">{t.name}</th>
                {cover.campuses.map((c) => {
                  const here = cell(c.id, t.id);
                  const count = here?.technicians ?? 0;
                  const label = `${t.name} at ${c.name}: ${count ? `${count} technician${count === 1 ? '' : 's'}` : 'nobody'}, ${here?.open ?? 0} open`;
                  const pill = cn(
                    'inline-flex min-w-14 items-center justify-center rounded-md px-3 py-1.5 text-sm',
                    count ? 'bg-gray-100 text-gray-800' : 'bg-red-50 font-semibold text-red-700',
                  );
                  return (
                    <td key={c.id} className="p-1.5 text-center">
                      {!count && onFillGap ? (
                        <button type="button" className={cn(pill, 'hover:bg-red-100')} aria-label={`${label}. Add a technician`}
                          title={`${here?.open ?? 0} open · add a technician`} onClick={() => onFillGap(c.id, t.id)}>
                          none
                        </button>
                      ) : (
                        <span className={pill} aria-label={label} title={`${here?.open ?? 0} open`}>
                          {count || 'none'}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
