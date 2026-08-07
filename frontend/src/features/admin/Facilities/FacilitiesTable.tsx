import { useState, useMemo } from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ChevronDown,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Building,
  Plus,
} from "lucide-react";

import { useFacilities } from '@/hooks/facilities/useFacilities';
import FacilityForm from './FacilityForm';
import FacilityDetails from './FacilityDetails';

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Facility } from "@/types";

const FACILITY_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'office_block', label: 'Office Block' },
  { value: 'building',     label: 'Building' },
  { value: 'equipment',    label: 'Facility / Equipment' },
  { value: 'residential',  label: 'Residential' },
  { value: 'grounds',      label: 'Grounds' },
];

function FacilitiesTable() {
  // TanStack Table's useReactTable() returns an interior-mutable table instance whose
  // method references can't be safely memoized — opt out of React Compiler optimization.
  // See https://react.dev/reference/react-compiler/directives/use-no-memo
  'use no memo';

  const { facilities, loading: facilitiesLoading, refetch: refetchFacilities } = useFacilities();

  // State for sorting, filtering, and column visibility
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    id: true,
    name: true,
    campus_name: true,
    type: true,
    status: true,
  });
  const [rowSelection, setRowSelection] = useState({});
  const [searchValue, setSearchValue] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>("all");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  
  // Get unique values for filter dropdowns
  const uniqueStatuses = useMemo(
    () => [...new Set(facilities.map((facility) => facility.status).filter(Boolean))],
    [facilities]
  );

  // Add a searchable field to each facility that combines ID and name
  const dataWithSearchField = useMemo(() => {
    // Filter facilities by type if a type filter is set
    const filteredFacilities = typeFilter && typeFilter !== "all" 
      ? facilities.filter(facility => facility.type === typeFilter)
      : facilities;
      
    return filteredFacilities.map((facility) => ({
      ...facility,
      searchField: `${String(facility.id).toLowerCase()} ${facility.name.toLowerCase()}`,
    }));
  }, [typeFilter, facilities]);

  // Define columns in the specified order
  const columns: ColumnDef<Facility>[] = [
    {
      accessorKey: "id",
      header: ({ column }) => (
        <div className="flex items-center space-x-1">
          <span>Facility ID</span>
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting()}
            className="p-0 h-4 w-4"
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>
      ),
      cell: ({ row }) => <div>{row.getValue("id")}</div>,
    },
    {
      accessorKey: "name",
      header: ({ column }) => (
        <div className="flex items-center space-x-1">
          <span>Name</span>
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting()}
            className="p-0 h-4 w-4"
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>
      ),
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue("name")}</div>
      ),
    },
    {
      accessorKey: "campus_name",
      header: ({ column }) => (
        <div className="flex items-center space-x-1">
          <span>Campus</span>
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting()}
            className="p-0 h-4 w-4"
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-sm">{row.getValue("campus_name") || "—"}</div>
      ),
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => {
        const t = row.getValue("type") as string | undefined;
        const label = FACILITY_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t ?? '—';
        return <span className="text-sm text-muted-foreground">{label}</span>;
      },
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <div className="flex items-center space-x-1">
          <span>Status</span>
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting()}
            className="p-0 h-4 w-4"
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>
      ),
      cell: ({ row }) => {
        const status = row.getValue("status") as string;
        return (
          <Badge
            variant="outline"
            className={
              status === "operational"
                ? "bg-green-100 text-green-800 border-green-200"
                : status === "maintenance"
                  ? "bg-orange-100 text-orange-800 border-orange-200"
                  : "bg-red-100 text-red-800 border-red-200"
            }
          >
            {status}
          </Badge>
        );
      },
    },
    {
      accessorKey: "openTickets",
      header: ({ column }) => (
        <div className="flex items-center space-x-1">
          <span>Open Tickets</span>
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting()}
            className="p-0 h-4 w-4"
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>
      ),
      cell: ({ row }) => {
        const tickets = row.getValue("openTickets") as number;
        return (
          <div
            className={`flex justify-center  ${
              tickets > 0 ? "text-amber-600 font-medium" : "text-gray-500"
            }`}
          >
            {tickets}
          </div>
        );
      },
    },
    {
      accessorKey: "resolvedTickets",
      header: ({ column }) => (
        <div className="flex items-center space-x-1">
          <span>Resolved Tickets</span>
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting()}
            className="p-0 h-4 w-4"
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>
      ),
      cell: ({ row }) => {
        const tickets = row.getValue("resolvedTickets") as number;
        return <div className="flex justify-center">{tickets}</div>;
      },
    },
    {
      accessorKey: "closedTickets",
      header: ({ column }) => (
        <div className="flex items-center space-x-1">
          <span>Closed Tickets</span>
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting()}
            className="p-0 h-4 w-4"
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex justify-center">
          {row.getValue("closedTickets")}
        </div>
      ),
    },

    // Hidden column for search
    {
      accessorKey: "searchField",
      header: "Search Field",
      enableHiding: true,
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const facility = row.original;

        return (
          <Button
            variant="ghost"
            onClick={() => { setSelectedFacility(facility); setIsDetailsOpen(true); }}
            className="h-8 px-3"
          >
            View
          </Button>
        );
      },
    },
  ];

  // Handle search input changes
  const handleSearch = (value: string) => {
    setSearchValue(value);
    table.getColumn("searchField")?.setFilterValue(value.toLowerCase());
  };

  // Initialize table
  // eslint-disable-next-line react-hooks/incompatible-library -- known, handled above
  const table = useReactTable({
    data: dataWithSearchField,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      sorting,
      columnFilters,
      columnVisibility: {
        ...columnVisibility,
        searchField: false, // Always hide the search field column
      },
      rowSelection,
      pagination: {
        pageIndex: 0,
        pageSize: 10, // Show 10 rows per page
      },
    },
  });

  // Show loading state
  if (facilitiesLoading && facilities.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <CardTitle className="flex items-center">
            <Building className="h-6 w-6 mr-2" />
            Facilities
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center items-center h-64">
          <p>Loading facilities data...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between py-4">
        <CardTitle className="flex items-center">
          <Building className="h-6 w-6 mr-2" />
          Facilities
        </CardTitle>
        <Button
          size="sm"
          className="flex items-center gap-1 bg-primary hover:bg-primary/90"
          onClick={() => setIsFormOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Add Facility
        </Button>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4 md:flex-row md:items-center py-2">
          <Input
            placeholder="Search by ID or name..."
            value={searchValue}
            onChange={(event) => handleSearch(event.target.value)}
            className="max-w-sm"
          />
          <div className="flex flex-col gap-4 md:flex-row">
            <Select
              onValueChange={(value) => {
                setTypeFilter(value);
                // Reset to first page when filter changes
                table.setPageIndex(0);
              }}
              value={typeFilter || "all"}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by type">
                  {typeFilter === "all" || !typeFilter ? "All Types" : typeFilter}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {FACILITY_TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              onValueChange={(value) =>
                table
                  .getColumn("status")
                  ?.setFilterValue(value === "all" ? undefined : value)
              }
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {uniqueStatuses.filter(s => s).map((status) => (
                  <SelectItem key={status} value={status!}>
                    {status!.charAt(0).toUpperCase() + status!.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="ml-auto">
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table
                .getAllColumns()
                .filter(
                  (column) =>
                    column.id !== "actions" && column.id !== "searchField"
                )
                .map((column) => {
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) =>
                        column.toggleVisibility(!!value)
                      }
                    >
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  );
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="rounded-sm border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
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
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
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
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between space-x-2 py-4">
          <div className="flex items-center space-x-6">
            <div className="text-sm text-muted-foreground">
              {table.getFilteredRowModel().rows.length} facility(ies) found.
            </div>
            <div className="flex items-center space-x-2">
              <p className="text-sm font-medium">Rows per page</p>
              <Select
                value={`${table.getState().pagination.pageSize}`}
                onValueChange={(value) => {
                  table.setPageSize(Number(value));
                }}
              >
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue
                    placeholder={table.getState().pagination.pageSize}
                  />
                </SelectTrigger>
                <SelectContent side="top">
                  {[5, 10, 15, 20].map((pageSize) => (
                    <SelectItem key={pageSize} value={`${pageSize}`}>
                      {pageSize}
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
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <div className="flex items-center justify-center text-sm font-medium">
              Page {table.getState().pagination.pageIndex + 1} of{" "}
              {table.getPageCount()}
            </div>
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
        <FacilityForm isOpen={isFormOpen} onOpenChange={setIsFormOpen} onSuccess={() => { refetchFacilities(); }} />
        <FacilityDetails isOpen={isDetailsOpen} onOpenChange={(open: boolean) => { setIsDetailsOpen(open); if (!open) setSelectedFacility(null); }} facility={selectedFacility} onUpdated={() => refetchFacilities()} />
      </CardContent>
    </Card>
  );
}

export default FacilitiesTable;
