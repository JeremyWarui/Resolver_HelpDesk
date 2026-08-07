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
import type { Technician } from '@/types';
import type { PerformanceTechniciansResponse, TechnicianBreakdownItem } from '@/types';

export interface TechnicianRow {
  technician: Technician;
  assigned: number;
  resolved: number;
  avgResolutionHours: number;
  slaComplianceRate: number;  // 0–100
}

interface TechnicianPerformanceTableProps {
  rows: TechnicianRow[];
  loading?: boolean;
  title?: string;
}

// Alternative: accept PerformanceTechniciansResponse directly
interface TechnicianPerformanceTableDataProps {
  data: PerformanceTechniciansResponse | null;
  loading?: boolean;
  title?: string;
}

const col = createColumnHelper<TechnicianRow>();

const COLUMNS = [
  col.accessor((r) => r.technician.name ?? `${r.technician.first_name} ${r.technician.last_name}`, {
    id: 'name',
    header: 'Technician',
    cell: (info) => <span className="font-medium text-sm">{info.getValue()}</span>,
  }),
  col.accessor('assigned', {
    header: 'Assigned',
    cell: (info) => <span className="text-sm">{info.getValue()}</span>,
  }),
  col.accessor('resolved', {
    header: 'Resolved',
    cell: (info) => <span className="text-sm">{info.getValue()}</span>,
  }),
  col.accessor('avgResolutionHours', {
    header: 'Avg Res. (h)',
    cell: (info) => <span className="text-sm">{info.getValue().toFixed(1)}</span>,
  }),
  col.accessor('slaComplianceRate', {
    header: 'SLA %',
    cell: (info) => {
      const rate = info.getValue();
      const color = rate >= 90 ? 'var(--sla-ok)' : rate >= 85 ? 'var(--sla-warning)' : 'var(--sla-breach)';
      return (
        <div className="flex items-center gap-2 min-w-[100px]">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${rate}%`, backgroundColor: color }}
            />
          </div>
          <span className="text-xs text-muted-foreground w-10 text-right">{rate}%</span>
        </div>
      );
    },
  }),
];

function SortIcon({ sorted }: { sorted: false | 'asc' | 'desc' }) {
  if (!sorted) return <ChevronsUpDown className="h-3 w-3 opacity-40" />;
  return sorted === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
}

export function TechnicianPerformanceTable({ rows, loading = false, title = 'Technician Performance' }: TechnicianPerformanceTableProps) {
  // TanStack Table's useReactTable() returns an interior-mutable table instance whose
  // method references can't be safely memoized — opt out of React Compiler optimization.
  // See https://react.dev/reference/react-compiler/directives/use-no-memo
  'use no memo';

  const [sorting, setSorting] = useState<SortingState>([{ id: 'resolved', desc: true }]);

  // eslint-disable-next-line react-hooks/incompatible-library -- known, handled above
  const table = useReactTable({
    data: rows,
    columns: COLUMNS,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : (
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="border-b bg-muted/30">
                  {hg.headers.map((h) => (
                    <TableHead key={h.id} className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground uppercase tracking-wide font-medium">
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
                  <TableCell colSpan={COLUMNS.length} className="h-20 text-center text-sm text-muted-foreground">
                    No data
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="px-3 py-2.5">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
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
              <TableHead key={h.id} className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground uppercase tracking-wide font-medium">
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
                <TableCell key={cell.id} className="px-3 py-2.5">
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
