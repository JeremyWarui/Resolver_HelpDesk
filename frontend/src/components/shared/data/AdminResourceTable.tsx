import type React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SlidersHorizontal, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { Table as TanStackTable } from '@tanstack/react-table';
import { flexRender } from '@tanstack/react-table';

interface AdminResourceTableProps<T> {
  icon: React.ElementType;
  title: string;
  addLabel: string;
  onAdd: () => void;
  table: TanStackTable<T>;
  loading?: boolean;
  emptyMessage: string;
  itemCount: number;
  searchValue: string;
  onSearchChange: (value: string) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
}

export function AdminResourceTable<T>({
  icon: Icon,
  title,
  addLabel,
  onAdd,
  table,
  loading = false,
  emptyMessage,
  itemCount,
  searchValue,
  onSearchChange,
  pageSize,
  onPageSizeChange,
}: AdminResourceTableProps<T>) {
  const columns = table.getAllColumns();

  return (
    <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
      <Card className="w-full">
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <CardTitle className="flex items-center">
            <Icon className="h-6 w-6 mr-2" />
            {title}
          </CardTitle>
          <Button
            size="sm"
            className="bg-primary hover:bg-primary/90 flex items-center gap-1"
            onClick={onAdd}
          >
            <Plus className="h-4 w-4" />
            {addLabel}
          </Button>
        </CardHeader>
        <CardContent>
          {/* Search and Column Visibility */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center py-2">
            <Input
              placeholder="Search..."
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              className="max-w-sm"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="ml-auto">
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {columns
                  .filter((c) => c.id !== 'actions' && c.id !== 'searchField')
                  .map((col) => (
                    <DropdownMenuCheckboxItem
                      key={col.id}
                      className="capitalize"
                      checked={col.getIsVisible()}
                      onCheckedChange={(v) => col.toggleVisibility(!!v)}
                    >
                      {col.id}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Table */}
          <div className="rounded-sm border">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    {hg.headers.map((h) => (
                      <TableHead key={h.id}>
                        {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : table.getRowModel().rows.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                      {emptyMessage}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center space-x-4">
              <div className="text-sm text-muted-foreground">{itemCount} item(s)</div>
              <div className="flex items-center space-x-2">
                <p className="text-sm font-medium">Rows per page</p>
                <select
                  value={pageSize}
                  onChange={(e) => onPageSizeChange(Number(e.target.value))}
                  className="h-8 w-[70px] rounded border px-2"
                >
                  {[5, 10, 15, 20].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <span className="text-sm font-medium">
                Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
