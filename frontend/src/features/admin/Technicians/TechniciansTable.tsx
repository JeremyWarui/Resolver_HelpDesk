import { useState, useMemo } from "react";
import {
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ChevronDown,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Users,
  Plus,
} from "lucide-react";

import { useScopedTechnicians } from '@/hooks/technicians/useScopedTechnicians';
import { useSections } from '@/hooks/sections/useSections';
import TechnicianForm from './TechnicianForm';
import TechnicianDetails from './TechnicianDetails';

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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Technician } from "@/types";

type TechRow = Technician & {
  name: string;
  campusName: string;
  departmentName: string;
  sectionNames: string;
};

type SectionLike = {
  id?: unknown;
  name?: unknown;
};

function getSectionIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === 'number') return item;
      if (typeof item === 'string') return Number(item);
      if (item && typeof item === 'object' && 'id' in item) {
        const id = (item as { id?: unknown }).id;
        return typeof id === 'number' ? id : Number(id);
      }
      return NaN;
    })
    .filter((id) => Number.isFinite(id) && id > 0);
}

function getSectionNamesFromPayload(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (item && typeof item === 'object' && 'name' in item) {
        const name = (item as SectionLike).name;
        return typeof name === 'string' && name.trim() ? name.trim() : null;
      }
      return null;
    })
    .filter((name): name is string => Boolean(name));
}

function formatDepartmentName(value: string | null): string {
  if (!value) return '—';

  // Backend often returns "CODE: Department Name". We only want the department label.
  const parts = value.split(':');
  const cleaned = (parts.length > 1 ? parts.slice(1).join(':') : parts[0]).trim();
  return cleaned || value;
}

