import { useState } from 'react';
import { toast } from 'sonner';
import { DialogActions } from '@/components/shared/forms/DialogActions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import * as catalogueService from '@/lib/api/catalogue';
import type { ServiceItem, Trade } from '@/types';

// Mounted only while open — state initializes from props on mount.
//
// No priority field: priority belongs to a ticket, and the HOS sets it when
// they assign it.
export function ItemForm({
  tradeId,
  trades,
  editing,
  onSaved,
  onClose,
}: {
  tradeId?: number;
  trades: Trade[];
  editing?: ServiceItem | null;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [selectedSubId, setSelectedSubId] = useState<string>(() => {
    if (editing?.trade) return String(editing.trade);
    return tradeId ? String(tradeId) : '';
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
          trade: Number(selectedSubId),
          is_active: isActive,
        });
        toast.success('Item updated');
      } else {
        await catalogueService.createServiceItem({
          trade: Number(selectedSubId),
          name: name.trim(),
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
                {trades.map(sub => (
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
        <DialogActions
          onCancel={onClose}
          onSubmit={handleSave}
          pending={saving}
          submitLabel={editing ? 'Update' : 'Create'}
        />
      </DialogContent>
    </Dialog>
  );
}
