import { useState, useEffect, type ReactNode } from "react";
import {
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
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
  defaultValue?: string;
  value?: string;
  onFilterChange: (value: string) => void;
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  title?: string;
  subtitle?: string;
  /** Rendered at the right of the title row — a page's "Add" button. */
  titleAction?: ReactNode;
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
  manualPagination?: boolean;
  onPageChange?: (pageIndex: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
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
  titleAction,
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
  onPageChange,
  onPageSizeChange,
  rowClassName,
}: DataTableProps<TData, TValue>) => {
  // TanStack Table's useReactTable() returns an interior-mutable table instance whose
  // method references can't be safely memoized — opt out of React Compiler optimization.
  // See https://react.dev/reference/react-compiler/directives/use-no-memo
  'use no memo';

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  // Initialize column visibility with searchField hidden by default
  const defaultVisibility: VisibilityState = {
    searchField: false,
    ...initialColumnVisibility,
  };
  const [columnVisibility, setColumnVisibility] =
    useState<VisibilityState>(defaultVisibility);

  const [searchValue, setSearchValue] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const actualTotalItems = manualPagination ? totalItems || 0 : data.length;

  // eslint-disable-next-line react-hooks/incompatible-library -- known, handled above
  const table = useReactTable({
    data,
    columns,
    manualPagination,
    pageCount: manualPagination
      ? Math.ceil(actualTotalItems / pageSize)
      : undefined,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      pagination: {
        pageIndex,
        pageSize,
      },
    },
  });

  // Reset page index when search value changes
  useEffect(() => {
    setPageIndex(0);
  }, [columnFilters]);

  const handleSearch = (value: string) => {
    setSearchValue(value);
    if (table.getColumn("searchField")) {
      table.getColumn("searchField")?.setFilterValue(value.toLowerCase());
    }
  };

  const handlePageChange = (newPageIndex: number) => {
    setPageIndex(newPageIndex);

    if (manualPagination && onPageChange) {
      onPageChange(newPageIndex);
    }
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setPageIndex(0); // Reset to first page on page size change

    if (onPageSizeChange) {
      onPageSizeChange(newPageSize);
    }
  };

  const filters = Array.isArray(filterOptions)
    ? filterOptions.map((filter, index) => (
        <Select
          key={`filter-${index}-${filter.label}`}
          onValueChange={filter.onFilterChange}
          value={filter.value || filter.defaultValue}
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
    titleAction,
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
