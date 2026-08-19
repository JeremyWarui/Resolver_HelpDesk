import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  type ColumnDef, type SortingState,
  getCoreRowModel, getSortedRowModel, useReactTable,
  flexRender,
} from '@tanstack/react-table';
import { ShieldAlert, ChevronLeft, ChevronRight, Search, X, CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { getAuditLog, type AuditLogEntry } from '@/lib/api/admin';
import { sortableHeader } from '@/components/shared/data/DataTable/utils/sortableHeader';
import { formatDateTimeLocal } from '@/utils/date';

const ACTION_BADGE: Record<string, { bg: string; text: string }> = {
  created:        { bg: 'var(--status-resolved-bg)', text: 'var(--status-resolved-text)' },
  assigned:       { bg: 'var(--status-assigned-bg)', text: 'var(--status-assigned-text)' },
  reassigned:     { bg: 'var(--status-assigned-bg)', text: 'var(--status-assigned-text)' },
  status_changed: { bg: 'var(--status-progress-bg)', text: 'var(--status-progress-text)' },
  escalated:      { bg: 'var(--status-escalated-bg)', text: 'var(--status-escalated-text)' },
  priority_changed:{ bg: 'var(--status-progress-bg)', text: 'var(--status-progress-text)' },
  comment_added:  { bg: 'var(--status-assigned-bg)', text: 'var(--status-assigned-text)' },
  resolved:       { bg: 'var(--status-resolved-bg)', text: 'var(--status-resolved-text)' },
  closed:         { bg: 'var(--status-closed-bg)', text: 'var(--status-closed-text)' },
  reopened:       { bg: 'var(--status-progress-bg)', text: 'var(--status-progress-text)' },
  rated:          { bg: 'var(--status-resolved-bg)', text: 'var(--status-resolved-text)' },
  sla_breach:     { bg: 'var(--status-escalated-bg)', text: 'var(--status-escalated-text)' },
};

function actionBadgeStyle(action: string) {
  const badge = ACTION_BADGE[action] || {
    bg: 'var(--status-closed-bg)',
    text: 'var(--status-closed-text)',
  };
  return {
    backgroundColor: badge.bg,
    color: badge.text,
  };
}

const PAGE_SIZE = 20;

export default function AuditLogPage() {
  // TanStack Table's useReactTable() returns an interior-mutable table instance whose
  // method references can't be safely memoized — opt out of React Compiler optimization.
  // See https://react.dev/reference/react-compiler/directives/use-no-memo
  'use no memo';

  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);

  const actorHeader = sortableHeader('Actor');
  const actionHeader = sortableHeader('Action');

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getAuditLog({
        page,
        page_size: PAGE_SIZE,
        actor: search || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      setEntries(data.results);
      setTotal(data.count);
    } catch {
      // Silently handle — the endpoint may not exist yet
      setEntries([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, search, dateFrom, dateTo]);

  useEffect(() => { fetch(); }, [fetch]);

  // Reset to page 1 on filter change
  useEffect(() => { setPage(1); }, [search, dateFrom, dateTo]);

  const columns: ColumnDef<AuditLogEntry>[] = useMemo(() => [
    {
      accessorKey: 'actor',
      header: actorHeader,
      // Name first, handle underneath. An audit log is scanned for "who did
      // this", and a handle like `jkamau` needs a lookup before it answers
      // that. The username stays visible because names are not unique and it
      // is the handle you would search or report by.
      cell: ({ row }) => {
        const entry = row.original;
        return (
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-800 truncate">
              {entry.actor ?? <span className="text-gray-400 italic">System</span>}
            </div>
            {entry.actor_username && (
              <div className="text-xs text-gray-400 font-mono truncate">@{entry.actor_username}</div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'action',
      header: actionHeader,
      cell: ({ row }) => {
        const action = row.getValue('action') as string;
        return (
          <span
            className="text-xs px-2.5 py-1 rounded-md font-medium capitalize border"
            style={{
              ...actionBadgeStyle(action),
              borderColor: 'currentColor',
              opacity: 0.9,
            }}
          >
            {action.replace(/_/g, ' ')}
          </span>
        );
      },
    },
    {
      accessorKey: 'target_type',
      header: 'Object Type',
      cell: ({ row }) => (
        <span className="text-xs text-gray-600 capitalize">
          {(row.getValue('target_type') as string).replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      accessorKey: 'ticket_no',
      header: 'Ticket',
      cell: ({ row }) => (
        <span className="text-xs font-medium text-gray-700">
          {row.getValue('ticket_no') ?? '—'}
        </span>
      ),
    },
    {
      accessorKey: 'priority',
      header: 'Priority',
      cell: ({ row }) => (
        <span className="text-xs text-gray-600">
          {(row.getValue('priority') as string) ?? '—'}
        </span>
      ),
    },
    {
      accessorKey: 'department',
      header: 'Department',
      cell: ({ row }) => (
        <span className="text-xs text-gray-600">
          {(row.getValue('department') as string) ?? '—'}
        </span>
      ),
    },
    {
      accessorKey: 'detail',
      header: 'Detail',
      cell: ({ row }) => (
        <span className="text-xs text-gray-600 max-w-xs truncate block">
          {(row.getValue('detail') as string) || '—'}
        </span>
      ),
    },
    {
      accessorKey: 'reason',
      header: 'Reason',
      cell: ({ row }) => (
        <span className="text-xs text-gray-600 max-w-xs truncate block">
          {(row.getValue('reason') as string) || '—'}
        </span>
      ),
    },
    {
      accessorKey: 'created_at',
      header: 'Date',
      cell: ({ row }) => (
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {formatDateTimeLocal(row.getValue('created_at'))}
        </span>
      ),
    },
  ], [actorHeader, actionHeader]);

  // TanStack Table's table instance is interior-mutable by design (v9 will add a
  // compiler-safe API); the 'use no memo' directive above is the documented opt-out.
  // eslint-disable-next-line react-hooks/incompatible-library -- known, handled above
  const table = useReactTable({
    data: entries,
    columns,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { sorting },
    manualPagination: true,
    pageCount: Math.ceil(total / PAGE_SIZE),
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
      <Card className="w-full">
        <CardHeader className="pb-3 pt-6 px-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-5 w-5 text-gray-500" />
              Audit Log
              {!loading && (
                <span className="text-sm font-normal text-gray-400 ml-1">({total.toLocaleString()} events)</span>
              )}
            </CardTitle>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Actor search */}
              <div className="relative min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <Input
                  placeholder="Search by actor…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 pr-8 h-8 w-56 text-xs"
                />
                {search && (
                  <button className="absolute right-2.5 top-1/2 -translate-y-1/2" onClick={() => setSearch('')}>
                    <X className="h-3.5 w-3.5 text-gray-400" />
                  </button>
                )}
              </div>
              {/* Date from */}
              <div className="relative">
                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="pl-9 h-8 w-48 text-xs"
                  title="From date"
                />
              </div>
              {/* Date to */}
              <div className="relative">
                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <Input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="pl-9 h-8 w-48 text-xs"
                  title="To date"
                />
              </div>
              {(dateFrom || dateTo) && (
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => { setDateFrom(''); setDateTo(''); }}>
                  Clear dates
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-6 pb-0">
          <div className="border-t -mx-6 mt-0">
            {loading ? (
              <div className="px-6 py-4 space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : entries.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <ShieldAlert className="h-10 w-10 mx-auto mb-3 text-gray-200" />
                <p className="text-sm">No audit log entries found</p>
                {(search || dateFrom || dateTo) && (
                  <p className="text-xs mt-1">Try adjusting your filters</p>
                )}
              </div>
            ) : (
              <div className="px-6">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map(hg => (
                    <TableRow key={hg.id}>
                      {hg.headers.map(header => (
                        <TableHead key={header.id} className="text-xs">
                          {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.map(row => (
                    <TableRow key={row.id} className="hover:bg-gray-50">
                      {row.getVisibleCells().map(cell => (
                        <TableCell key={cell.id} className="py-2.5">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            )}
          </div>

          {/* Pagination */}
          {!loading && total > 0 && (
            <div className="flex items-center justify-between px-6 py-3 border-t -mx-6 mt-0 text-xs text-gray-500">
              <span>
                Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="px-2">Page {page} of {totalPages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
