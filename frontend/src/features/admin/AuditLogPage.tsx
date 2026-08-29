import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarIcon, ChevronLeft, ChevronRight, Search, ShieldAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { getAuditLog, type AuditLogEntry } from '@/lib/api/admin';
import { formatDateTimeLocal } from '@/utils/date';

const EVENT_BADGE: Record<string, { bg: string; text: string }> = {
  created: { bg: 'var(--status-resolved-bg)', text: 'var(--status-resolved-text)' },
  assigned: { bg: 'var(--status-assigned-bg)', text: 'var(--status-assigned-text)' },
  reassigned: { bg: 'var(--status-assigned-bg)', text: 'var(--status-assigned-text)' },
  status_changed: { bg: 'var(--status-progress-bg)', text: 'var(--status-progress-text)' },
  escalated: { bg: 'var(--status-escalated-bg)', text: 'var(--status-escalated-text)' },
  priority_changed: { bg: 'var(--status-progress-bg)', text: 'var(--status-progress-text)' },
  comment_added: { bg: 'var(--status-assigned-bg)', text: 'var(--status-assigned-text)' },
  resolved: { bg: 'var(--status-resolved-bg)', text: 'var(--status-resolved-text)' },
  closed: { bg: 'var(--status-closed-bg)', text: 'var(--status-closed-text)' },
  reopened: { bg: 'var(--status-progress-bg)', text: 'var(--status-progress-text)' },
  rated: { bg: 'var(--status-resolved-bg)', text: 'var(--status-resolved-text)' },
  sla_breach: { bg: 'var(--status-escalated-bg)', text: 'var(--status-escalated-text)' },
};

function badgeStyle(event: string) {
  const badge = EVENT_BADGE[event] ?? {
    bg: 'var(--status-closed-bg)',
    text: 'var(--status-closed-text)',
  };
  return { backgroundColor: badge.bg, color: badge.text, borderColor: 'currentColor' };
}

/** What changed, in the words the row carries. */
function change(entry: AuditLogEntry): string {
  if (entry.from_value && entry.to_value) return `${entry.from_value} → ${entry.to_value}`;
  return entry.to_value || entry.from_value || '—';
}

const PAGE_SIZE = 20;

/** Every ticket log row in the system. The one read that is not ticket-scoped. */
export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filters = { search, dateFrom, dateTo };
  const { data, isLoading: loading } = useQuery({
    queryKey: ['audit-log', page, filters],
    queryFn: async () => {
      const res = await getAuditLog({
        page,
        page_size: PAGE_SIZE,
        actor: search || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      return res.data;
    },
  });

  const entries: AuditLogEntry[] = data?.results ?? [];
  const total = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /** Changing a filter starts the listing again from the first page. */
  function filter(apply: () => void) {
    apply();
    setPage(1);
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
      <Card className="w-full">
        <CardHeader className="pb-3 pt-6 px-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-5 w-5 text-gray-500" />
              Audit Log
              {!loading && (
                <span className="text-sm font-normal text-gray-400 ml-1">
                  ({total.toLocaleString()} events)
                </span>
              )}
            </CardTitle>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <Input
                  placeholder="Search by actor…"
                  value={search}
                  onChange={(e) => filter(() => setSearch(e.target.value))}
                  className="pl-9 pr-8 h-8 w-56 text-xs"
                />
                {search && (
                  <button
                    className="absolute right-2.5 top-1/2 -translate-y-1/2"
                    onClick={() => filter(() => setSearch(''))}
                  >
                    <X className="h-3.5 w-3.5 text-gray-400" />
                  </button>
                )}
              </div>
              <div className="relative">
                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => filter(() => setDateFrom(e.target.value))}
                  className="pl-9 h-8 w-44 text-xs"
                  title="From date"
                />
              </div>
              <div className="relative">
                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => filter(() => setDateTo(e.target.value))}
                  className="pl-9 h-8 w-44 text-xs"
                  title="To date"
                />
              </div>
              {(dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() =>
                    filter(() => {
                      setDateFrom('');
                      setDateTo('');
                    })
                  }
                >
                  Clear dates
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-6 pb-0">
          <div className="border-t -mx-6">
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
                    <TableRow>
                      <TableHead className="text-xs">Actor</TableHead>
                      <TableHead className="text-xs">Event</TableHead>
                      <TableHead className="text-xs">Ticket</TableHead>
                      <TableHead className="text-xs">Change</TableHead>
                      <TableHead className="text-xs">Escalated to</TableHead>
                      <TableHead className="text-xs">Reason</TableHead>
                      <TableHead className="text-xs">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry) => (
                      <TableRow key={entry.id} className="hover:bg-gray-50">
                        <TableCell className="py-2.5">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-800 truncate">
                              {entry.actor?.full_name ?? (
                                <span className="text-gray-400 italic">System</span>
                              )}
                            </div>
                            {entry.actor?.username && (
                              <div className="text-xs text-gray-400 font-mono truncate">
                                @{entry.actor.username}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <span
                            className="text-xs px-2.5 py-1 rounded-md font-medium capitalize border"
                            style={badgeStyle(entry.event_type)}
                          >
                            {entry.event_type.replace(/_/g, ' ')}
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5 text-xs font-medium text-gray-700">
                          {entry.ticket_no}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs text-gray-600">
                          {change(entry)}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs text-gray-600">
                          {entry.level_user?.full_name ?? '—'}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs text-gray-600 max-w-xs truncate">
                          {entry.reason || '—'}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs text-gray-500 whitespace-nowrap">
                          {formatDateTimeLocal(entry.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {!loading && total > 0 && (
            <div className="flex items-center justify-between px-6 py-3 border-t -mx-6 text-xs text-gray-500">
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of{' '}
                {total.toLocaleString()}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="px-2">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
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
