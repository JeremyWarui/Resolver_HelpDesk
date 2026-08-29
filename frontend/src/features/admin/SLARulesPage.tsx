import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Check, Clock, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getPriorities, updatePriority } from '@/lib/api/sla';
import { formatMinutes } from '@/utils/date';
import type { Priority } from '@/types';

/** The four editable durations, in the order they fire.
 *
 *  `measures` says what the number is counted between. All four run from when
 *  the ticket was raised, which is the thing a reader most often gets wrong —
 *  the escalation thresholds are not measured from the assignment. */
const FIELDS = [
  { key: 'response_minutes', label: 'Response', measures: 'Raised → first assignment' },
  { key: 'resolution_minutes', label: 'Resolution', measures: 'Raised → resolved' },
  { key: 'escalate_to_hos_minutes', label: 'To HOS', measures: 'Raised → climbs to the HOS' },
  { key: 'escalate_to_hod_minutes', label: 'To HOD', measures: 'Raised → climbs to the HOD' },
] as const;

type Field = (typeof FIELDS)[number]['key'];

/** Severity colour from position in the ladder, so a renamed level still reads right. */
function severityDot(index: number, total: number): React.CSSProperties {
  const tokens = ['--priority-low', '--priority-medium', '--priority-high', '--priority-critical'];
  const slot = total <= 1 ? 0 : Math.round((index / (total - 1)) * (tokens.length - 1));
  return { backgroundColor: `var(${tokens[Math.min(slot, tokens.length - 1)]}-text)` };
}

/** A duration shown as words, edited in minutes. */
function MinuteCell({ value, onSave }: { value: number; onSave: (v: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const parsed = parseInt(draft, 10);
    if (isNaN(parsed) || parsed < 1) {
      toast.error('Must be a positive number of minutes');
      return;
    }
    setSaving(true);
    try {
      await onSave(parsed);
      setEditing(false);
    } catch {
      // The page keeps the field open so the admin can correct the value.
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          type="number"
          min={1}
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          className="h-7 w-24 text-xs px-2 py-0"
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
        <button onClick={save} disabled={saving} className="text-green-600 disabled:opacity-50">
          <Check className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => {
        setDraft(String(value));
        setEditing(true);
      }}
      className="flex items-center gap-2 group text-sm text-gray-700 hover:text-primary transition-colors"
    >
      <Clock className="h-3.5 w-3.5 text-gray-400" />
      <span className="font-medium">{formatMinutes(value)}</span>
      {/* Always visible, and a word rather than an icon: a pencil that appears
          on hover cannot tell anyone the cell is editable before they hover it. */}
      <span className="text-xs font-medium text-primary/70 group-hover:text-primary">Edit</span>
    </button>
  );
}

/** Admin page: the SLA targets and escalation thresholds each priority carries. */
export default function SLARulesPage() {
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPriorities()
      .then(setPriorities)
      .catch(() => toast.error('Failed to load SLA rules'))
      .finally(() => setLoading(false));
  }, []);

  const save = async (priority: Priority, field: Field, minutes: number) => {
    try {
      const updated = await updatePriority(priority.id, { [field]: minutes });
      setPriorities((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      toast.success('Target updated');
    } catch (err: unknown) {
      // The serializer rejects an out-of-order pair by field name; show what it said.
      const data = (err as { response?: { data?: Record<string, string[]> } })?.response?.data;
      toast.error(Object.values(data ?? {})[0]?.[0] ?? 'Failed to update');
      throw err;
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-8 w-40" />
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <p className="text-sm text-gray-600">
        Every ticket opens at the lowest priority; the HOS sets the real one when they assign
        it. Click a duration to edit it.
      </p>

      {/* The table earns the width; the rules beside it are read once. Stacks
          below lg, where a fifth of the page is too narrow for prose. */}
      <div className="grid gap-4 lg:grid-cols-4 items-start">
      <Card className="lg:col-span-3">
        <CardHeader className="pb-3 pt-6 px-6">
          <CardTitle className="text-base">Priority Levels</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-gray-500 bg-gray-50">
                  <th className="text-left px-5 py-3 text-sm font-semibold text-gray-700 align-bottom">
                    Priority
                  </th>
                  {FIELDS.map((f) => (
                    <th key={f.key} className="text-left px-3 py-3">
                      <span className="block text-sm font-semibold text-gray-700">{f.label}</span>
                      <span className="block text-xs font-normal text-gray-400 mt-0.5">
                        {f.measures}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {priorities.map((p, index) => (
                  <tr key={p.id} className="border-b hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={severityDot(index, priorities.length)}
                          aria-hidden
                        />
                        <span className="font-semibold text-gray-900">{p.name}</span>
                        {index === 0 && (
                          <span className="text-[10px] text-primary">new tickets open here</span>
                        )}
                      </div>
                    </td>
                    {FIELDS.map((f) => (
                      <td key={f.key} className="px-3 py-3">
                        <MinuteCell value={p[f.key]} onSave={(v) => save(p, f.key, v)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Behaviour, not column meanings: what a column measures is on its own
          header, and these are the rules that apply whatever the numbers are. */}
      <Card className="lg:col-span-1">
        <CardHeader className="pb-3 pt-6 px-5">
          <CardTitle className="text-base">How the clock works</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-6 pt-2 space-y-3 text-xs text-gray-600">
          <p>
            The clock starts when the ticket is raised — time spent unassigned counts.
          </p>
          <p>
            A hold freezes it. Every target moves out by however long the hold lasted, so a
            job waiting on a part nobody could supply is not marked late for it.
          </p>
          <p>
            Reopening restarts the clock, and clears the hold and the assignee with it.
          </p>
          <p className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="font-medium text-gray-700">Technician</span>
            <ArrowRight className="h-3 w-3 text-gray-300" />
            <span className="font-medium text-gray-700">HOS</span>
            <ArrowRight className="h-3 w-3 text-gray-300" />
            <span className="font-medium text-gray-700">HOD</span>
          </p>
          <p>A vacant post is skipped and the ticket keeps climbing.</p>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
