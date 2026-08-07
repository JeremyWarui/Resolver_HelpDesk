import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { sectionsService } from '@/lib/api/organizations';
import type { Department, SectionType } from './types';

const NO_PARENT = '__none__';

// Mounted only while open (parent conditionally renders), so state initializes
// from props on mount — no prev-prop mirroring needed to reset between opens.
export function SectionTypeForm({
  departments,
  sectionTypes,
  activeDeptCode,
  editing,
  onSaved,
  onClose,
}: {
  departments: Department[];
  sectionTypes: SectionType[];
  activeDeptCode: string | null;
  editing: SectionType | null;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [code, setCode] = useState(editing?.code ?? '');
  const [staffLabel, setStaffLabel] = useState(editing?.staff_label ?? '');
  const [deptId, setDeptId] = useState(() => {
    if (editing) return String(editing.department_id);
    const activeDept = departments.find((d) => d.code === activeDeptCode);
    return activeDept ? String(activeDept.id) : departments[0] ? String(departments[0].id) : '';
  });
  const [parentId, setParentId] = useState(() =>
    editing?.parent_id ? String(editing.parent_id) : NO_PARENT
  );
  const [saving, setSaving] = useState(false);

  // Only top-level types in the same department can be a parent — a type
  // with a parent can't itself have children (max 2 levels, R18), and a
  // type can't be its own parent.
  const parentCandidates = sectionTypes.filter(
    (st) => String(st.department_id) === deptId && !st.parent_id && st.id !== editing?.id
  );

  const handleSave = async () => {
    if (!name.trim() || !code.trim() || (!editing && !deptId)) {
      toast.error('Name, code and department are required');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await sectionsService.updateSectionType(editing.id, {
          name: name.trim(),
          code: code.trim().toUpperCase(),
          staff_label: staffLabel.trim(),
        });
        toast.success('Section type updated');
      } else {
        await sectionsService.createSectionType({
          department_id: Number(deptId),
          name: name.trim(),
          code: code.trim().toUpperCase(),
          staff_label: staffLabel.trim(),
          parent_id: parentId === NO_PARENT ? null : Number(parentId),
        });
        toast.success('Section type created');
      }
      onSaved();
    } catch {
      toast.error('Failed to save section type');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Section Type' : 'New Section Type'}</DialogTitle>
          <p className="text-sm text-gray-500 mt-1">
            Section types define the service areas within a department (e.g. "Networks", "Maintenance").
          </p>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {!editing ? (
            <div className="space-y-1.5">
              <Label>Department *</Label>
              <Select value={deptId} onValueChange={(v) => { setDeptId(v); setParentId(NO_PARENT); }}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map(d => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name} <span className="text-gray-400 text-xs ml-1">({d.code})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="text-sm text-gray-500 bg-gray-50 rounded-md px-3 py-2">
              Department: <span className="font-medium text-gray-700">
                {departments.find(d => d.id === editing.department_id)?.name ?? editing.department_code}
              </span>
              <span className="text-gray-400 ml-1 text-xs">(cannot change)</span>
            </div>
          )}
          {!editing ? (
            <div className="space-y-1.5">
              <Label>Parent Type</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="None — top-level section type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PARENT}>None — top-level section type</SelectItem>
                  {parentCandidates.map(st => (
                    <SelectItem key={st.id} value={String(st.id)}>
                      {st.name} <span className="text-gray-400 text-xs ml-1">({st.code})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400">
                Set this to make a specialty within another section type (e.g. "Plumbing" under
                "Maintenance") — specialty types never get their own section or head.
              </p>
            </div>
          ) : editing.parent_id ? (
            <div className="text-sm text-gray-500 bg-gray-50 rounded-md px-3 py-2">
              Parent type: <span className="font-medium text-gray-700">{editing.parent_name}</span>
              <span className="text-gray-400 ml-1 text-xs">(cannot change)</span>
            </div>
          ) : null}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Software Support" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label>Code *</Label>
              <Input
                value={code}
                onChange={e => setCode(e.target.value.slice(0, 10))}
                placeholder="e.g. SW"
                className="h-10 uppercase"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Staff Label</Label>
            <Input
              value={staffLabel}
              onChange={e => setStaffLabel(e.target.value.slice(0, 50))}
              placeholder="e.g. Technician, Officer"
              className="h-10"
            />
            <p className="text-xs text-gray-400">
              What staff in this section type are called (defaults to "Technician" if left blank).
            </p>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Section Type'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
