import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { assignTicket } from '@/lib/api/tickets';
import { useTicketInvalidate } from '@/hooks/tickets/useTicketDetail';
import { useSectionTechnicians } from '@/hooks/technicians/useSectionTechnicians';
import { getPriorities } from '@/lib/api/sla';
import type { Ticket } from '@/types';

interface AssignmentModalProps {
  ticket: Ticket;
  open: boolean;
  onClose: () => void;
  onSuccess: (updated: Ticket) => void;
  mode?: 'assign' | 'reassign';
}

export function AssignmentModal({
  ticket,
  open,
  onClose,
  onSuccess,
  mode = 'assign',
}: AssignmentModalProps) {
  const [selectedTechId, setSelectedTechId] = useState<number | null>(null);
  const [priorityId, setPriorityId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const invalidate = useTicketInvalidate();

  // Scoped to the ticket's trade as well as its section — a plumber is not an
  // option for a carpentry job, and the server would refuse it anyway.
  const { data: technicians = [], isLoading: loadingTechs, error: techError } = useSectionTechnicians(
    open ? ticket.section.id : null,
    ticket.sub_section?.id,
  );

  const { data: priorities = [] } = useQuery({
    queryKey: ['priorities'],
    queryFn: getPriorities,
    enabled: open,
    staleTime: 30 * 60 * 1000,
  });

  // Highest urgency first — the judgement being made is "is this worse than
  // the Low it opened at", so the alternatives should lead.
  const priorityChoices = useMemo(
    () => [...priorities].sort((a, b) => b.rank - a.rank),
    [priorities],
  );

  const chosenPriority = priorityId ?? ticket.priority?.id ?? null;

  function handleClose() {
    setSelectedTechId(null);
    setPriorityId(null);
    setNote('');
    onClose();
  }

  async function handleSubmit() {
    if (!selectedTechId) return;
    setSubmitting(true);
    try {
      const updated = await assignTicket(
        ticket.id,
        selectedTechId,
        priorityId ?? undefined,
        note,
      );
      const tech = technicians.find((t) => t.id === selectedTechId);
      const displayName = tech
        ? (tech.first_name && tech.last_name ? `${tech.first_name} ${tech.last_name}` : tech.username)
        : `technician ${selectedTechId}`;
      toast.success(
        mode === 'reassign'
          ? `Ticket reassigned to ${displayName}`
          : `Ticket assigned to ${displayName}`
      );
      invalidate(ticket.id);
      setSelectedTechId(null);
      setPriorityId(null);
      setNote('');
      onSuccess(updated);
    } catch {
      toast.error(mode === 'reassign' ? 'Failed to reassign ticket' : 'Failed to assign ticket');
    } finally {
      setSubmitting(false);
    }
  }

  const title = mode === 'reassign' ? 'Reassign ticket' : 'Assign ticket';
  const currentAssignee = ticket.assigned_to;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="w-[520px] max-w-[90vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <DialogTitle>{title}</DialogTitle>
            <span className="text-sm text-muted-foreground font-mono">
              #{ticket.ticket_no}
            </span>
          </div>
          <DialogDescription>
            Assign this ticket to a {ticket.sub_section?.name.toLowerCase() ?? 'section'} technician,
            and set how urgent it is.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Current assignee (reassign mode) */}
          {currentAssignee && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Currently assigned to:</span>
              <span className="font-medium text-foreground">
                {currentAssignee.full_name || currentAssignee.name || currentAssignee.username}
              </span>
            </div>
          )}

          {/* Priority — above the technician list on purpose.
              The two judgements feed each other: how urgent this is decides
              who can realistically take it now. Deciding the person first, and
              the urgency afterwards from below a scrolling list, is the wrong
              way round. */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
                Priority
              </span>
              <div className="flex-1 border-t border-border" />
            </div>

            {/* No choices means the fetch failed, not that there are no
                priorities — the seed always has four. Say so instead of
                drawing a heading above an empty grid, which is how this
                shipped looking like a control that was simply missing. */}
            {priorityChoices.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Could not load the priority list. The ticket keeps its current
                priority ({ticket.priority?.name ?? 'Low'}); assignment still works.
              </p>
            ) : (
            <div className="grid grid-cols-4 gap-2">
              {priorityChoices.map((p) => {
                const isSelected = chosenPriority === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPriorityId(p.id)}
                    disabled={submitting}
                    className={[
                      'rounded-md border px-2 py-2 text-center text-xs font-medium transition-colors',
                      isSelected
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted/50',
                    ].join(' ')}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
            )}
            {priorityChoices.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {priorityId == null
                  ? `Opened at ${ticket.priority?.name ?? 'Low'}. Raise it if this is worse than it reads.`
                  : 'The SLA is re-timed from when the ticket was raised, not from now.'}
              </p>
            )}
          </div>

          {/* Technician radio cards */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
                {mode === 'reassign' ? 'New technician' : 'Technician'}{' '}
                <span className="text-destructive">*</span>
              </span>
              <div className="flex-1 border-t border-border" />
            </div>

            {loadingTechs ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : techError ? (
              <p className="text-sm text-destructive py-2">
                Failed to load technicians (section {ticket.section.id}).{' '}
                {(techError as { message?: string }).message ?? 'Network error'}
              </p>
            ) : technicians.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-2">
                No {ticket.sub_section?.name.toLowerCase() ?? ''} technicians at this campus.
                The ticket routed correctly, but there is nobody here to do the work.
              </p>
            ) : (
              technicians.map((tech) => {
                const isSelected = selectedTechId === tech.id;
                const fullName = tech.first_name && tech.last_name
                  ? `${tech.first_name} ${tech.last_name}`
                  : null;
                return (
                  <button
                    key={tech.id}
                    type="button"
                    onClick={() => setSelectedTechId(tech.id)}
                    disabled={submitting}
                    className={[
                      'w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors',
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-background hover:bg-muted/50',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                        isSelected
                          ? 'border-primary bg-primary'
                          : 'border-muted-foreground bg-transparent',
                      ].join(' ')}
                    >
                      {isSelected && (
                        <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground leading-snug">
                          {fullName ?? tech.username}
                        </p>
                      </div>
                      {fullName && (
                        <p className="text-xs text-muted-foreground leading-snug">
                          @{tech.username}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Optional note */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
                Note
              </span>
              <span className="text-xs font-medium text-primary uppercase tracking-wide">
                Optional
              </span>
              <div className="flex-1 border-t border-border" />
            </div>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Any context or instructions for the technician…"
              rows={3}
              disabled={submitting}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedTechId || submitting}
          >
            {submitting
              ? mode === 'reassign' ? 'Reassigning…' : 'Assigning…'
              : mode === 'reassign' ? 'Reassign' : 'Assign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
