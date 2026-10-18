import { useState } from "react";
import {
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Updater,
} from "@tanstack/react-table";

import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";

import { DefaultTableHeader } from "./utils/TableHeaders";
import { RenderTableContent } from "./utils/TableContent";

export interface FilterOption {
  label: string;
  options: { label: string; value: string }[];
  value: string;
  onFilterChange: (value: string) => void;
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  title?: string;
  subtitle?: string;
  searchPlaceholder?: string;
  emptyStateMessage?: string;
  emptyStateDescription?: string;
  defaultPageSize?: number;
  initialColumnVisibility?: VisibilityState;
  filterOptions?: FilterOption[];
  onRowClick?: (row: TData) => void;
  selectedRowId?: number | null;
  totalItems?: number;
  loading?: boolean;
  /** The server pages, sorts and searches: the table shows `data` as given. */
  manualPagination?: boolean;
  /** The page the server returned, with `manualPagination`. */
  pageIndex?: number;
  onPageChange?: (pageIndex: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  onSearchChange?: (value: string) => void;
  /** The text a row is found by when the table searches in the browser. */
  searchText?: (row: TData) => string;
  onSortingChange?: (sorting: SortingState) => void;
  rowClassName?: (row: TData) => string;
  /** What one row is, for the footer's count. */
  noun?: { one: string; many: string };
}

const DataTable = <TData, TValue>({
  columns,
  data,
  // No default: `DefaultTableHeader` renders no header when the title is absent.
  title,
  subtitle,
  searchPlaceholder = "Search...",
  emptyStateMessage = "No data found",
  emptyStateDescription = "Try changing your filter or check back later",
  noun = { one: "row", many: "rows" },
  defaultPageSize = 10,
  initialColumnVisibility = {},
  filterOptions,
  onRowClick,
  selectedRowId,
  totalItems,
  loading = false,
  manualPagination = false,
  pageIndex: serverPageIndex = 0,
  onPageChange,
  onPageSizeChange,
  onSearchChange,
  searchText,
  onSortingChange,
  rowClassName,
}: DataTableProps<TData, TValue>) => {
  // TanStack Table's useReactTable() returns an interior-mutable table instance whose
  // method references can't be safely memoized — opt out of React Compiler optimization.
  // See https://react.dev/reference/react-compiler/directives/use-no-memo
  'use no memo';

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] =
    useState<VisibilityState>(initialColumnVisibility);
  const [searchValue, setSearchValue] = useState("");
  const [localPageIndex, setPageIndex] = useState(0);
  const [localPageSize, setPageSize] = useState(defaultPageSize);
  // With manualPagination the parent owns the page, so a filter that sends it
  // back to page 1 moves the footer too.
  const pageIndex = manualPagination ? serverPageIndex : localPageIndex;
  const pageSize = manualPagination ? defaultPageSize : localPageSize;

  const handleSortingChange = (updater: Updater<SortingState>) => {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    setSorting(next);
    if (manualPagination) onSortingChange?.(next);
  };

  const actualTotalItems = manualPagination ? totalItems || 0 : data.length;

  // eslint-disable-next-line react-hooks/incompatible-library -- known, handled above
  const table = useReactTable({
    data,
    columns,
    manualPagination,
    manualSorting: manualPagination,
    manualFiltering: manualPagination,
    pageCount: manualPagination
      ? Math.ceil(actualTotalItems / pageSize)
      : undefined,
    onSortingChange: handleSortingChange,
    onColumnVisibilityChange: setColumnVisibility,
    globalFilterFn: (row, _columnId, value: string) =>
      !searchText || searchText(row.original).toLowerCase().includes(value.toLowerCase()),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      sorting,
      globalFilter: searchValue,
      columnVisibility,
      pagination: {
        pageIndex,
        pageSize,
      },
    },
  });

  const handleSearch = (value: string) => {
    setSearchValue(value);
    if (manualPagination) {
      onSearchChange?.(value);
    } else {
      setPageIndex(0);
    }
  };

  const handlePageChange = (newPageIndex: number) => {
    if (manualPagination) {
      onPageChange?.(newPageIndex);
    } else {
      setPageIndex(newPageIndex);
    }
  };

  const handlePageSizeChange = (newPageSize: number) => {
    if (manualPagination) {
      onPageSizeChange?.(newPageSize);
    } else {
      setPageSize(newPageSize);
      setPageIndex(0);
    }
  };

  const filters = Array.isArray(filterOptions)
    ? filterOptions.map((filter, index) => (
        <Select
          key={`filter-${index}-${filter.label}`}
          onValueChange={filter.onFilterChange}
          value={filter.value}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={filter.label} />
          </SelectTrigger>
          <SelectContent>
            {filter.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))
    : null;

  const columnVisibilityDropdown = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="ml-auto"
        >
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {table
          .getAllColumns()
          .filter((column) => column.getCanHide())
          .map((column) => {
            return (
              <DropdownMenuCheckboxItem
                key={column.id}
                className="capitalize"
                checked={column.getIsVisible()}
                onCheckedChange={(value) => column.toggleVisibility(!!value)}
              >
                {column.id}
              </DropdownMenuCheckboxItem>
            );
          })}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const headerProps = {
    title,
    subtitle,
    handleSearch,
    searchValue,
    searchPlaceholder,
    filters,
    columnVisibilityDropdown,
  };

  const tableContentProps = {
    table,
    columns: columns as ColumnDef<TData>[],
    onRowClick,
    selectedRowId,
    rowClassName,
    actualTotalItems,
    pageSize,
    pageIndex,
    handlePageSizeChange,
    handlePageChange,
    loading,
    emptyStateMessage,
    emptyStateDescription,
    noun,
  };

  return (
    <Card className="w-full">
      <CardContent className="pt-7">
        <DefaultTableHeader {...headerProps} />

        <RenderTableContent {...tableContentProps} />
      </CardContent>
    </Card>
  );
};

export default DataTable;
