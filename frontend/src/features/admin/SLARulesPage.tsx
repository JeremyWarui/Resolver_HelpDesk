import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Check, Pause, Pencil, RotateCcw, Timer, TrendingUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { getPriorities, updatePriority } from '@/lib/api/sla';
import { formatMinutes } from '@/utils/date';
import type { Priority } from '@/types';
import EscalationCheck from './EscalationCheck';

/** The four editable durations, in the order they fire.
 *
 *  `measures` says what the number is counted between. All four run from when
 *  the ticket was raised, which is the thing a reader most often gets wrong —
 *  the escalation thresholds are not measured from the assignment. */
const FIELDS = [
  { key: 'response_minutes', label: 'Response', measures: 'Raised → first assignment', group: 'Targets' },
  { key: 'resolution_minutes', label: 'Resolution', measures: 'Raised → resolved', group: 'Targets' },
  { key: 'escalate_to_hos_minutes', label: 'To HOS', measures: 'Raised → climbs to the HOS', group: 'Escalation' },
  { key: 'escalate_to_hod_minutes', label: 'To HOD', measures: 'Raised → climbs to the HOD', group: 'Escalation' },
] as const;

const GROUPS = ['Targets', 'Escalation'] as const;

type Field = (typeof FIELDS)[number]['key'];

/** Severity colour from position in the ladder, so a renamed level still reads right. */
function severityDot(index: number, total: number): React.CSSProperties {
  const tokens = ['--priority-low', '--priority-medium', '--priority-high', '--priority-critical'];
  const slot = total <= 1 ? 0 : Math.round((index / (total - 1)) * (tokens.length - 1));
  return { backgroundColor: `var(${tokens[Math.min(slot, tokens.length - 1)]}-text)` };
}

/** One duration: shown in words, edited in minutes, saved on Enter. */
function DurationRow({ label, measures, value, editLabel, onSave }: {
  label: string;
  measures: string;
  value: number;
  /** What the pencil says to a screen reader, e.g. "Edit Low response". */
  editLabel: string;
  onSave: (v: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const parsed = parseInt(draft, 10);
  const valid = !isNaN(parsed) && parsed >= 1;

  const save = async () => {
    if (!valid) {
      toast.error('Must be a positive number of minutes');
      return;
    }
    setSaving(true);
    try {
      await onSave(parsed);
      setEditing(false);
    } catch {
      // The row stays open so the admin can correct the value.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="text-[11px] text-gray-400 truncate">{measures}</p>
      </div>
      {editing ? (
        <div className="flex items-start gap-1 shrink-0">
          <div className="text-right">
            <Input
              type="number"
              min={1}
              value={draft}
              autoFocus
              aria-label={`${label} in minutes`}
              onChange={(e) => setDraft(e.target.value)}
              className="h-8 w-24 text-sm px-2"
              onKeyDown={(e) => {
                if (e.key === 'Enter') save();
                if (e.key === 'Escape') setEditing(false);
              }}
            />
            <p className="text-[10px] text-gray-400 mt-0.5">
              {valid ? `= ${formatMinutes(parsed)}` : 'minutes'}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Save"
            onClick={save}
            disabled={saving}
            className="h-8 w-8 p-0 text-green-600 hover:bg-green-50"
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Cancel"
            onClick={() => setEditing(false)}
            className="h-8 w-8 p-0 text-gray-400 hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-lg font-semibold text-gray-900 tabular-nums">{formatMinutes(value)}</span>
          <Button
            variant="ghost"
            size="sm"
            aria-label={editLabel}
            onClick={() => { setDraft(String(value)); setEditing(true); }}
            className="h-7 w-7 p-0 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

/** What the clock does whatever the numbers are. */
const CLOCK_RULES = [
  {
    icon: Timer,
    title: 'Starts when raised, or reopened',
    text: 'Every duration counts from when the clock last started: when the ticket was raised, or when it was reopened. Time spent unassigned counts.',
  },
  {
    icon: Pause,
    title: 'A hold freezes it',
    text: 'Every target moves out by however long the hold lasted, so waiting on a part is not late.',
  },
  {
    icon: RotateCcw,
    title: 'Reopening restarts it',
    text: 'The clock starts again, and the hold and the assignee are cleared with it.',
  },
  {
    icon: TrendingUp,
    title: 'Escalation climbs',
    text: 'Technician, then HOS, then HOD, on each run of the escalation check. A vacant post is skipped and the ticket keeps climbing.',
  },
];

/** Admin page: whether the escalation check is running, and the SLA targets and
 *  escalation thresholds each priority carries. */
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

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <EscalationCheck />

      <Card className="overflow-hidden">
        <div className="px-6 pt-5 pb-3">
          <p className="text-sm font-semibold text-gray-700">Priorities</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Every ticket opens at the lowest priority, and the HOS sets the real one when they assign it.
          </p>
        </div>

        <div className="px-6 pb-6">
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-72 rounded-xl" />)}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 items-start">
              {priorities.map((p, index) => (
                <section
                  key={p.id}
                  aria-label={p.name}
                  className="rounded-xl border border-gray-200 bg-white overflow-hidden hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-center gap-2 px-4 py-3 bg-gray-50/70 border-b border-gray-100">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={severityDot(index, priorities.length)}
                      aria-hidden
                    />
                    <h3 className="font-semibold text-sm text-gray-900">{p.name}</h3>
                    {index === 0 && (
                      <span className="ml-auto text-[10px] font-medium text-gray-500 bg-white border border-gray-200 rounded-full px-2 py-0.5">
                        New tickets start here
                      </span>
                    )}
                  </div>
                  <div className="px-4 py-1">
                    {GROUPS.map((group) => (
                      <div key={group} className="py-2 border-t border-gray-100 first:border-t-0">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400 pt-1">
                          {group}
                        </p>
                        <div className="divide-y divide-gray-50">
                          {FIELDS.filter((f) => f.group === group).map((f) => (
                            <DurationRow
                              key={f.key}
                              label={f.label}
                              measures={f.measures}
                              value={p[f.key]}
                              editLabel={`Edit ${p.name} ${f.label.toLowerCase()}`}
                              onSave={(v) => save(p, f.key, v)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <p className="text-sm font-semibold text-gray-700 mb-4">How the clock works</p>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {CLOCK_RULES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-3">
              <div className="h-8 w-8 shrink-0 rounded-lg bg-gray-100 flex items-center justify-center">
                <Icon className="h-4 w-4 text-gray-500" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">{title}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{text}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="flex flex-wrap items-center gap-1.5 mt-5 pt-4 border-t border-gray-100 text-xs text-gray-500">
          <span className="font-medium text-gray-700">Technician</span>
          <ArrowRight className="h-3 w-3 text-gray-300" aria-hidden />
          <span className="font-medium text-gray-700">HOS</span>
          <ArrowRight className="h-3 w-3 text-gray-300" aria-hidden />
          <span className="font-medium text-gray-700">HOD</span>
          <span className="ml-1">is the whole ladder, and it is fixed.</span>
        </p>
      </Card>
    </div>
  );
}
