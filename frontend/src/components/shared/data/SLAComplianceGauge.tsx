// SLAComplianceGauge — circular SVG gauge showing SLA compliance %.
// Colour: green ≥ target, amber within 5% below target, red > 5% below target.
// Uses --sla-* CSS tokens for all colours.

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { SLAComplianceResponse } from '@/types';

interface SLAComplianceGaugeProps {
  value: number;         // 0–100
  target?: number;       // default 95
  loading?: boolean;
  label?: string;
  size?: number;         // svg diameter in px, default 120
  className?: string;
}

function getGaugeColor(value: number, target: number): string {
  if (value >= target) return 'var(--sla-ok)';
  if (value >= target - 5) return 'var(--sla-warning)';
  return 'var(--sla-breach)';
}

export function SLAComplianceGauge({
  value,
  target = 95,
  loading = false,
  label = 'SLA compliance',
  size = 120,
  className,
}: SLAComplianceGaugeProps) {
  if (loading) {
    return (
      <div className={cn('flex flex-col items-center gap-2', className)}>
        <Skeleton className="rounded-full" style={{ width: size, height: size }} />
        <Skeleton className="h-4 w-24" />
      </div>
    );
  }

  const radius = (size / 2) * 0.72;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(Math.max(value, 0), 100);
  const dashOffset = circumference * (1 - pct / 100);
  const color = getGaugeColor(pct, target);
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className={cn('flex flex-col items-center gap-1', className)}>
      {/* SVG + centred label overlay */}
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          {/* Track */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            strokeWidth={size * 0.1}
            className="stroke-muted"
          />
          {/* Progress */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            strokeWidth={size * 0.1}
            stroke={color}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold leading-none" style={{ color }}>
            {pct.toFixed(1)}%
          </span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground text-center">{label}</p>
      {pct < target && (
        <p className="text-[11px] text-muted-foreground">
          Target: {target}%
        </p>
      )}
    </div>
  );
}

// Convenience component that accepts a full SLAComplianceResponse
interface SLACompliancePanelProps {
  data: SLAComplianceResponse | null;
  loading?: boolean;
  className?: string;
}

export function SLACompliancePanel({ data, loading = false, className }: SLACompliancePanelProps) {
  return (
    <div className={cn('flex flex-wrap items-start gap-8 justify-center', className)}>
      <div className="flex flex-col items-center gap-2">
        <SLAComplianceGauge
          value={data?.resolution_sla_pct ?? 0}
          loading={loading}
          label="Resolution SLA"
          size={120}
        />
        {data && (
          <p className="text-xs text-muted-foreground">
            {data.at_risk} at-risk · {data.breached} breached
          </p>
        )}
      </div>
      <SLAComplianceGauge
        value={data?.response_sla_pct ?? 0}
        loading={loading}
        label="Response SLA"
        size={120}
      />
    </div>
  );
}
