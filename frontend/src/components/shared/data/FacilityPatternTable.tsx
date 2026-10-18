import { tradeTheme } from '@/constants/catalogue';
import type { OverviewFacility } from '@/types';
import { formatSeconds } from '@/utils/date';
import { cn } from '@/lib/utils';

/** Buildings where faults keep coming back: each one's faults as a bar split by
 *  trade. `detail` adds what came back, the suggestion and what is open now,
 *  as the Reports page shows; the dashboard leaves them out. */
export default function FacilityPatternTable({ rows, detail = false }: { rows: OverviewFacility[]; detail?: boolean }) {
  const most = Math.max(1, ...rows.map((r) => r.total));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-left text-sm text-muted-foreground">
            <th className="p-2 font-medium">Building</th>
            <th className="p-2 text-right font-medium">{detail ? 'Faults' : 'Faults reported'}</th>
            <th className={cn('p-2 font-medium', detail ? 'w-[28%]' : 'w-1/2')}>By trade</th>
            {detail && (
              <>
                <th className="p-2 font-medium">Keeps coming back</th>
                <th className="p-2 font-medium">Suggests</th>
                <th className="p-2 text-right font-medium">Open</th>
              </>
            )}
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
                    <span key={t.label} style={{ width: `${(t.total / row.total) * 100}%`, background: tradeTheme(t.code).color }} />
                  ))}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {row.trades.map((t) => `${t.label} ${t.total}`).join(' · ')}
                </div>
              </td>
              {detail && (
                <>
                  <td className="p-2">
                    {row.repeats.length
                      ? row.repeats.map((r) => `${r.label} ${r.total}×`).join(', ')
                      : <span className="text-muted-foreground">{row.resolution_seconds_avg ? `Time to resolve ${formatSeconds(row.resolution_seconds_avg)}` : '—'}</span>}
                  </td>
                  <td className="p-2">
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', row.flag === 'act' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800')}>
                      {row.suggestion}
                    </span>
                  </td>
                  <td className="p-2 text-right">{row.open_now}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
