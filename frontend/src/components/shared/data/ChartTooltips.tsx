/**
 * Recharts tooltips, defined once.
 *
 * There were ten definitions of these across seven files — three genuinely
 * different shapes, each copied two to four times, all sharing the same card
 * styling written out by hand every time. Duplicated tooltips drift silently:
 * they only appear on hover, never side by side, so one gaining a colour dot
 * or losing a border goes unnoticed until someone screenshots two charts for
 * the same report.
 */

interface TooltipEntry {
  name?: string;
  value?: number | string;
  color?: string;
}

export interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white p-2 border border-gray-200 rounded shadow-sm">{children}</div>
  );
}

/** One series, keyed by the axis label. "Jan 5 — Tickets: 12" */
export function BarTooltip({ active, payload, label, unit = 'Tickets' }: ChartTooltipProps & { unit?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <Shell>
      <p className="text-xs font-medium text-gray-800">{label}</p>
      <p className="text-xs text-gray-600">{unit}: {payload[0].value}</p>
    </Shell>
  );
}

/** One slice, keyed by its own name — pie and donut charts carry no axis label. */
export function PieTooltip({ active, payload, unit = 'Tickets' }: ChartTooltipProps & { unit?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <Shell>
      <p className="text-xs font-medium text-gray-800">{payload[0].name}</p>
      <p className="text-xs text-gray-600">{unit}: {payload[0].value}</p>
    </Shell>
  );
}

/** Several series at one point — stacked and multi-line charts. */
export function SeriesTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <Shell>
      <p className="text-xs font-medium text-gray-800 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-xs text-gray-600">
          <span style={{ color: entry.color }}>●</span> {entry.name}: {entry.value}
        </p>
      ))}
    </Shell>
  );
}
