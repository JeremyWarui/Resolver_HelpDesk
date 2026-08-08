import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import * as catalogueService from '@/lib/api/catalogue';
import type { SubSection } from '@/types/catalogue';

// Mounted only while open — state initializes from props on mount.
export function SubSectionForm({
  sectionTypeId,
  sectionTypeName,
  sectionTypeOptions,
  editing,
  onSaved,
  onClose,
}: {
  sectionTypeId: number;
  sectionTypeName: string;
  /** Used only in edit mode, to move an existing trade to another section
   *  type without recreating it. Creation always targets the type selected in
   *  the left rail. */
  sectionTypeOptions?: { id: number; name: string; code: string }[];
  editing?: SubSection | null;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [code, setCode] = useState(editing?.code ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [selectedSectionTypeId, setSelectedSectionTypeId] = useState(() =>
    String(editing?.section_type ?? sectionTypeId)
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Trade name is required'); return; }
    if (!code.trim()) { toast.error('Code is required'); return; }
    setSaving(true);
    try {
      if (editing) {
        const sectionTypeChanged = Number(selectedSectionTypeId) !== editing.section_type;
        await catalogueService.updateSubSection(editing.id, {
          name: name.trim(),
          code: code.trim().toUpperCase(),
          description: description.trim(),
          is_active: isActive,
          ...(sectionTypeChanged ? { section_type: Number(selectedSectionTypeId) } : {}),
        });
        toast.success(sectionTypeChanged ? 'Trade updated and reassigned' : 'Trade updated');
      } else {
        await catalogueService.createSubSection({
          section_type: sectionTypeId,
          name: name.trim(),
          code: code.trim().toUpperCase(),
          description: description.trim(),
          is_active: isActive,
        });
        toast.success('Trade created');
      }
      onSaved();
    } catch (err) {
      const anyErr = err as { response?: { data?: Record<string, unknown> } };
      const fieldError = anyErr?.response?.data?.section_type ?? anyErr?.response?.data?.code;
      toast.error(
        Array.isArray(fieldError) ? fieldError.join(' ') : 'Failed to save trade'
      );
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Trade' : 'New Trade'}</DialogTitle>
          <p className="text-sm text-gray-500 mt-1">
            {editing
              ? 'A trade groups the services one set of technicians handles.'
              : <>Under section type: <span className="font-medium text-gray-900">{sectionTypeName}</span></>}
          </p>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {editing && (
            <div className="space-y-2">
              <Label htmlFor="sub-section-type" className="text-sm font-medium">Section Type</Label>
              <Select value={selectedSectionTypeId} onValueChange={setSelectedSectionTypeId}>
                <SelectTrigger id="sub-section-type" className="h-10">
                  <SelectValue placeholder="Select section type" />
                </SelectTrigger>
                <SelectContent>
                  {(sectionTypeOptions ?? []).map(st => (
                    <SelectItem key={st.id} value={String(st.id)}>
                      {st.name}
                      <span className="text-gray-400 text-xs ml-1">({st.code})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-amber-600">
                Moving a trade re-routes all future tickets under it. Existing tickets
                and technician assignments are unaffected.
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="sub-name" className="text-sm font-medium">Trade Name *</Label>
            <Input
              id="sub-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Plumbing"
              className="h-10"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sub-code" className="text-sm font-medium">Code *</Label>
            <Input
              id="sub-code"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. PLUMB"
              maxLength={20}
              className="h-10 font-mono"
            />
            <p className="text-xs text-gray-500">
              Short and stable — technician assignments and the ticket wizard's icons
              both key off it.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sub-desc" className="text-sm font-medium">Description</Label>
            <Textarea
              id="sub-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What work does this trade cover?"
              rows={2}
              className="resize-none"
            />
          </div>

          <div className="pt-1">
            <div className="flex items-center justify-between px-3 py-2 rounded-md bg-gray-50 border border-gray-200">
              <Label htmlFor="sub-active" className="text-sm font-medium cursor-pointer flex-1 mb-0">Active</Label>
              <input
                id="sub-active"
                type="checkbox"
                checked={isActive}
                onChange={e => setIsActive(e.target.checked)}
                className="w-4 h-4 cursor-pointer"
              />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
