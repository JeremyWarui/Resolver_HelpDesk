import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  Clock, ChevronDown, ChevronUp, Pencil, Check, X,
  Plus, Trash2, AlertTriangle, ArrowRight,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import apiClient from '@/lib/api/client';
import {
  getPriorities,
  updatePriority,
  createEscalationRule,
  updateEscalationRule,
  deleteEscalationRule,
  type SLAPriority,
  type EscalationRule,
} from '@/lib/api/sla';

/**
 * The severity colour for a priority, from its position in the ladder.
 *
 * Deliberately position-based rather than name-based. `getPriorityStyle()`
 * keys off the name and falls back to the "low" palette for anything it does
 * not recognise, so a custom "Urgent" at the top of the ladder would be
 * painted as the calmest thing on the page. Position is always true: the
 * highest rank is the most urgent, whatever it is called.
 */
function severityStyle(index: number, total: number): React.CSSProperties {
  const tokens = ['--priority-low', '--priority-medium', '--priority-high', '--priority-critical'];
  const slot = total <= 1 ? 0 : Math.round((index / (total - 1)) * (tokens.length - 1));
  const base = tokens[Math.min(slot, tokens.length - 1)];
  return { backgroundColor: `var(${base}-text)` };
}

function fmtMins(m: number): string {
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem === 0 ? `${h}h` : `${h}h ${rem}min`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh === 0 ? `${d}d` : `${d}d ${rh}h`;
}

function Spinner() {
  return <div className="h-3.5 w-3.5 border border-current border-t-transparent rounded-full animate-spin" />;
}

// ── Inline editable minute field ─────────────────────────────────────────────

