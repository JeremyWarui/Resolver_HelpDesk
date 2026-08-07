import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';

export type Granularity = 'day' | 'week' | 'month' | 'quarter';

const LABELS: Record<Granularity, string> = {
  day: 'Daily',
  week: 'Weekly',
  month: 'Monthly',
  quarter: 'Quarterly',
};

interface GranularitySelectorProps {
  value: Granularity;
  onChange: (g: Granularity) => void;
  className?: string;
}

export function GranularitySelector({ value, onChange, className }: GranularitySelectorProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          {LABELS[value]} <ChevronDown className="ml-1 h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(Object.keys(LABELS) as Granularity[]).map((g) => (
          <DropdownMenuItem key={g} onClick={() => onChange(g)}>
            {LABELS[g]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
