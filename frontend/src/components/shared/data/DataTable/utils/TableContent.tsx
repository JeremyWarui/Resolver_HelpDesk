import { flexRender, type Table as TanStackTable, type ColumnDef } from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface TableContentProps<TData> {
  table: TanStackTable<TData>;
  columns: ColumnDef<TData>[];
  onRowClick?: (row: TData) => void;
  selectedRowId?: number | null;
  rowClassName?: (row: TData) => string;
  loading?: boolean;
  emptyStateMessage: string;
  emptyStateDescription: string;
  actualTotalItems: number;
  pageSize: number;
  pageIndex: number;
  handlePageSizeChange: (size: number) => void;
  handlePageChange: (page: number) => void;
}

export function RenderTableContent<TData>({
  table,
  columns,
  onRowClick,
  selectedRowId,
  rowClassName,
  loading,
  emptyStateMessage,
  emptyStateDescription,
  actualTotalItems,
  pageSize,
  pageIndex,
  handlePageSizeChange,
  handlePageChange,
}: TableContentProps<TData>) {
  // Type guard to check if row has id property
  const getRowId = (row: TData): number | null => {
    if (row && typeof row === 'object' && 'id' in row) {
      return (row as { id: number }).id;
    }
    return null;
  };
  if (loading) {
    return <div className="py-8 text-center">Loading...</div>;
  }

  return (
    <>
      <div className="rounded-sm border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="text-sm font-semibold">
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => {
                const rowId = getRowId(row.original);
                const isSelected = rowId !== null && rowId === selectedRowId;
                const extraClass = rowClassName ? rowClassName(row.original) : '';
                return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    onClick={() => onRowClick && onRowClick(row.original)}
                    className={`${onRowClick ? "cursor-pointer hover:bg-gray-100 transition-colors duration-150" : ""} ${isSelected ? "bg-blue-50 border-l-4 border-l-blue-500" : ""} ${extraClass}`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  <div className="flex flex-col items-center justify-center py-8">
                    <p className="text-lg font-medium text-muted-foreground">
                      {emptyStateMessage}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {emptyStateDescription}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between space-x-2 py-4">
        <div className="flex items-center space-x-6">
          <div className="text-sm text-muted-foreground">
            {(() => {
              if (actualTotalItems > 0) {
                // Client-side pagination: show range (e.g., "Showing 1-10 of 25 tickets")
                const startItem = (pageIndex * pageSize) + 1;
                const endItem = Math.min((pageIndex + 1) * pageSize, actualTotalItems);
                
                if (actualTotalItems <= pageSize) {
                  // Single page: just show total
                  return `${actualTotalItems} ticket(s) found`;
                } else {
                  // Multi-page: show range
                  return `Showing ${startItem}-${endItem} of ${actualTotalItems} tickets`;
                }
              } else {
                return "No tickets found";
              }
            })()}
          </div>
          <div className="flex items-center space-x-2">
            <p className="text-sm font-medium">Rows per page</p>
            <Select
              value={`${pageSize}`}
              onValueChange={(value) => handlePageSizeChange(Number(value))}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue placeholder={pageSize} />
              </SelectTrigger>
              <SelectContent side="top">
                {[10, 20, 30, 50].map((size) => (
                  <SelectItem key={size} value={`${size}`}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(pageIndex - 1)}
            disabled={pageIndex === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <div className="flex items-center justify-center text-sm font-medium">
            Page {pageIndex + 1} of {Math.ceil(actualTotalItems / pageSize) || 1}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(pageIndex + 1)}
            disabled={pageIndex + 1 >= Math.ceil(actualTotalItems / pageSize)}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </>
  );
}