function MinuteInput({ value, onSave }: { value: number; onSave: (v: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => { setDraft(String(value)); setEditing(true); setTimeout(() => inputRef.current?.focus(), 0); };
  const cancel = () => { setEditing(false); setDraft(String(value)); };

  const save = async () => {
    const parsed = parseInt(draft, 10);
    if (isNaN(parsed) || parsed < 1) { toast.error('Must be a positive number of minutes'); return; }
    setSaving(true);
    try { await onSave(parsed); setEditing(false); } finally { setSaving(false); }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          ref={inputRef}
          type="number"
          min={1}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          className="h-7 w-24 text-xs px-2 py-0"
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
        />
        <span className="text-xs text-gray-400">min</span>
        <button onClick={save} disabled={saving} className="text-green-600 hover:text-green-700 disabled:opacity-50">
          {saving ? <Spinner /> : <Check className="h-3.5 w-3.5" />}
        </button>
        <button onClick={cancel} disabled={saving} className="text-gray-400 hover:text-gray-600">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={startEdit}
      className="flex items-center gap-1.5 group text-xs text-gray-700 hover:text-primary transition-colors"
    >
      <Clock className="h-3 w-3 text-gray-400" />
      <span className="font-medium">{fmtMins(value)}</span>
      <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400" />
    </button>
  );
}

// ── Inline editable text field ────────────────────────────────────────────────

function InlineTextInput({ value, onSave, placeholder }: { value: string; onSave: (v: string) => Promise<void>; placeholder?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => { setDraft(value); setEditing(true); setTimeout(() => inputRef.current?.focus(), 0); };
  const cancel = () => { setEditing(false); setDraft(value); };

  const save = async () => {
    if (!draft.trim()) { toast.error('Name cannot be empty'); return; }
    setSaving(true);
    try { await onSave(draft.trim()); setEditing(false); } finally { setSaving(false); }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder={placeholder}
          className="h-7 w-36 text-xs px-2 py-0 font-medium"
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
        />
        <button onClick={save} disabled={saving} className="text-green-600 hover:text-green-700 disabled:opacity-50">
          {saving ? <Spinner /> : <Check className="h-3.5 w-3.5" />}
        </button>
        <button onClick={cancel} disabled={saving} className="text-gray-400 hover:text-gray-600">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={startEdit}
      className="flex items-center gap-1.5 group text-sm font-semibold text-gray-900 hover:text-primary transition-colors"
    >
      <span>{value}</span>
      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400" />
    </button>
  );
}

// ── Escalation rule row ───────────────────────────────────────────────────────

function EscalationRuleRow({
  rule, priorityId, onUpdate, onDelete,
}: {
  rule: EscalationRule;
  priorityId: number;
  onUpdate: (updated: EscalationRule) => void;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftMinutes, setDraftMinutes] = useState(String(rule.threshold_minutes));
  const [draftLevel, setDraftLevel] = useState<'hos' | 'hod'>(rule.to_level);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    const mins = parseInt(draftMinutes, 10);
    if (isNaN(mins) || mins < 1) { toast.error('Threshold must be a positive number of minutes'); return; }
    setSaving(true);
    try {
      const updated = await updateEscalationRule(priorityId, rule.id, { to_level: draftLevel, threshold_minutes: mins });
      onUpdate(updated);
      setEditing(false);
      toast.success('Escalation rule updated');
    } catch { toast.error('Failed to update escalation rule'); } finally { setSaving(false); }
  };

  const del = async () => {
    setDeleting(true);
    try {
      await deleteEscalationRule(priorityId, rule.id);
      onDelete(rule.id);
      toast.success('Escalation rule removed');
    } catch { toast.error('Failed to delete escalation rule'); } finally { setDeleting(false); }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 py-1.5">
        <span className="text-xs text-gray-500 w-20 shrink-0">Escalate to</span>
        <select
          value={draftLevel}
          onChange={e => setDraftLevel(e.target.value as 'hos' | 'hod')}
          className="text-xs border rounded px-2 py-1 h-6 bg-white"
        >
          <option value="hod">HOD</option>
          <option value="hos">HOS</option>
        </select>
        <span className="text-xs text-gray-500">after</span>
        <Input
          type="number" min={1} value={draftMinutes}
          onChange={e => setDraftMinutes(e.target.value)}
          className="h-6 w-24 text-xs px-2 py-0"
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
        />
        <span className="text-xs text-gray-400">min</span>
        <button onClick={save} disabled={saving} className="text-green-600 hover:text-green-700 disabled:opacity-50">
          {saving ? <Spinner /> : <Check className="h-3.5 w-3.5" />}
        </button>
        <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-1.5 group">
      <Badge
        variant="outline"
        className={`text-xs font-normal ${rule.to_level === 'hos' ? 'border-orange-200 text-orange-700 bg-orange-50' : 'border-purple-200 text-purple-700 bg-purple-50'}`}
      >
        {rule.to_level.toUpperCase()}
      </Badge>
      <span className="text-xs text-gray-600">
        after <span className="font-medium">{fmtMins(rule.threshold_minutes)}</span>
      </span>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
        <button
          onClick={() => { setDraftMinutes(String(rule.threshold_minutes)); setDraftLevel(rule.to_level); setEditing(true); }}
          className="text-gray-400 hover:text-gray-700 p-0.5"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button onClick={del} disabled={deleting} className="text-gray-400 hover:text-red-500 p-0.5 disabled:opacity-50">
          {deleting ? <Spinner /> : <Trash2 className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
}

// ── Add escalation rule inline form ──────────────────────────────────────────

function AddEscalationRuleForm({
  priorityId, existingLevels, nextOrder, onAdd, onCancel,
}: {
  priorityId: number;
  existingLevels: Set<string>;
  nextOrder: number;
  onAdd: (rule: EscalationRule) => void;
  onCancel: () => void;
}) {
  const available = (['hod', 'hos'] as const).filter(l => !existingLevels.has(l));
  const [level, setLevel] = useState<'hos' | 'hod'>(available[0] ?? 'hod');
  const [minutes, setMinutes] = useState('');
  const [saving, setSaving] = useState(false);

  if (available.length === 0) {
    return (
      <p className="text-xs text-gray-400 py-1 mt-1 border-t border-dashed">
        All escalation levels covered (HOD + HOS).
      </p>
    );
  }

  const save = async () => {
    const mins = parseInt(minutes, 10);
    if (isNaN(mins) || mins < 1) { toast.error('Threshold must be a positive number of minutes'); return; }
    setSaving(true);
    try {
      const rule = await createEscalationRule(priorityId, { to_level: level, threshold_minutes: mins, order: nextOrder });
      onAdd(rule);
      toast.success('Escalation rule added');
    } catch { toast.error('Failed to add escalation rule'); } finally { setSaving(false); }
  };

  return (
    <div className="flex items-center gap-2 py-1.5 mt-1 border-t border-dashed border-gray-200">
      <span className="text-xs text-gray-500 shrink-0">Escalate to</span>
      <select
        value={level}
        onChange={e => setLevel(e.target.value as 'hos' | 'hod')}
        className="text-xs border rounded px-2 py-1 h-6 bg-white"
      >
        {available.map(l => <option key={l} value={l}>{l.toUpperCase()}</option>)}
      </select>
      <span className="text-xs text-gray-500">after</span>
      <Input
        type="number" min={1} value={minutes}
        onChange={e => setMinutes(e.target.value)}
        className="h-6 w-24 text-xs px-2 py-0"
        placeholder="minutes"
        autoFocus
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onCancel(); }}
      />
      <span className="text-xs text-gray-400">min</span>
      <button onClick={save} disabled={saving} className="text-green-600 hover:text-green-700 disabled:opacity-50">
        {saving ? <Spinner /> : <Check className="h-3.5 w-3.5" />}
      </button>
      <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Priority row ──────────────────────────────────────────────────────────────

function PriorityRow({
  priority,
  onUpdatePriority,
  onDeletePriority,
  isDefault,
  index,
  total,
}: {
  priority: SLAPriority;
  onUpdatePriority: (updated: SLAPriority) => void;
  onDeletePriority: (id: number) => void;
  /** Lowest rank — what `Priority.default()` gives every new ticket. */
  isDefault: boolean;
  /** Position in the rank-sorted ladder, for the severity colour. */
  index: number;
  total: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [addingRule, setAddingRule] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const existingLevels = new Set(priority.escalation_rules.map(r => r.to_level));
  const canAddMore = existingLevels.size < 2;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiClient.delete(`/priorities/${priority.id}/`);
      onDeletePriority(priority.id);
      toast.success(`Priority "${priority.name}" deleted`);
    } catch (err: unknown) {
      // The server answers 409 with how many tickets still use it — show that
      // rather than "Failed", which leaves the admin with nothing to act on.
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Failed to delete priority');
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  return (
    <>
      <tr className="border-b hover:bg-gray-50 group">
        <td className="px-5 py-3">
          <div className="flex items-center gap-2">
            {/* Severity at a glance. Four rows of identical black text made
                Critical look no different from Low on a page whose whole
                subject is how different they are. */}
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={severityStyle(index, total)}
              aria-hidden
            />
            <InlineTextInput
              value={priority.name}
              placeholder="Priority name"
              onSave={async (name) => {
                await updatePriority(priority.id, { name } as Parameters<typeof updatePriority>[1]);
                onUpdatePriority({ ...priority, name });
                toast.success('Priority name updated');
              }}
            />
            {/* `Priority.default()` returns the lowest rank, so reordering ranks
                silently changes what every future ticket opens at. That is too
                load-bearing to leave implicit. */}
            {isDefault && (
              <Badge
                variant="outline"
                className="shrink-0 text-[10px] font-normal border-primary/30 text-primary bg-primary/5"
                title="Tickets are created at this priority. The HOS sets the real one when assigning."
              >
                new tickets open here
              </Badge>
            )}
          </div>
        </td>
        <td className="px-3 py-3 text-xs text-gray-400 text-center">{priority.rank}</td>
        <td className="px-3 py-3">
          <MinuteInput
            value={priority.response_minutes}
            onSave={async (v) => {
              await updatePriority(priority.id, { response_minutes: v });
              onUpdatePriority({ ...priority, response_minutes: v });
              toast.success('Response target updated');
            }}
          />
        </td>
        <td className="px-3 py-3">
          <MinuteInput
            value={priority.resolution_minutes}
            onSave={async (v) => {
              await updatePriority(priority.id, { resolution_minutes: v });
              onUpdatePriority({ ...priority, resolution_minutes: v });
              toast.success('Resolution target updated');
            }}
          />
        </td>
        <td className="px-3 py-3">
          {/* The ladder itself, not a count of it. "2 rules" meant expanding
              every row in turn to answer "when does a High ticket reach the
              HOD?" — the one question this column exists for. */}
          <button
            onClick={() => { setExpanded(!expanded); setAddingRule(false); }}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors group/esc"
            title="Click to edit escalation rules"
          >
            {priority.escalation_rules.length === 0 ? (
              <span className="text-gray-400 italic">never escalates</span>
            ) : (
              <span className="flex items-center gap-1">
                <span className="text-gray-400">Technician</span>
                {[...priority.escalation_rules]
                  .sort((a, b) => a.threshold_minutes - b.threshold_minutes)
                  .map((rule) => (
                    <span key={rule.id} className="flex items-center gap-1">
                      <ArrowRight className="h-3 w-3 text-gray-300" />
                      <span className="font-medium text-gray-700 uppercase">{rule.to_level}</span>
                      <span className="text-gray-400">{fmtMins(rule.threshold_minutes)}</span>
                    </span>
                  ))}
              </span>
            )}
            {expanded
              ? <ChevronUp className="h-3.5 w-3.5 shrink-0" />
              : <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover/esc:opacity-100 transition-opacity" />}
          </button>
        </td>
        <td className="px-3 py-3 text-right">
          <button
            onClick={() => setDeleteOpen(true)}
            className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-0.5"
            title="Delete priority"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </td>
      </tr>

      {expanded && (
        <tr className="bg-gray-50/60 border-b">
          <td colSpan={6} className="px-8 py-3">
            <div className="max-w-sm">
              {priority.escalation_rules.length === 0 && !addingRule && (
                <p className="text-xs text-gray-400 mb-1.5">No escalation rules configured.</p>
              )}
              {priority.escalation_rules.map(rule => (
                <EscalationRuleRow
                  key={rule.id}
                  rule={rule}
                  priorityId={priority.id}
                  onUpdate={updated => onUpdatePriority({
                    ...priority,
                    escalation_rules: priority.escalation_rules.map(r => r.id === updated.id ? updated : r),
                  })}
                  onDelete={id => onUpdatePriority({
                    ...priority,
                    escalation_rules: priority.escalation_rules.filter(r => r.id !== id),
                  })}
                />
              ))}
              {addingRule && (
                <AddEscalationRuleForm
                  priorityId={priority.id}
                  existingLevels={existingLevels}
                  nextOrder={priority.escalation_rules.length + 1}
                  onAdd={rule => { onUpdatePriority({ ...priority, escalation_rules: [...priority.escalation_rules, rule] }); setAddingRule(false); }}
                  onCancel={() => setAddingRule(false)}
                />
              )}
              {!addingRule && canAddMore && (
                <button
                  onClick={() => setAddingRule(true)}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 mt-1.5 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Add escalation rule
                </button>
              )}
            </div>
          </td>
        </tr>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Delete priority "{priority.name}"?
          </span>
        }
        description="This will permanently delete this priority level and all its escalation rules. Any service categories using this priority will lose their default priority assignment."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </>
  );
}

// ── New priority dialog ───────────────────────────────────────────────────────

function NewPriorityDialog({
  open,
  onOpenChange,
  nextRank,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nextRank: number;
  onCreated: (p: SLAPriority) => void;
}) {
  const [name, setName] = useState('');
  const [rank, setRank] = useState(String(nextRank));
  const [responseMinutes, setResponseMinutes] = useState('60');
  const [resolutionMinutes, setResolutionMinutes] = useState('480');
  const [saving, setSaving] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  const [prevNextRank, setPrevNextRank] = useState(nextRank);

  if (prevOpen !== open || prevNextRank !== nextRank) {
    setPrevOpen(open);
    setPrevNextRank(nextRank);
    if (open) {
      setName('');
      setRank(String(nextRank));
      setResponseMinutes('60');
      setResolutionMinutes('480');
    }
  }

  const handleCreate = async () => {
    if (!name.trim()) { toast.error('Priority name is required'); return; }
    const rankNum = parseInt(rank, 10);
    const respNum = parseInt(responseMinutes, 10);
    const resolNum = parseInt(resolutionMinutes, 10);
    if (isNaN(rankNum) || rankNum < 1) { toast.error('Rank must be a positive number'); return; }
    if (isNaN(respNum) || respNum < 1) { toast.error('Response target must be a positive number of minutes'); return; }
    if (isNaN(resolNum) || resolNum < 1) { toast.error('Resolution target must be a positive number of minutes'); return; }

    setSaving(true);
    try {
      const { data } = await apiClient.post<SLAPriority>('/priorities/', {
        name: name.trim(),
        rank: rankNum,
        response_minutes: respNum,
        resolution_minutes: resolNum,
      });
      onCreated({ ...data, escalation_rules: data.escalation_rules ?? [] });
      toast.success(`Priority "${data.name}" created`);
      onOpenChange(false);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { rank?: string[] } } })?.response?.data?.rank?.[0];
      toast.error(detail ?? 'Failed to create priority');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New Priority Level</DialogTitle>
          <DialogDescription>
            Define a new SLA priority tier with response and resolution targets.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="prio-name" className="text-sm font-medium">Name *</Label>
            <Input
              id="prio-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Critical"
              className="h-10"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prio-rank" className="text-sm font-medium">
              Rank *
              <span className="ml-1 font-normal text-gray-400">(higher = more urgent)</span>
            </Label>
            <Input
              id="prio-rank"
              type="number"
              min={1}
              value={rank}
              onChange={e => setRank(e.target.value)}
              className="h-10"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="prio-resp" className="text-sm font-medium">Response (min) *</Label>
              <Input
                id="prio-resp"
                type="number"
                min={1}
                value={responseMinutes}
                onChange={e => setResponseMinutes(e.target.value)}
                className="h-10"
              />
              {responseMinutes && !isNaN(parseInt(responseMinutes)) && (
                <p className="text-xs text-gray-500">= {fmtMins(parseInt(responseMinutes))}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="prio-resol" className="text-sm font-medium">Resolution (min) *</Label>
              <Input
                id="prio-resol"
                type="number"
                min={1}
                value={resolutionMinutes}
                onChange={e => setResolutionMinutes(e.target.value)}
                className="h-10"
              />
              {resolutionMinutes && !isNaN(parseInt(resolutionMinutes)) && (
                <p className="text-xs text-gray-500">= {fmtMins(parseInt(resolutionMinutes))}</p>
              )}
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? 'Creating…' : 'Create Priority'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SLARulesPage() {
  const [priorities, setPriorities] = useState<SLAPriority[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPriorityOpen, setNewPriorityOpen] = useState(false);

  useEffect(() => {
    getPriorities()
      .then(setPriorities)
      .catch(() => toast.error('Failed to load SLA rules'))
      .finally(() => setLoading(false));
  }, []);

  const nextRank = priorities.length > 0 ? Math.max(...priorities.map(p => p.rank)) + 1 : 1;

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="space-y-px">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-14 w-full rounded-none first:rounded-t-lg last:rounded-b-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-600 mt-1">
            Set response and resolution targets per priority level. Click any value to edit inline.
          </p>
        </div>
        <Button onClick={() => setNewPriorityOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New Priority
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3 pt-6 px-6">
          <CardTitle className="text-base">Priority Levels</CardTitle>
          <p className="text-xs text-gray-500 mt-1">
            Click a name or a time to edit it inline. Expand a row to manage escalation rules.
            Rank is fixed at creation — it decides which priority new tickets open at.
          </p>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {priorities.length === 0 ? (
            <div className="text-center py-16 px-6">
              <Clock className="h-10 w-10 mx-auto mb-3 text-gray-200" />
              <p className="text-sm font-medium text-gray-600">No priority levels configured</p>
              <p className="text-xs text-gray-400 mt-1 mb-4">Create your first priority to define SLA targets</p>
              <Button variant="outline" onClick={() => setNewPriorityOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Create First Priority
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-gray-500 bg-gray-50">
                    <th className="text-left px-5 py-2.5 font-medium">Priority Name</th>
                    <th className="text-center px-3 py-2.5 font-medium w-16">Rank</th>
                    <th className="text-left px-3 py-2.5 font-medium">Response Target</th>
                    <th className="text-left px-3 py-2.5 font-medium">Resolution Target</th>
                    <th className="text-left px-3 py-2.5 font-medium">Escalations</th>
                    <th className="w-10 px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {priorities
                    .slice()
                    .sort((a, b) => a.rank - b.rank)
                    .map((p, index, sorted) => (
                      <PriorityRow
                        key={p.id}
                        priority={p}
                        isDefault={index === 0}
                        index={index}
                        total={sorted.length}
                        onUpdatePriority={updated =>
                          setPriorities(prev => prev.map(pr => pr.id === updated.id ? updated : pr))
                        }
                        onDeletePriority={id =>
                          setPriorities(prev => prev.filter(pr => pr.id !== id))
                        }
                      />
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 pt-6 px-6">
          <CardTitle className="text-base">How SLA Rules Work</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 pt-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="rounded-lg bg-blue-50 border border-blue-100 p-4">
              <p className="font-medium text-blue-900 mb-1">Response Target</p>
              <p className="text-xs text-blue-700">Time from ticket creation to first assignment. If unmet, triggers a warning.</p>
            </div>
            <div className="rounded-lg bg-green-50 border border-green-100 p-4">
              <p className="font-medium text-green-900 mb-1">Resolution Target</p>
              <p className="text-xs text-green-700">Time from ticket creation to resolved status. Breach marks the ticket as SLA-breached.</p>
            </div>
            <div className="rounded-lg bg-orange-50 border border-orange-100 p-4">
              <p className="font-medium text-orange-900 mb-1">Escalation Rules</p>
              <p className="text-xs text-orange-700">Automatically escalate to HOS or HOD after a set number of minutes if the ticket is still open.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <NewPriorityDialog
        open={newPriorityOpen}
        onOpenChange={setNewPriorityOpen}
        nextRank={nextRank}
        onCreated={p => setPriorities(prev => [...prev, p].sort((a, b) => a.rank - b.rank))}
      />
    </div>
  );
}
