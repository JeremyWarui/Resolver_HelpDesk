import { useState } from 'react';
import { toast } from 'sonner';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import * as catalogueService from '@/lib/api/catalogue';
import type { SLAPriority } from '@/lib/api/sla';
import type { ServiceCategory, ServiceItem } from '@/types/catalogue';
import type { CategoryWithPriority } from './types';
import { SlaPreview } from './SlaPreview';
import { fmtMins } from './format';

// Mounted only while open — state initializes from props on mount.
export function ItemForm({
  categoryId,
  categories,
  priorities,
  editing,
  onSaved,
  onClose,
}: {
  categoryId?: number;
  categories: ServiceCategory[];
  priorities: SLAPriority[];
  editing?: ServiceItem | null;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [selectedCatId, setSelectedCatId] = useState<string>(() => {
    if (editing?.category) return String(editing.category);
    return categoryId ? String(categoryId) : '';
  });
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  // '' = inherit the category's default_priority — the common case; most items
  // don't need their own override.
  const [priorityId, setPriorityId] = useState<string>(
    editing?.default_priority?.id ? String(editing.default_priority.id) : ''
  );
  const [saving, setSaving] = useState(false);

  const selectedCategory = categories.find(c => String(c.id) === selectedCatId) as
    | CategoryWithPriority
    | undefined;
  const overridePriority = priorities.find(p => String(p.id) === priorityId);

  const handleSave = async () => {
    if (!name.trim() || !selectedCatId) { toast.error('Name and category are required'); return; }
    setSaving(true);
    try {
      if (editing) {
        await catalogueService.updateServiceItem(editing.id, {
          name: name.trim(),
          description: description.trim(),
          category: Number(selectedCatId),
          is_active: isActive,
          default_priority_id: priorityId ? Number(priorityId) : null,
        } as Partial<ServiceItem>);
        toast.success('Item updated');
      } else {
        await catalogueService.createServiceItem({
          category: Number(selectedCatId),
          name: name.trim(),
          description: description.trim(),
          is_active: isActive,
          default_priority_id: priorityId ? Number(priorityId) : null,
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
            A service item is a specific request users can raise (e.g. "WiFi not working", "Pipe burst").
          </p>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="item-category" className="text-sm font-medium">Category *</Label>
            <Select value={selectedCatId} onValueChange={setSelectedCatId}>
              <SelectTrigger id="item-category" className="h-10">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map(cat => (
                  <SelectItem key={cat.id} value={String(cat.id)}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-name" className="text-sm font-medium">Item Name *</Label>
            <Input
              id="item-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Pipe Installation"
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

          {/* Priority override — optional; most items inherit the category's default */}
          <div className="space-y-2">
            <Label htmlFor="item-priority" className="text-sm font-medium">Priority Override</Label>
            <Select value={priorityId || '__inherit__'} onValueChange={v => setPriorityId(v === '__inherit__' ? '' : v)}>
              <SelectTrigger id="item-priority" className="h-10">
                <SelectValue placeholder="Inherit from category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__inherit__">Inherit from category</SelectItem>
                {priorities.map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {overridePriority ? (
              <SlaPreview
                responseMinutes={overridePriority.response_minutes}
                resolutionMinutes={overridePriority.resolution_minutes}
              />
            ) : selectedCategory?.default_priority ? (
              <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-gray-50 border border-gray-200 text-xs text-gray-600">
                <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                <span>Inherits <strong>{selectedCategory.default_priority.name}</strong> from category —</span>
                <span>{fmtMins(selectedCategory.default_priority.response_minutes)} response, {fmtMins(selectedCategory.default_priority.resolution_minutes)} resolution</span>
              </div>
            ) : null}
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
