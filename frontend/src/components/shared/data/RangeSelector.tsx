import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { RANGES, RANGE_KEYS, type RangeKey } from '@/constants/analytics';

interface Props {
  value: RangeKey;
  onChange: (key: RangeKey) => void;
}

/** Picks the window a report is read over. */
export default function RangeSelector({ value, onChange }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          {RANGES[value].label} <ChevronDown className="ml-1 h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {RANGE_KEYS.map((key) => (
          <DropdownMenuItem key={key} onClick={() => onChange(key)}>
            {RANGES[key].label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
