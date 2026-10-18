import { cn } from '@/lib/utils';
import { rovingKeyDown } from '@/utils/roving';

interface Tab<K extends string> {
  key: K;
  label: string;
  /** A count badge after the label; zero shows none. */
  count?: number;
  /** Red when the count is something to act on now. */
  urgent?: boolean;
}

/**
 * An underlined row of tabs over one panel. Arrow keys move along it and only
 * the chosen tab is a Tab stop. `panelId` names the panel the tabs control.
 */
export function TabBar<K extends string>({ tabs, active, onSelect, panelId, label }: {
  tabs: Tab<K>[];
  active: K;
  onSelect: (key: K) => void;
  panelId: string;
  /** What the row of tabs chooses, for screen readers. */
  label: string;
}) {
  const keys = tabs.map((t) => t.key);
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex gap-1 overflow-x-auto px-3 sm:px-4 border-b border-gray-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map(({ key, label: text, count, urgent }) => {
        const selected = active === key;
        return (
          <button
            key={key}
            id={`${panelId}-tab-${key}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(key)}
            onKeyDown={(e) => rovingKeyDown(e, keys, active, onSelect)}
            className={cn(
              'relative shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-sm transition-colors rounded-md',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected ? 'font-semibold text-gray-900' : 'text-gray-500 hover:text-gray-800',
            )}
          >
            {text}
            {!!count && (
              <span
                className={cn(
                  'rounded-full px-1.5 text-[11px] font-semibold leading-5 text-white tabular-nums',
                  urgent ? 'bg-red-600' : 'bg-blue-600',
                )}
              >
                {count > 99 ? '99+' : count}
              </span>
            )}
            {selected && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-gray-900" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
