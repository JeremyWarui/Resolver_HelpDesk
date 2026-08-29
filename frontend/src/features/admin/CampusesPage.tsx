import { useState, useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DialogActions } from '@/components/shared/forms/DialogActions';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { campusesService } from '@/lib/api/organizations';
import { useCampuses } from '@/hooks/useOrganizations';
import DataTable from '@/components/shared/data/DataTable/DataTable';
import { sortableHeader } from '@/components/shared/data/DataTable/utils/sortableHeader';
import { handleDRFError } from '@/utils/handleDRFError';
import type { Campus } from '@/types';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';

type CampusRow = Campus & { searchField: string };

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
      <DialogActions
        onCancel={onClose}
        pending={saving}
        submitLabel={campus ? 'Update' : 'Create'}
      />
    </form>
  );
}

/** The campus register. Renders through `DataTable`, like every other table
 *  in the app, so search, column visibility and pagination are the shared
 *  implementation rather than a second one built for this page. */
const CampusesPage = () => {
  const { campuses, loading, refetch } = useCampuses();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Campus | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Campus | null>(null);
  const [deleting, setDeleting] = useState(false);

  const data: CampusRow[] = useMemo(
    () => campuses.map(c => ({ ...c, searchField: `${c.name} ${c.code}`.toLowerCase() })),
    [campuses],
  );

  const columns: ColumnDef<CampusRow>[] = [
    { accessorKey: 'id', header: 'ID', cell: ({ row }) => <div>{row.getValue('id')}</div> },
    {
      accessorKey: 'name',
      header: sortableHeader('Name'),
      cell: ({ row }) => <div className="font-medium">{row.getValue('name')}</div>,
    },
    { accessorKey: 'code', header: 'Code', cell: ({ row }) => <div>{row.getValue('code')}</div> },
    {
      accessorKey: 'location',
      header: 'Location',
      cell: ({ row }) => <div>{row.getValue('location') || '—'}</div>,
    },
    { accessorKey: 'searchField', header: () => null, cell: () => null, enableHiding: true },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setEditing(row.original); setIsFormOpen(true); }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-500 hover:text-red-700"
            onClick={() => setDeleteTarget(row.original)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
      <DataTable
        columns={columns}
        data={data}
        title="Campuses"
        loading={loading}
        noun={{ one: 'campus', many: 'campuses' }}
        searchPlaceholder="Search campuses…"
        emptyStateMessage="No campuses found"
        emptyStateDescription="Add one so tickets can be routed to it."
        titleAction={
          <Button
            size="sm"
            className="bg-primary hover:bg-primary/90 flex items-center gap-1"
            onClick={() => { setEditing(null); setIsFormOpen(true); }}
          >
            <Plus className="h-4 w-4" />
            Add Campus
          </Button>
        }
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
            onSuccess={() => { setIsFormOpen(false); setEditing(null); refetch(); }}
            onClose={() => { setIsFormOpen(false); setEditing(null); }}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        title="Delete Campus?"
        description={
          <>
            <strong>"{deleteTarget?.name}"</strong> will be permanently deleted.
            This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setDeleting(true);
          try {
            await campusesService.deleteCampus(deleteTarget.id);
            toast.success('Campus deleted');
            refetch();
            setDeleteTarget(null);
          } catch (error) {
            handleDRFError(error, { fallbackMessage: 'Failed to delete campus' });
          } finally {
            setDeleting(false);
          }
        }}
      />
    </div>
  );
};

export default CampusesPage;
