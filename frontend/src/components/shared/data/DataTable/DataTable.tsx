import { useState, useEffect } from "react";
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

// Import components
import { DefaultTableHeader, type TableHeaderProps } from "./utils/TableHeaders";
import { RenderTableContent } from "./utils/TableContent";

// TABLE TYPES
export interface FilterOption {
  label: string;
  options: { label: string; value: string }[];
  defaultValue?: string;
  value?: string; // Add value for controlled behavior
  onFilterChange: (value: string) => void;
}

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  title?: string;
  subtitle?: string;
  searchPlaceholder?: string;
  emptyStateMessage?: string;
  emptyStateDescription?: string;
  defaultSorting?: SortingState;
  defaultPageSize?: number;
  initialColumnVisibility?: VisibilityState;
  filterOptions?: FilterOption[];
  variant?: "admin" | "user" | "tech";
  onRowClick?: (row: TData) => void;
  selectedRowId?: number | null;
  totalItems?: number;
  totalSystemItems?: number;
  loading?: boolean;
  manualPagination?: boolean;
  onPageChange?: (pageIndex: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  onColumnVisibilityChange?: (visibility: VisibilityState) => void;
  renderHeader?: (props: TableHeaderProps) => React.ReactElement;
  rowClassName?: (row: TData) => string;
}

const DataTable = <TData, TValue>({
  columns,
  data,
  title = "Data Table",
  subtitle,
  searchPlaceholder = "Search...",
  emptyStateMessage = "No data found",
  emptyStateDescription = "Try changing your filter or check back later",
  defaultSorting = [],
  defaultPageSize = 10,
  initialColumnVisibility = {},
  filterOptions,
  variant = "admin",
  onRowClick,
  selectedRowId,
  totalItems,
  loading = false,
  manualPagination = false,
  onPageChange,
  onPageSizeChange,
  onColumnVisibilityChange,
  renderHeader,
  rowClassName,
}: DataTableProps<TData, TValue>) => {
  // TanStack Table's useReactTable() returns an interior-mutable table instance whose
  // method references can't be safely memoized — opt out of React Compiler optimization.
  // See https://react.dev/reference/react-compiler/directives/use-no-memo
  'use no memo';

  const [sorting, setSorting] = useState<SortingState>(defaultSorting);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  // Initialize column visibility with searchField hidden by default
  const defaultVisibility: VisibilityState = {
    searchField: false,
    ...initialColumnVisibility,
  };
  const [columnVisibility, setColumnVisibility] =
    useState<VisibilityState>(defaultVisibility);

  // Callback when column visibility changes
  const handleColumnVisibilityChange = (
    updaterOrValue: VisibilityState | ((old: VisibilityState) => VisibilityState)
  ) => {
    const newVisibility =
      typeof updaterOrValue === "function"
        ? updaterOrValue(columnVisibility)
        : updaterOrValue;
    
    setColumnVisibility(newVisibility);
    if (onColumnVisibilityChange) {
      onColumnVisibilityChange(newVisibility);
    }
  };

  const [rowSelection, setRowSelection] = useState({});
  const [searchValue, setSearchValue] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  // Calculate actual total items for pagination
  const actualTotalItems = manualPagination ? totalItems || 0 : data.length;

  // Initialize the table
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
    onColumnVisibilityChange: handleColumnVisibilityChange,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      pagination: {
        pageIndex,
        pageSize,
      },
    },
  });

  // Sync table pageSize - use table methods for client-side pagination
  useEffect(() => {
    if (!manualPagination) {
      // For client-side pagination, let TanStack Table control it
      table.setPageSize(pageSize);
      table.setPageIndex(pageIndex);
    }
  }, [pageSize, pageIndex, manualPagination, table]);

  // Reset page index when search value changes
  useEffect(() => {
    setPageIndex(0);
  }, [columnFilters]);

  // Handle search input changes
  const handleSearch = (value: string) => {
    setSearchValue(value);
    // Assuming we have a searchable column (usually named 'searchField')
    if (table.getColumn("searchField")) {
      table.getColumn("searchField")?.setFilterValue(value.toLowerCase());
    }
  };

  // Handle page changes with support for manual pagination
  const handlePageChange = (newPageIndex: number) => {
    setPageIndex(newPageIndex);

    if (manualPagination && onPageChange) {
      onPageChange(newPageIndex);
    }
  };

  // Handle page size changes
  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setPageIndex(0); // Reset to first page on page size change

    // Notify parent component if callback is provided
    if (onPageSizeChange) {
      onPageSizeChange(newPageSize);
    }
  };

  // Determine the variant and corresponding layout
  const isAdminVariant = variant === "admin";
  const isUserVariant = variant === "user";
  const isTechVariant = variant === "tech";

  // Extract filter rendering to a function to avoid duplication
  const renderFilters = () => {
    return (
      Array.isArray(filterOptions) &&
      filterOptions.map((filter, index) => (
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
    );
  };

  //render column visibility dropdown
  const renderColumnVisibilityDropdown = () => (
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

  // Build headerProps object that can be passed to custom renderHeader function
  const headerProps = {
    title,
    subtitle,
    handleSearch,
    searchValue,
    searchPlaceholder,
    renderFilters,
    renderColumnVisibilityDropdown,
    isAdminVariant,
    isUserVariant,
    isTechVariant,
  };

  // Build tableContentProps for the RenderTableContent component
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
  };

  return (
    <Card className={`w-full`}>
      <CardContent className={isAdminVariant ? "pt-7" : "p-6"}>
        {/* Use custom header or default header component */}
        {renderHeader ? (
          renderHeader(headerProps)
        ) : (
          <DefaultTableHeader {...headerProps} />
        )}

        {/* Table content with conditional rendering for loading and empty states */}
        <RenderTableContent {...tableContentProps} />
      </CardContent>
    </Card>
  );
};

export default DataTable;
