// TechnicianPerformanceTable — sortable performance table with per-row workload bar.
// Extends DataTable using shadcn Table primitives directly (simpler than full DataTable
// for a fixed-schema, read-only analytics table).

import { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import type { PerformanceTechniciansResponse, TechnicianBreakdownItem } from '@/types';

interface TechnicianPerformanceTableDataProps {
  data: PerformanceTechniciansResponse | null;
  loading?: boolean;
  title?: string;
}

function SortIcon({ sorted }: { sorted: false | 'asc' | 'desc' }) {
  if (!sorted) return <ChevronsUpDown className="h-3 w-3 opacity-40" />;
  return sorted === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
}
// Breakdown table — simpler variant that works with PerformanceTechniciansResponse.breakdown
const breakdownCol = createColumnHelper<TechnicianBreakdownItem>();

const BREAKDOWN_COLUMNS = [
  breakdownCol.accessor((r) => `${r.first_name} ${r.last_name}`.trim() || r.username, {
    id: 'name',
    header: 'Name',
    cell: (info) => <span className="font-medium text-sm">{info.getValue()}</span>,
  }),
  breakdownCol.accessor('total_assigned', {
    header: 'Total Assigned',
    cell: (info) => <span className="text-sm">{info.getValue()}</span>,
  }),
  breakdownCol.accessor('open_count', {
    header: 'Open',
    cell: (info) => <span className="text-sm text-status-open">{info.getValue()}</span>,
  }),
  breakdownCol.accessor('resolved_count', {
    header: 'Resolved',
    cell: (info) => <span className="text-sm text-status-resolved">{info.getValue()}</span>,
  }),
  breakdownCol.accessor('escalated_count', {
    header: 'Escalated',
    cell: (info) => {
      const v = info.getValue();
      return <span className={`text-sm ${v > 0 ? 'text-status-escalated' : 'text-muted-foreground'}`}>{v}</span>;
    },
  }),
];

// Columns whose header word is far longer than the number under it. Left at the
// shared padding they reserve width for "Escalated" and then print "1", which
// is the gap that makes these tables read as sparse rather than dense.
const NARROW_COLUMNS = new Set(['resolved_count', 'escalated_count', 'total_assigned']);
const cellPad = (id: string) => (NARROW_COLUMNS.has(id) ? 'px-1' : 'px-2');

interface TechnicianBreakdownTableDataBareProps extends TechnicianPerformanceTableDataProps {
  bare?: boolean; // When true, renders only the table without Card wrapper
}

export function TechnicianBreakdownTable({ data, loading = false, title = 'Technician Performance', bare = false }: TechnicianBreakdownTableDataBareProps) {
  // TanStack Table's useReactTable() returns an interior-mutable table instance whose
  // method references can't be safely memoized — opt out of React Compiler optimization.
  // See https://react.dev/reference/react-compiler/directives/use-no-memo
  'use no memo';

  const [sorting, setSorting] = useState<SortingState>([{ id: 'resolved_count', desc: true }]);
  const rows = data?.breakdown ?? [];

  // eslint-disable-next-line react-hooks/incompatible-library -- known, handled above
  const table = useReactTable({
    data: rows,
    columns: BREAKDOWN_COLUMNS,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const tableContent = loading ? (
    <div className="p-4 space-y-2">
      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
    </div>
  ) : (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((hg) => (
          <TableRow key={hg.id} className="border-b bg-muted/30">
            {hg.headers.map((h) => (
              <TableHead key={h.id} className={`whitespace-nowrap ${cellPad(h.column.id)} py-2.5 text-xs text-muted-foreground uppercase tracking-wide font-medium`}>
                {h.isPlaceholder ? null : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2 h-6 gap-1 font-medium text-xs"
                    onClick={h.column.getToggleSortingHandler()}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    <SortIcon sorted={h.column.getIsSorted()} />
                  </Button>
                )}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody className="divide-y">
        {table.getRowModel().rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={BREAKDOWN_COLUMNS.length} className="h-20 text-center text-sm text-muted-foreground">
              No data
            </TableCell>
          </TableRow>
        ) : (
          table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className={`${cellPad(cell.column.id)} py-2.5`}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  // Bare mode: return just the table without Card wrapper
  if (bare) {
    return <div className="overflow-x-auto rounded-md border">{tableContent}</div>;
  }

  // Normal mode: wrapped in Card
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {tableContent}
      </CardContent>
    </Card>
  );
}