function TechniciansTable() {
  // TanStack Table's useReactTable() returns an interior-mutable table instance whose
  // method references can't be safely memoized — opt this component out of React Compiler
  // optimization (see https://react.dev/reference/react-compiler/directives/use-no-memo).
  'use no memo';

  const { technicians, loading: techniciansLoading, refetch: refetchTechnicians } = useScopedTechnicians();
  const { sections } = useSections();

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    id: true,
    name: true,
    campusName: true,
    departmentName: true,
    sectionNames: true,
    email: true,
  });
  const [rowSelection, setRowSelection] = useState({});
  const [searchValue, setSearchValue] = useState("");
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [campusFilter, setCampusFilter] = useState<string>("all");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedTechnician, setSelectedTechnician] = useState<Technician | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  // Unique campuses derived from sections
  const campuses = useMemo(() => {
    const map = new Map<number, { id: number; code: string; name: string }>();
    sections.forEach(s => {
      if (s.campus?.id) map.set(s.campus.id, { id: s.campus.id, code: s.campus.code, name: s.campus.name });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [sections]);

  // Enrich technician rows with derived display fields
  const allRows = useMemo<TechRow[]>(() => {
    return technicians.map(tech => {
      const rawSections = (tech as unknown as { sections?: unknown }).sections;
      const techSectionIds = getSectionIds(rawSections);
      const payloadSectionNames = (tech.section_names && tech.section_names.length > 0)
        ? tech.section_names
        : getSectionNamesFromPayload(rawSections);
      const resolvedSections = techSectionIds
        .map(id => sections.find(s => s.id === id))
        .filter(Boolean);

      const resolvedSectionNames = resolvedSections
        .map(s => s?.name)
        .filter((name): name is string => Boolean(name));

      const fallbackSectionNames = payloadSectionNames.length
        ? payloadSectionNames.join(', ')
        : techSectionIds.length
          ? techSectionIds.map(id => `Section ${id}`).join(', ')
        : '—';

      return {
        ...tech,
        sections: techSectionIds,
        name: `${tech.first_name} ${tech.last_name}`.trim(),
        campusName: tech.campus_name ?? tech.primary_campus_display ?? '—',
        departmentName: formatDepartmentName(tech.primary_department_name ?? tech.primary_department_display),
        sectionNames: resolvedSectionNames.length
          ? resolvedSectionNames.join(', ')
          : fallbackSectionNames,
      };
    });
  }, [technicians, sections]);

  // Client-side filtering
  const filteredRows = useMemo<TechRow[]>(() => {
    let rows = allRows;

    if (searchValue) {
      const q = searchValue.toLowerCase();
      rows = rows.filter(t =>
        `${t.id} ${t.name} ${t.email}`.toLowerCase().includes(q)
      );
    }

    if (campusFilter !== 'all') {
      rows = rows.filter(t => String(t.primary_campus_id) === campusFilter);
    }

    if (sectionFilter !== 'all') {
      const sid = Number(sectionFilter);
      rows = rows.filter(t => t.sections.includes(sid));
    }

    return rows;
  }, [allRows, searchValue, campusFilter, sectionFilter]);

  const columns: ColumnDef<TechRow>[] = [
    {
      accessorKey: "id",
      header: ({ column }) => (
        <div className="flex items-center space-x-1">
          <span>Tech ID</span>
          <Button variant="ghost" onClick={() => column.toggleSorting()} className="p-0 h-4 w-4">
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
          <Button variant="ghost" onClick={() => column.toggleSorting()} className="p-0 h-4 w-4">
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>
      ),
      cell: ({ row }) => <div className="font-medium">{row.getValue("name")}</div>,
    },
    {
      accessorKey: "campusName",
      header: ({ column }) => (
        <div className="flex items-center space-x-1">
          <span>Campus</span>
          <Button variant="ghost" onClick={() => column.toggleSorting()} className="p-0 h-4 w-4">
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>
      ),
      cell: ({ row }) => <div>{row.getValue("campusName")}</div>,
    },
    {
      accessorKey: "departmentName",
      header: ({ column }) => (
        <div className="flex items-center space-x-1">
          <span>Department</span>
          <Button variant="ghost" onClick={() => column.toggleSorting()} className="p-0 h-4 w-4">
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>
      ),
      cell: ({ row }) => <div>{row.getValue("departmentName")}</div>,
    },
    {
      accessorKey: "sectionNames",
      header: ({ column }) => (
        <div className="flex items-center space-x-1">
          <span>Sections</span>
          <Button variant="ghost" onClick={() => column.toggleSorting()} className="p-0 h-4 w-4">
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-sm text-gray-700">{row.getValue("sectionNames")}</div>
      ),
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => <div>{row.getValue("email")}</div>,
      enableSorting: false,
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          onClick={() => { setSelectedTechnician(row.original); setIsDetailsOpen(true); }}
          className="h-8 px-3"
        >
          View
        </Button>
      ),
    },
  ];

  // TanStack Table's table instance is interior-mutable by design (v9 will add a
  // compiler-safe API); the 'use no memo' directive above is the documented opt-out.
  // eslint-disable-next-line react-hooks/incompatible-library -- known, handled above
  const table = useReactTable({
    data: filteredRows,
    columns,
    manualPagination: true,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    pageCount: Math.ceil(filteredRows.length / pageSize),
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      pagination: { pageIndex, pageSize },
    },
  });

  if (techniciansLoading && technicians.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <CardTitle className="flex items-center">
            <Users className="h-6 w-6 mr-2" />Technicians
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center items-center h-64">
          <p>Loading technicians data...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between py-4">
        <CardTitle className="flex items-center">
          <Users className="h-6 w-6 mr-2" />Technicians
        </CardTitle>
        <Button
          size="sm"
          className="flex items-center gap-1 bg-primary hover:bg-primary/90"
          onClick={() => setIsFormOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Add Technician
        </Button>
      </CardHeader>

      <CardContent>
        <div className="flex flex-wrap gap-3 items-center py-2">
          <Input
            placeholder="Search by ID or name..."
            value={searchValue}
            onChange={e => { setSearchValue(e.target.value); setPageIndex(0); }}
            className="max-w-sm"
          />

          {/* Campus filter */}
          <Select value={campusFilter} onValueChange={v => { setCampusFilter(v); setPageIndex(0); }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Campuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Campuses</SelectItem>
              {campuses.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Section filter */}
          <Select value={sectionFilter} onValueChange={v => { setSectionFilter(v); setPageIndex(0); }}>
            <SelectTrigger className="w-50">
              <SelectValue placeholder="All Sections" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sections</SelectItem>
              {sections
                .filter(s => campusFilter === 'all' || String(s.campus?.id) === campusFilter)
                .map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="ml-auto">
                <SlidersHorizontal className="mr-2 h-4 w-4" />Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table.getAllColumns()
                .filter(col => col.id !== "actions")
                .map(col => (
                  <DropdownMenuCheckboxItem
                    key={col.id}
                    className="capitalize"
                    checked={col.getIsVisible()}
                    onCheckedChange={v => col.toggleVisibility(!!v)}
                  >
                    {col.id === "campusName"
                      ? "Campus"
                      : col.id === "departmentName"
                        ? "Department"
                        : col.id === "sectionNames"
                          ? "Sections"
                          : col.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="rounded-sm border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map(hg => (
                <TableRow key={hg.id}>
                  {hg.headers.map(h => (
                    <TableHead key={h.id}>
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map(row => (
                  <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                    {row.getVisibleCells().map(cell => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    No technicians found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between space-x-2 py-4">
          <div className="flex items-center space-x-6">
            <div className="text-sm text-muted-foreground">
              {filteredRows.length} technician(s) found.
            </div>
            <div className="flex items-center space-x-2">
              <p className="text-sm font-medium">Rows per page</p>
              <Select
                value={`${pageSize}`}
                onValueChange={v => { setPageSize(Number(v)); setPageIndex(0); }}
              >
                <SelectTrigger className="h-8 w-17.5">
                  <SelectValue placeholder={pageSize} />
                </SelectTrigger>
                <SelectContent side="top">
                  {[5, 10, 15, 20].map(size => (
                    <SelectItem key={size} value={`${size}`}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline" size="sm"
              onClick={() => setPageIndex(p => p - 1)}
              disabled={pageIndex === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />Previous
            </Button>
            <div className="flex items-center justify-center text-sm font-medium">
              Page {pageIndex + 1} of {Math.max(1, Math.ceil(filteredRows.length / pageSize))}
            </div>
            <Button
              variant="outline" size="sm"
              onClick={() => setPageIndex(p => p + 1)}
              disabled={pageIndex + 1 >= Math.ceil(filteredRows.length / pageSize)}
            >
              Next<ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>

        <TechnicianForm
          isOpen={isFormOpen}
          onOpenChange={() => { setIsFormOpen(false); setSelectedTechnician(null); }}
          onSuccess={() => { setIsFormOpen(false); refetchTechnicians(); }}
          technician={null}
        />
        {selectedTechnician && (
          <TechnicianDetails
            isOpen={isDetailsOpen}
            onOpenChange={(open) => { setIsDetailsOpen(open); if (!open) setSelectedTechnician(null); }}
            technician={selectedTechnician}
            onUpdated={() => refetchTechnicians()}
          />
        )}
      </CardContent>
    </Card>
  );
}

export default TechniciansTable;
