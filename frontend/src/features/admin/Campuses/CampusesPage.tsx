import { useState, useMemo } from 'react';
import {
  type ColumnDef, type ColumnFiltersState, type SortingState, type VisibilityState,
  getCoreRowModel, getFilteredRowModel, getPaginationRowModel,
  getSortedRowModel, useReactTable,
} from '@tanstack/react-table';
import { MapPin, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { campusesService } from '@/lib/api/organizations';
import { useCampuses } from '@/hooks/campuses/useCampuses';
import { AdminResourceTable } from '@/components/shared/data/AdminResourceTable';
import { useSortableColumn } from '@/hooks/useSortableColumn';
import { handleDRFError } from '@/utils/handleDRFError';
import type { Campus } from '@/types/organisationStructure';

function CampusForm({ campus, onSuccess, onClose }: {
  campus: Campus | null;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(campus?.name ?? '');
  const [code, setCode] = useState(campus?.code ?? '');
  const [location, setLocation] = useState(campus?.location ?? '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (campus) {
        await campusesService.updateCampus(campus.id, { name, code, location });
        toast.success('Campus updated');
      } else {
        await campusesService.createCampus({ name, code, location });
        toast.success('Campus created');
      }
      onSuccess();
    } catch (error) {
      handleDRFError(error, { fallbackMessage: 'Failed to save campus' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Name</Label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Campus name" required />
      </div>
      <div className="space-y-2">
        <Label>Code</Label>
        <Input value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. MAIN" required />
      </div>
      <div className="space-y-2">
        <Label>Location</Label>
        <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Physical location" />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90">
          {saving ? 'Saving...' : campus ? 'Update' : 'Create'}
        </Button>
      </div>
    </form>
  );
}

const CampusesPage = () => {
  // TanStack Table's useReactTable() returns an interior-mutable table instance whose
  // method references can't be safely memoized — opt out of React Compiler optimization.
  // See https://react.dev/reference/react-compiler/directives/use-no-memo
  'use no memo';

  const { campuses, loading: campusesLoading, refetch: refetchCampuses } = useCampuses();
  const [searchValue, setSearchValue] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Campus | null>(null);

  const nameHeader = useSortableColumn('Name');

  const data = useMemo(() => campuses.map(c => ({
    ...c,
    searchField: `${c.name.toLowerCase()} ${c.code.toLowerCase()}`,
  })), [campuses]);

  const columns: ColumnDef<Campus & { searchField: string }>[] = [
    { accessorKey: 'id', header: 'ID', cell: ({ row }) => <div>{row.getValue('id')}</div> },
    {
      accessorKey: 'name',
      header: nameHeader,
      cell: ({ row }) => <div className="font-medium">{row.getValue('name')}</div>,
    },
    { accessorKey: 'code', header: 'Code', cell: ({ row }) => <div>{row.getValue('code')}</div> },
    { accessorKey: 'location', header: 'Location', cell: ({ row }) => <div>{row.getValue('location') || '—'}</div> },
    { accessorKey: 'searchField', header: 'Search', enableHiding: true },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const campus = row.original as Campus;
        return (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setEditing(campus); setIsFormOpen(true); }}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-red-500 hover:text-red-700"
              onClick={async () => {
                if (!window.confirm(`Delete campus "${campus.name}"?`)) return;
                try {
                  await campusesService.deleteCampus(campus.id);
                  toast.success('Campus deleted');
                  refetchCampuses();
                } catch (error) {
                  handleDRFError(error, { fallbackMessage: 'Failed to delete campus' });
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    },
  ];

  // eslint-disable-next-line react-hooks/incompatible-library -- known, handled above
  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { sorting, columnFilters, columnVisibility: { ...columnVisibility, searchField: false }, pagination: { pageIndex, pageSize } },
  });

  return (
    <>
      <AdminResourceTable
        icon={MapPin}
        title="Campuses"
        addLabel="Add Campus"
        onAdd={() => { setEditing(null); setIsFormOpen(true); }}
        table={table}
        loading={campusesLoading}
        emptyMessage="No campuses found."
        itemCount={campuses.length}
        searchValue={searchValue}
        onSearchChange={(value) => { setSearchValue(value); table.getColumn('searchField')?.setFilterValue(value.toLowerCase()); }}
        pageSize={pageSize}
        onPageSizeChange={(size) => { setPageSize(size); setPageIndex(0); }}
      />

      <Dialog open={isFormOpen} onOpenChange={open => { setIsFormOpen(open); if (!open) setEditing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Campus' : 'Add Campus'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update the campus name, code, or location.' : 'Add a new campus to the organisation.'}
            </DialogDescription>
          </DialogHeader>
          <CampusForm
            campus={editing}
            onSuccess={() => { setIsFormOpen(false); setEditing(null); refetchCampuses(); }}
            onClose={() => { setIsFormOpen(false); setEditing(null); }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CampusesPage;
