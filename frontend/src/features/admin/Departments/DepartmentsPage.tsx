import { useState } from 'react';
import { Plus, Pencil, Trash2, Building2, UserCog, MapPin, X, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useDepartments } from '@/hooks/departments/useDepartments';
import { useCampuses } from '@/hooks/campuses/useCampuses';
import { departmentsService, campusDepartmentsService } from '@/lib/api/organizations';
import { handleDRFError } from '@/utils/handleDRFError';
import type { Department } from '@/types/organisationStructure';

interface LinkedCampus {
  campus_department_id: number;
  id: number;
  name: string;
  code: string;
}

interface HodEntry {
  campus_department_id: number;
  campus: string;
  hod: { id: number; name: string; username?: string };
}

type DepartmentExtended = Department & {
  campuses?: LinkedCampus[];
  heads_of_department?: HodEntry[];
  manager_user?: { id: number; name?: string; username?: string };
};

// ── Department form ────────────────────────────────────────────────────────────

function DeptForm({ dept, onSuccess, onClose }: {
  dept: Department | null;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(dept?.name ?? '');
  const [code, setCode] = useState(dept?.code ?? '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) { toast.error('Name and code are required'); return; }
    setSaving(true);
    try {
      const payload = { name: name.trim(), code: code.trim().toUpperCase() };
      if (dept) {
        await departmentsService.updateDepartment(dept.id, payload);
        toast.success('Department updated');
      } else {
        await departmentsService.createDepartment(payload);
        toast.success('Department created');
      }
      onSuccess();
    } catch (error) {
      handleDRFError(error, { fallbackMessage: 'Failed to save department' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label className="text-sm font-medium">Department Name <span className="text-red-500">*</span></Label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Information Technology" className="h-10" required />
      </div>
      <div className="space-y-2">
        <Label className="text-sm font-medium">Code <span className="text-red-500">*</span></Label>
        <Input
          value={code}
          onChange={e => setCode(e.target.value.slice(0, 10))}
          placeholder="e.g. ICT"
          className="h-10 uppercase"
          required
        />
        <p className="text-xs text-gray-400">Short code used in ticket routing (e.g. NRB-<strong>ICT</strong>-00001)</p>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90">
          {saving ? 'Saving…' : dept ? 'Save Changes' : 'Create Department'}
        </Button>
      </div>
    </form>
  );
}

// ── Assign Campus dialog ───────────────────────────────────────────────────────

function AssignCampusDialog({ open, onOpenChange, dept, linkedCampuses, onAssigned }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dept: Department;
  linkedCampuses: LinkedCampus[];
  onAssigned: () => void;
}) {
  const { campuses } = useCampuses();
  const [selectedCampusId, setSelectedCampusId] = useState('');
  const [saving, setSaving] = useState(false);

  const linkedIds = new Set(linkedCampuses.map(c => c.id));
  const available = campuses.filter(c => !linkedIds.has(c.id));

  const handleAssign = async () => {
    if (!selectedCampusId) { toast.error('Select a campus'); return; }
    setSaving(true);
    try {
      await campusDepartmentsService.createCampusDepartment({
        campus_id: Number(selectedCampusId),
        department_id: dept.id,
      });
      toast.success(`${dept.code} assigned to ${campuses.find(c => String(c.id) === selectedCampusId)?.name}`);
      onAssigned();
      onOpenChange(false);
      setSelectedCampusId('');
    } catch (error) {
      handleDRFError(error, { fallbackMessage: 'Failed to assign campus' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) setSelectedCampusId(''); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Assign to campus
          </DialogTitle>
          <DialogDescription>
            Creates a <strong>{dept.code}</strong> branch at the selected campus (e.g. NRB-{dept.code}).
          </DialogDescription>
        </DialogHeader>
        {available.length === 0 ? (
          <p className="text-sm text-gray-400 italic text-center py-6">
            {dept.name} is already active at all campuses.
          </p>
        ) : (
          <div className="space-y-1.5 py-2">
            <Label>Campus <span className="text-red-500">*</span></Label>
            <Select value={selectedCampusId} onValueChange={setSelectedCampusId}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Select a campus" /></SelectTrigger>
              <SelectContent>
                {available.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    <span className="font-medium">{c.name}</span>
                    <span className="text-gray-400 text-xs ml-2">({c.code})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {available.length > 0 && (
            <Button onClick={handleAssign} disabled={saving || !selectedCampusId} className="bg-primary hover:bg-primary/90">
              {saving ? 'Assigning…' : 'Assign'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Assign HOD dialog ──────────────────────────────────────────────────────────

function AssignHodDialog({ open, onOpenChange, campus, dept, currentHod, onSaved }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  campus: LinkedCampus;
  dept: Department;
  currentHod: HodEntry | undefined;
  onSaved: () => void;
}) {
  const [candidates, setCandidates] = useState<{ id: number; name: string; username: string }[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [selectedHodId, setSelectedHodId] = useState('none');
  const [saving, setSaving] = useState(false);

  // Fetch candidates when dialog opens
  const handleOpen = async (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (isOpen) {
      setSelectedHodId(currentHod ? String(currentHod.hod.id) : 'none');
      setLoadingCandidates(true);
      try {
        const data = await campusDepartmentsService.getHodCandidates(campus.campus_department_id);
        setCandidates(data);
      } catch {
        toast.error('Failed to load HOD candidates');
      } finally {
        setLoadingCandidates(false);
      }
    }
  };

  const hasChange = selectedHodId !== (currentHod ? String(currentHod.hod.id) : 'none');

  const handleSave = async () => {
    setSaving(true);
    try {
      const hodId = selectedHodId !== 'none' ? Number(selectedHodId) : null;
      await campusDepartmentsService.assignHOD(campus.campus_department_id, hodId);
      toast.success(hodId
        ? `HOD assigned for ${campus.code}-${dept.code}`
        : `HOD removed from ${campus.code}-${dept.code}`
      );
      onSaved();
      onOpenChange(false);
    } catch (error) {
      handleDRFError(error, { fallbackMessage: 'Failed to update HOD' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-4 w-4 text-primary" />
            Assign HOD
          </DialogTitle>
          <DialogDescription>
            Select a Head of Department for <strong>{campus.code}-{dept.code}</strong>.
            Only users with an active HOD role assignment for this campus branch are listed.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-1.5">
          <Label>Head of Department</Label>
          {loadingCandidates ? (
            <Skeleton className="h-10 w-full rounded-md" />
          ) : (
            <Select value={selectedHodId} onValueChange={setSelectedHodId}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Select a user" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  <span className="text-gray-400 italic">No HOD (clear)</span>
                </SelectItem>
                {candidates.length === 0 ? (
                  <SelectItem value="__empty__" disabled>
                    No users with HOD role found for this branch
                  </SelectItem>
                ) : (
                  candidates.map(u => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      <span className="font-medium">{u.name}</span>
                      <span className="text-gray-400 text-xs ml-2">@{u.username}</span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          )}
          {candidates.length === 0 && !loadingCandidates && (
            <p className="text-xs text-amber-600 mt-1">
              To assign an HOD, first give a user a <strong>HOD</strong> role assignment for this campus branch via the Users page.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={saving || !hasChange || selectedHodId === '__empty__'}
            className="bg-primary hover:bg-primary/90"
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Campus branch card ─────────────────────────────────────────────────────────

function CampusBranchCard({ campus, dept, hod, onRemove, onAssignHod }: {
  campus: LinkedCampus;
  dept: Department;
  hod: HodEntry | undefined;
  onRemove: () => void;
  onAssignHod: () => void;
}) {
  return (
    <div className="bg-white border rounded-xl p-5 flex flex-col gap-4 group hover:border-primary/30 hover:shadow-sm transition-all">
      {/* Campus + branch */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/8 border border-primary/15 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-primary">{campus.code}</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">{campus.code}-{dept.code}</p>
            <p className="text-xs text-gray-400">{campus.name} campus</p>
          </div>
        </div>
        <button
          onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-400 p-0.5"
          title={`Remove ${dept.code} from ${campus.name}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Divider */}
      <div className="border-t" />

      {/* HOD row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <UserCog className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-gray-400 leading-none mb-0.5">Head of Department</p>
            {hod ? (
              <p className="text-sm font-medium text-gray-700 truncate">{hod.hod.name}</p>
            ) : (
              <p className="text-sm text-gray-400 italic">Not assigned</p>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2.5 text-xs gap-1 shrink-0 text-primary border-primary/30 hover:bg-primary/5"
          onClick={onAssignHod}
        >
          <UserCog className="h-3 w-3" />
          {hod ? 'Change' : 'Assign'}
        </Button>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

const DepartmentsPage = () => {
  const { departments: depts, loading, refetch } = useDepartments();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [assigningCampus, setAssigningCampus] = useState(false);
  const [deletingDept, setDeletingDept] = useState<Department | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [assigningHod, setAssigningHod] = useState<{
    campus: LinkedCampus;
    currentHod: HodEntry | undefined;
  } | null>(null);

  const filtered = depts.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.code.toLowerCase().includes(search.toLowerCase()),
  );

  const selected = (selectedId != null
    ? depts.find(d => d.id === selectedId)
    : filtered[0]) as DepartmentExtended | undefined;

  const linkedCampuses: LinkedCampus[] = selected?.campuses ?? [];
  const hods: HodEntry[] = selected?.heads_of_department ?? [];

  const handleDelete = async () => {
    if (!deletingDept) return;
    setDeleting(true);
    try {
      await departmentsService.deleteDepartment(deletingDept.id);
      toast.success(`"${deletingDept.name}" deleted`);
      setDeletingDept(null);
      if (selectedId === deletingDept.id) setSelectedId(null);
      refetch();
    } catch (error) {
      handleDRFError(error, { fallbackMessage: 'Cannot delete — department may have sections or tickets attached' });
    } finally {
      setDeleting(false);
    }
  };

  const handleUnlinkCampus = async (campus: LinkedCampus) => {
    if (!selected) return;
    try {
      await campusDepartmentsService.deleteCampusDepartment(campus.campus_department_id);
      toast.success(`${selected.code} removed from ${campus.name}`);
      refetch();
    } catch {
      toast.error('Cannot remove — sections or tickets may exist under this branch');
    }
  };

  return (
    <div className="flex-1 overflow-hidden bg-gray-50 flex flex-col">
      {/* Page header */}
      <div className="px-6 py-4 border-b bg-white flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Departments</h2>
          <p className="text-xs text-gray-500 mt-0.5">Global departments and their campus branches</p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setIsFormOpen(true); }} className="bg-primary hover:bg-primary/90 gap-1.5">
          <Plus className="h-4 w-4" /> Add Department
        </Button>
      </div>

      {/* Two-panel body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left — department list */}
        <div className="w-72 shrink-0 border-r bg-white flex flex-col overflow-hidden">
          <div className="p-3 border-b">
            <Input
              placeholder="Search departments…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-3 space-y-2">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-14 rounded-md" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400 italic">No departments found</div>
            ) : (
              <div className="p-2 space-y-0.5">
                {filtered.map(dept => {
                  const ext = dept as DepartmentExtended;
                  const isActive = (selected?.id ?? filtered[0]?.id) === dept.id;
                  return (
                    <button
                      key={dept.id}
                      onClick={() => setSelectedId(dept.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-md transition-colors flex items-center gap-2 group/item ${
                        isActive ? 'bg-primary/10' : 'hover:bg-gray-50'
                      }`}
                    >
                      <Building2 className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-primary' : 'text-gray-400'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-sm font-medium truncate ${isActive ? 'text-primary' : 'text-gray-700'}`}>
                            {dept.name}
                          </span>
                          <Badge variant="outline" className={`text-xs font-mono ml-auto shrink-0 ${isActive ? 'border-primary/40 text-primary' : ''}`}>
                            {dept.code}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {(ext.campuses?.length ?? 0)} campus{(ext.campuses?.length ?? 0) !== 1 ? 'es' : ''}
                        </p>
                      </div>
                      <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-opacity ${isActive ? 'text-primary opacity-100' : 'text-gray-300 opacity-0 group-hover/item:opacity-100'}`} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right — campus branches detail */}
        <div className="flex-1 overflow-y-auto p-6">
          {!selected ? (
            <div className="h-full flex items-center justify-center text-gray-400 text-sm italic">
              Select a department to view its campus branches
            </div>
          ) : (
            <>
              {/* Department header */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2.5 mb-1">
                    <Building2 className="h-5 w-5 text-primary" />
                    <h3 className="text-base font-semibold text-gray-800">{selected.name}</h3>
                    <Badge variant="outline" className="font-mono text-sm">{selected.code}</Badge>
                  </div>
                  <p className="text-xs text-gray-400 ml-7">
                    {linkedCampuses.length === 0
                      ? 'Not deployed to any campus yet'
                      : `Active at: ${linkedCampuses.map(c => c.code).join(' · ')}`}
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button variant="outline" size="sm" className="h-8 gap-1.5"
                    onClick={() => { setEditing(selected); setIsFormOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 text-red-500 border-red-200 hover:bg-red-50 gap-1.5"
                    onClick={() => setDeletingDept(selected)}>
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              </div>

              {/* Campus branches section header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Campus Branches</p>
                  <p className="text-xs text-gray-400 mt-0.5">Each branch has its own HOD and sections</p>
                </div>
                <Button size="sm" variant="outline"
                  className="h-8 gap-1.5 text-primary border-primary/30 hover:bg-primary/5"
                  onClick={() => setAssigningCampus(true)}>
                  <Plus className="h-3.5 w-3.5" /> Assign Campus
                </Button>
              </div>

              {linkedCampuses.length === 0 ? (
                <div className="border-2 border-dashed rounded-xl p-12 text-center">
                  <MapPin className="h-8 w-8 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-400 mb-1">No campus branches yet</p>
                  <p className="text-xs text-gray-300 mb-4">
                    Assign <strong>{selected.name}</strong> to a campus to create its first branch
                  </p>
                  <Button size="sm" className="bg-primary hover:bg-primary/90 gap-1.5"
                    onClick={() => setAssigningCampus(true)}>
                    <Plus className="h-3.5 w-3.5" /> Assign Campus
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {linkedCampuses.map(campus => {
                    const hod = hods.find(h => h.campus_department_id === campus.campus_department_id);
                    return (
                      <CampusBranchCard
                        key={campus.campus_department_id}
                        campus={campus}
                        dept={selected}
                        hod={hod}
                        onRemove={() => handleUnlinkCampus(campus)}
                        onAssignHod={() => setAssigningHod({ campus, currentHod: hod })}
                      />
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Add/Edit Department dialog */}
      <Dialog open={isFormOpen} onOpenChange={open => { setIsFormOpen(open); if (!open) setEditing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Department' : 'Add Department'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update the department name or code.' : 'Add a new global department to the organisation.'}
            </DialogDescription>
          </DialogHeader>
          <DeptForm
            dept={editing}
            onSuccess={() => { setIsFormOpen(false); setEditing(null); refetch(); }}
            onClose={() => { setIsFormOpen(false); setEditing(null); }}
          />
        </DialogContent>
      </Dialog>

      {/* Assign campus dialog */}
      {selected && (
        <AssignCampusDialog
          open={assigningCampus}
          onOpenChange={setAssigningCampus}
          dept={selected}
          linkedCampuses={linkedCampuses}
          onAssigned={refetch}
        />
      )}

      {/* Assign HOD dialog */}
      {selected && assigningHod && (
        <AssignHodDialog
          open={!!assigningHod}
          onOpenChange={open => { if (!open) setAssigningHod(null); }}
          campus={assigningHod.campus}
          dept={selected}
          currentHod={assigningHod.currentHod}
          onSaved={refetch}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deletingDept} onOpenChange={() => setDeletingDept(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deletingDept?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This department and all campus branches, sections, and service categories under it will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700">
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DepartmentsPage;
