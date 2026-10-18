import { Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TRADE_ICONS, tradeTheme } from '@/constants/catalogue';

/** A trade's icon on its own colour: the service tiles and the ticket wizard. */
export function TradeIcon({ code, className }: { code: string; className?: string }) {
  const theme = tradeTheme(code);
  const Icon = TRADE_ICONS[code] ?? Wrench;
  return (
    <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', theme.lightBg, className)}>
      <Icon className="h-5 w-5" style={{ color: theme.color }} aria-hidden />
    </span>
  );
}
