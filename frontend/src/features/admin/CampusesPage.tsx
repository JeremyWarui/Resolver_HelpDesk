import { useState } from 'react';
import { MapPin, Pencil, Plus, Trash2, UserRound, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DialogActions } from '@/components/shared/forms/DialogActions';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { campusesService } from '@/lib/api/organizations';
import { useCampusRoster } from '@/hooks/useOrganizations';
import { handleDRFError } from '@/utils/handleDRFError';
import type { Campus } from '@/types';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';

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

/** The campus register: each campus with its head of section and technician
 *  count. The admin manages it; the manager reads it with `manage={false}`,
 *  which leaves the add, edit and delete controls off. */
const CampusesPage = ({ manage = true }: { manage?: boolean }) => {
  const { campuses, loading, refetch } = useCampusRoster();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Campus | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Campus | null>(null);
  const [deleting, setDeleting] = useState(false);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-gray-50">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
          <div>
            <p className="text-sm font-semibold text-gray-700">Campuses</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Each campus has one Maintenance section. A ticket goes to the campus its requester is based at.
            </p>
          </div>
          {manage && (
            <Button
              size="sm"
              variant="brand"
              className="gap-1.5 shrink-0"
              onClick={() => { setEditing(null); setIsFormOpen(true); }}
            >
              <Plus className="h-4 w-4" />
              Add Campus
            </Button>
          )}
        </div>

        <div className="px-6 pb-6">
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map(i => <Skeleton key={i} className="h-36 rounded-xl" />)}
            </div>
          ) : campuses.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm text-gray-500 font-medium">No campuses yet</p>
              <p className="text-xs text-gray-400 mt-1">Add one so tickets can be routed to it.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {campuses.map(campus => (
                <section
                  key={campus.id}
                  aria-label={campus.name}
                  className="rounded-xl border border-gray-200 bg-white overflow-hidden hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-50/70 border-b border-gray-100">
                    <div className="flex items-center gap-2 min-w-0">
                      <h3 className="font-semibold text-sm text-gray-900 truncate">{campus.name}</h3>
                      <span className="text-[11px] font-mono text-gray-500 bg-white border border-gray-200 rounded px-1.5 py-0.5">
                        {campus.code}
                      </span>
                    </div>
                    {manage && (
                      <div className="flex gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Edit ${campus.name}`}
                          onClick={() => { setEditing(campus); setIsFormOpen(true); }}
                          className="h-7 w-7 p-0 hover:bg-blue-50 text-gray-400 hover:text-blue-600"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Delete ${campus.name}`}
                          onClick={() => setDeleteTarget(campus)}
                          className="h-7 w-7 p-0 hover:bg-red-50 text-gray-400 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <dl className="px-4 py-3 space-y-2.5 text-sm">
                    <div className="flex items-center gap-2.5">
                      <MapPin className="h-4 w-4 text-gray-400 shrink-0" aria-hidden />
                      <dt className="sr-only">Location</dt>
                      <dd className="text-gray-700 truncate">{campus.location || 'No location recorded'}</dd>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <UserRound className="h-4 w-4 text-gray-400 shrink-0" aria-hidden />
                      <dt className="text-gray-500">Head of section</dt>
                      <dd className="ml-auto text-right truncate">
                        {campus.hos_name
                          ? <span className="font-medium text-gray-900">{campus.hos_name}</span>
                          : <span className="text-amber-700 font-medium">Vacant</span>}
                      </dd>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Wrench className="h-4 w-4 text-gray-400 shrink-0" aria-hidden />
                      <dt className="text-gray-500">Technicians</dt>
                      <dd className="ml-auto font-medium text-gray-900 tabular-nums">{campus.technician_count}</dd>
                    </div>
                  </dl>
                </section>
              ))}
            </div>
          )}
        </div>
      </Card>

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
