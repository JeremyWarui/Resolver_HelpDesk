import { useState } from 'react';
import { toast } from 'sonner';
import { DialogActions } from '@/components/shared/forms/DialogActions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import * as catalogueService from '@/lib/api/catalogue';
import type { Trade } from '@/types';

// Mounted only while open — state initializes from props on mount.
export function TradeForm({
  editing,
  onSaved,
  onClose,
}: {
  editing?: Trade | null;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [code, setCode] = useState(editing?.code ?? '');
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Trade name is required'); return; }
    if (!code.trim()) { toast.error('Code is required'); return; }
    setSaving(true);
    try {
      if (editing) {
        await catalogueService.updateTrade(editing.id, {
          name: name.trim(),
          code: code.trim().toUpperCase(),
          is_active: isActive,
        });
        toast.success('Trade updated');
      } else {
        await catalogueService.createTrade({
          name: name.trim(),
          code: code.trim().toUpperCase(),
          is_active: isActive,
        });
        toast.success('Trade created');
      }
      onSaved();
    } catch (err) {
      const anyErr = err as { response?: { data?: Record<string, unknown> } };
      const fieldError = anyErr?.response?.data?.code;
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
            A trade groups the services one set of technicians handles.
          </p>
        </DialogHeader>
        <div className="space-y-4 py-4">
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
