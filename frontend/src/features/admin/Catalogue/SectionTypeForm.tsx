import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { sectionsService } from '@/lib/api/organizations';
import type { Department, SectionType } from './types';

// Mounted only while open, so state initializes from props on mount — no
// prev-prop mirroring needed to reset between opens.
//
// A section type is now just a name under a department; the specialties that
// used to hang off it as child types are SubSections, edited in SubSectionForm.
export function SectionTypeForm({
  departments,
  activeDeptCode,
  editing,
  onSaved,
  onClose,
}: {
  departments: Department[];
  activeDeptCode: string | null;
  editing: SectionType | null;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [code, setCode] = useState(editing?.code ?? '');
  const [deptId, setDeptId] = useState(() => {
    if (editing) return String(editing.department_id);
    const activeDept = departments.find((d) => d.code === activeDeptCode);
    return activeDept ? String(activeDept.id) : departments[0] ? String(departments[0].id) : '';
  });
  const [saving, setSaving] = useState(false);

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
        });
        toast.success('Section type updated');
      } else {
        await sectionsService.createSectionType({
          department_id: Number(deptId),
          name: name.trim(),
          code: code.trim().toUpperCase(),
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
            A section type is a service area within a department — "Maintenance".
            The trades inside it are managed separately.
          </p>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {!editing ? (
            <div className="space-y-1.5">
              <Label>Department *</Label>
              <Select value={deptId} onValueChange={setDeptId}>
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
