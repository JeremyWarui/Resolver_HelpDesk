import type { ReactNode } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * A register: search, a rail of buckets with live counts, and the rows of the
 * bucket you picked.
 *
 * The rail only ever filters. The rows stay grouped the same way and the row
 * card stays the same, so what a reader learns on "All" is what they read on
 * every tab.
 *
 * The technician roster and the facilities register were this layout written
 * twice, down to a private `RailItem` and `EmptyState` in each file.
 */

interface RailEntry {
  key: string;
  icon: ReactNode;
  label: string;
  /** Shown as a monospace chip beside the label — a trade code, say. */
  code?: string;
  count: number;
  /** Amber icon and label, for a bucket whose emptiness is the problem. */
  warn?: boolean;
}

export interface RailGroup {
  /** Small caps heading above the group. Omitted for the leading "All" entry. */
  heading?: string;
  entries: RailEntry[];
}

interface RailLayoutProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  loading: boolean;
  groups: RailGroup[];
  activeKey: string;
  onSelect: (key: string) => void;
  /** What one row is, for the count under each rail entry. */
  noun: { one: string; many: string };
  /** What an empty bucket says when nothing is being searched for. */
  emptyLabel: string;
  /** Colour an empty bucket amber — an unstaffed trade is worth noticing. */
  warnWhenEmpty?: boolean;
  children: ReactNode;
}

export function RailLayout({
  search,
  onSearchChange,
  searchPlaceholder,
  loading,
  groups,
  activeKey,
  onSelect,
  noun,
  emptyLabel,
  warnWhenEmpty = false,
  children,
}: RailLayoutProps) {
  const searching = search.trim().length > 0;

  return (
    <div className="flex-1 flex overflow-hidden bg-gray-50">
      <div className="w-72 shrink-0 border-r bg-white flex flex-col overflow-hidden">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-8 text-sm pl-8"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {loading
            ? [1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 rounded-md" />)
            : groups.map((group, index) => (
                <div key={group.heading ?? index} className="space-y-0.5">
                  {group.heading && (
                    <p className="px-3 pt-3 pb-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                      {group.heading}
                    </p>
                  )}
                  {group.entries.map((entry) => (
                    <RailItem
                      key={entry.key}
                      entry={entry}
                      active={activeKey === entry.key}
                      onClick={() => onSelect(entry.key)}
                      noun={noun}
                      emptyLabel={emptyLabel}
                      warnWhenEmpty={warnWhenEmpty}
                      searching={searching}
                    />
                  ))}
                </div>
              ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function RailItem({
  entry, active, onClick, noun, emptyLabel, warnWhenEmpty, searching,
}: {
  entry: RailEntry;
  active: boolean;
  onClick: () => void;
  noun: { one: string; many: string };
  emptyLabel: string;
  warnWhenEmpty: boolean;
  /** A zero means "no match" while a search runs, not "nothing here" — saying
   *  the latter would misreport the register to anyone typing. */
  searching: boolean;
}) {
  const { icon, label, code, count, warn = false } = entry;
  const emptyAndIdle = count === 0 && !searching;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-md transition-colors flex items-center gap-2 group/item ${
        active ? 'bg-primary/10' : 'hover:bg-gray-50'
      }`}
    >
      <span className={active ? 'text-primary' : warn ? 'text-amber-500' : 'text-gray-400'}>
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`text-sm font-medium truncate ${active ? 'text-primary' : 'text-gray-700'}`}>
            {label}
          </span>
          {code && (
            <Badge
              variant="outline"
              className={`text-[10px] font-mono ml-auto shrink-0 ${active ? 'border-primary/40 text-primary' : ''}`}
            >
              {code}
            </Badge>
          )}
        </div>
        <p className={`text-xs mt-0.5 ${warnWhenEmpty && emptyAndIdle ? 'text-amber-600' : 'text-gray-400'}`}>
          {count === 0
            ? (searching ? 'no match' : emptyLabel)
            : `${count} ${count === 1 ? noun.one : noun.many}`}
        </p>
      </div>
      <ChevronRight
        className={`h-3.5 w-3.5 shrink-0 transition-opacity ${
          active ? 'text-primary opacity-100' : 'text-gray-300 opacity-0 group-hover/item:opacity-100'
        }`}
      />
    </button>
  );
}

export function RailEmptyState({ icon, title, hint }: {
  icon: ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="text-center py-16">
      <div className="mb-3 flex justify-center text-gray-200">{icon}</div>
      <p className="text-sm font-medium text-gray-600">{title}</p>
      <p className="text-xs text-gray-400 mt-1">{hint}</p>
    </div>
  );
}
