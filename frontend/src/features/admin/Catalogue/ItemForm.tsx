import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import * as catalogueService from '@/lib/api/catalogue';
import type { ServiceItem, SubSection } from '@/types/catalogue';

// Mounted only while open — state initializes from props on mount.
//
// No priority field, deliberately. Priority is not a property of the service:
// a leaking tap in a store room and one over a server rack are the same
// catalogue entry and nowhere near the same urgency. The HOS decides it per
// ticket, when they assign it.
export function ItemForm({
  subSectionId,
  subSections,
  editing,
  onSaved,
  onClose,
}: {
  subSectionId?: number;
  subSections: SubSection[];
  editing?: ServiceItem | null;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [selectedSubId, setSelectedSubId] = useState<string>(() => {
    if (editing?.sub_section) return String(editing.sub_section);
    return subSectionId ? String(subSectionId) : '';
  });
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !selectedSubId) { toast.error('Name and trade are required'); return; }
    setSaving(true);
    try {
      if (editing) {
        await catalogueService.updateServiceItem(editing.id, {
          name: name.trim(),
          description: description.trim(),
          sub_section: Number(selectedSubId),
          is_active: isActive,
        });
        toast.success('Item updated');
      } else {
        await catalogueService.createServiceItem({
          sub_section: Number(selectedSubId),
          name: name.trim(),
          description: description.trim(),
          is_active: isActive,
        });
        toast.success('Item created');
      }
      onSaved();
    } catch (err) {
      toast.error('Failed to save item');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Service Item' : 'New Service Item'}</DialogTitle>
          <p className="text-sm text-gray-500 mt-1">
            A service item is one fault a requester can report — "Leaking tap or pipe",
            "Faulty socket or switch".
          </p>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="item-trade" className="text-sm font-medium">Trade *</Label>
            <Select value={selectedSubId} onValueChange={setSelectedSubId}>
              <SelectTrigger id="item-trade" className="h-10">
                <SelectValue placeholder="Select trade" />
              </SelectTrigger>
              <SelectContent>
                {subSections.map(sub => (
                  <SelectItem key={sub.id} value={String(sub.id)}>{sub.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              This is what routes the ticket — it decides which technicians can be
              given the job.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-name" className="text-sm font-medium">Item Name *</Label>
            <Input
              id="item-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Leaking tap or pipe"
              className="h-10"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-desc" className="text-sm font-medium">Description</Label>
            <Textarea
              id="item-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Service details..."
              rows={2}
              className="resize-none"
            />
          </div>

          <div className="pt-1">
            <div className="flex items-center justify-between px-3 py-2 rounded-md bg-gray-50 border border-gray-200">
              <Label htmlFor="item-active" className="text-sm font-medium cursor-pointer flex-1 mb-0">Active</Label>
              <input
                id="item-active"
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
