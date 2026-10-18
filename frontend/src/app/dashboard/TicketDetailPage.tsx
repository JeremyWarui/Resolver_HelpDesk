import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  UserCheck, RefreshCw, AlertCircle,
  RotateCcw, Star, Hand, CheckCheck, Play, Paperclip, FileText, PauseCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/shared/ticket/StatusBadge';
import { PriorityBadge } from '@/components/shared/ticket/PriorityBadge';
import { SLACountdown } from '@/components/shared/ticket/SLACountdown';
import { TicketTimeline } from '@/components/shared/ticket/TicketTimeline';
import { TicketProgress } from '@/components/shared/ticket/TicketProgress';
import CommentThread from '@/components/shared/ticket/CommentThread';
import { StatusUpdateModal } from '@/features/technician/StatusUpdateModal';
import { AssignmentModal } from '@/features/shared/AssignmentModal';
import { RatingModal } from '@/features/user/RatingModal';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { useTicketAttachments, useTicketDetail, useTicketInvalidate, useTicketTimeline } from '@/hooks/tickets/useTicketDetail';
import { usePermissions } from '@/lib/auth/permissions';
import { useAuthStore } from '@/stores/authStore';
import { claimTicket, reopenTicket, startWork } from '@/lib/api/tickets';
import { RatingStars } from '@/components/shared/ticket/RatingWidget';
import { formatDateTime } from '@/utils/date';
import { formatPhoneLocal } from '@/utils/phone';
import { formatBytes } from '@/utils/format';
import { ESCALATION_LEVEL } from '@/constants/roles';
import { TokenPill } from '@/components/shared/ticket/TokenPill';
import { HELD_STATUSES, REQUESTER_COMMENT_STATUSES, WORKING_STATUSES } from '@/constants/tickets';
import type { Ticket } from '@/types';

type ActiveModal = 'status' | 'assign' | 'rate' | 'reopen' | null;

/** The server's verdict on the resolution target (`tickets/sla.py`), as a pill. */
const SLA_OUTCOME: Record<NonNullable<Ticket['sla_outcome']>, { label: string; token: string }> = {
  met: { label: 'Met', token: '--status-resolved' },
  missed: { label: 'Missed', token: '--status-escalated' },
  overdue: { label: 'Overdue', token: '--status-escalated' },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
      {children}
    </h3>
  );
}

/** One labelled line in a details list; an empty value leaves the line out. */
function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <div className="px-4 py-3 flex items-center justify-between gap-4">
      <span className="text-sm font-medium text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm text-foreground text-right">{value}</span>
    </div>
  );
}

/** A titled, bordered list of `DetailRow`s. */
function DetailGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="border rounded-lg divide-y">{children}</div>
    </div>
  );
}

/** A short, tinted note about what is happening now: a hold, a fix, a rating. */
function Callout({ tone, icon, title, children }: {
  /** A --status-* token base; its -bg and -text colour the note. */
  tone: string;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="rounded-lg border p-4 text-sm"
      style={{ backgroundColor: `var(${tone}-bg)`, borderColor: `var(${tone}-bg)` }}
    >
      <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: `var(${tone}-text)` }}>
        {icon}
        {title}
      </h3>
      <div className="text-gray-800">{children}</div>
    </section>
  );
}

function TicketDetailSkeleton() {
  return (
    <>
      <DialogHeader className="px-6 py-4 border-b shrink-0">
        <DialogTitle className="sr-only">Loading ticket</DialogTitle>
        <div className="flex items-center gap-3 pr-8">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-5 w-20" />
            </div>
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
      </DialogHeader>
      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-56 w-full rounded-lg" />
            <Skeleton className="h-28 w-full rounded-lg" />
          </div>
        </div>
      </div>
    </>
  );
}

function TicketNotFound({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
      <DialogTitle className="sr-only">Ticket not found</DialogTitle>
      <AlertCircle className="h-12 w-12 text-muted-foreground" />
      <div>
        <p className="text-base font-semibold">Ticket not found</p>
        <p className="text-sm text-muted-foreground mt-1">
          This ticket may not exist or you may not have permission to view it.
        </p>
      </div>
      <Button variant="outline" onClick={onClose} className="gap-2">
        Close
      </Button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface TicketDetailPageProps {
  ticketId: number | null;
  open: boolean;
  onClose: () => void;
}

export function TicketDetailPage({ ticketId, open, onClose }: TicketDetailPageProps) {
  const permissions = usePermissions();
  const currentUser = useAuthStore((s) => s.user);
  const invalidate = useTicketInvalidate();

  const { ticket, loading, error } = useTicketDetail(ticketId ?? null);
  const { events, loading: timelineLoading } = useTicketTimeline(ticketId ?? null);
  const { attachments } = useTicketAttachments(ticketId ?? null);

  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [reopenSubmitting, setReopenSubmitting] = useState(false);
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [startSubmitting, setStartSubmitting] = useState(false);

  const isRaisedByCurrentUser = ticket?.raised_by?.id === currentUser?.id;
  // Staff who raised a ticket in their own scope still work it as staff; the
  // server decides which this caller is.
  const viewsAsRequester = ticket?.viewer_is_requester ?? isRaisedByCurrentUser;
  const showComments =
    ticket != null &&
    (viewsAsRequester
      ? REQUESTER_COMMENT_STATUSES.includes(ticket.status)
      : currentUser?.role !== 'manager');

  // The resolution note is prose and has no column on the ticket, so it is read
  // off the timeline. The hold reason is a column and is read from there.
  const resolutionNote = useMemo(() => {
    if (!ticket || !['resolved', 'closed'].includes(ticket.status)) return null;
    const ev = [...events].reverse().find((e) => e.event_type === 'resolved');
    return ev?.note ?? null;
  }, [ticket, events]);

  // How far it has climbed. Escalation is structural, so only the level is shown.
  const escalatedTo =
    ticket?.current_level && ticket.current_level !== 'technician'
      ? ESCALATION_LEVEL[ticket.current_level]?.full ?? ticket.current_level
      : null;

  // A technician claims an unassigned open ticket in their own (campus, trade)
  // pairs, their own raised ones included; outside those they are only its
  // requester.
  const showClaim =
    currentUser?.role === 'technician' &&
    ticket != null &&
    ticket.status === 'open' &&
    ticket.assigned_to == null &&
    !viewsAsRequester;

  // "Start work": the assignee leaves `assigned` in one tap, with no progress
  // note. Time spent in `assigned` is what the response-time SLA measures.
  const showStartWork =
    ticket != null &&
    ticket.status === 'assigned' &&
    ticket.assigned_to?.id === currentUser?.id;

  const showStatusUpdate =
    permissions.canUpdateTicketStatus &&
    ticket != null &&
    HELD_STATUSES.includes(ticket.status);

  const showAssign =
    permissions.canAssignTicket && ticket?.status === 'open';

  const showReassign =
    permissions.canReassignTicket &&
    ticket != null &&
    WORKING_STATUSES.includes(ticket.status) &&
    ticket.assigned_to != null;

  const showConfirmResolved =
    permissions.canCloseTicket &&
    ticket?.status === 'resolved' &&
    isRaisedByCurrentUser;

  const showReopen =
    permissions.canReopenTicket &&
    ticket != null &&
    ['resolved', 'closed'].includes(ticket.status) &&
    isRaisedByCurrentUser;

  function onModalSuccess(updated: Ticket) {
    invalidate(updated.id);
    setActiveModal(null);
  }

  async function handleReopen() {
    if (!ticket) return;
    setReopenSubmitting(true);
    try {
      await reopenTicket(ticket.id);
      toast.info('Ticket reopened.');
      invalidate(ticket.id);
      setActiveModal(null);
    } catch {
      toast.error('Failed to reopen ticket.');
    } finally {
      setReopenSubmitting(false);
    }
  }

  async function handleStartWork() {
    if (!ticket) return;
    setStartSubmitting(true);
    try {
      await startWork(ticket.id);
      toast.success('Marked as in progress.');
      invalidate(ticket.id);
    } catch {
      toast.error('Could not start this ticket. Please try again.');
      invalidate(ticket.id);
    } finally {
      setStartSubmitting(false);
    }
  }

  async function handleClaim() {
    if (!ticket) return;
    setClaimSubmitting(true);
    try {
      await claimTicket(ticket.id);
      toast.success('Ticket claimed — it is yours and now in progress.');
      invalidate(ticket.id);
    } catch {
      toast.error('Could not claim this ticket. It may already be assigned.');
      invalidate(ticket.id);
    } finally {
      setClaimSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] sm:w-[90vw] sm:max-w-[90vw] lg:w-[80vw] lg:max-w-6xl max-h-[95dvh] flex flex-col p-0 gap-0 overflow-hidden"
        aria-describedby={undefined}
      >
        {(!open || ticketId == null) ? null : loading ? (
          <TicketDetailSkeleton />
        ) : error || !ticket ? (
          <TicketNotFound onClose={onClose} />
        ) : (
          <>
            {/* ── Dialog header: what it is, how it stands, where it is in its life ── */}
            <DialogHeader className="px-4 sm:px-6 pt-4 pb-4 border-b shrink-0 text-left space-y-3">
              <div className="pr-8 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{ticket.ticket_no}</span>
                  <StatusBadge status={ticket.status} />
                  {ticket.priority && <PriorityBadge priority={ticket.priority} />}
                  {escalatedTo && (
                    <TokenPill token="--status-escalated">Escalated to {escalatedTo}</TokenPill>
                  )}
                </div>
                <DialogTitle className="mt-1.5 text-lg font-semibold leading-snug text-gray-900">
                  {ticket.service_item?.name ?? ticket.description ?? 'Untitled'}
                </DialogTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {ticket.trade?.name && <>{ticket.trade.name} · </>}
                  {ticket.location?.facility?.name ?? ticket.requester_campus?.name}
                  {' · '}opened {formatDateTime(ticket.created_at)}
                </p>
              </div>
              <TicketProgress status={ticket.status} className="max-w-xl" />
            </DialogHeader>

            {/* ── Action toolbar ─────────────────────────────────────────────── */}
            {(showClaim || showStartWork || showStatusUpdate || showAssign || showReassign || showConfirmResolved || showReopen) && (
              <div className="px-4 sm:px-6 py-3 border-b bg-muted/30 shrink-0 flex flex-wrap items-center justify-between gap-2">
                {/* Secondary actions — left */}
                <div className="flex items-center gap-2 flex-wrap">
                  {showReopen && (
                    <Button size="sm" variant="outline" onClick={() => setActiveModal('reopen')}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                      Reopen
                    </Button>
                  )}
                </div>

                {/* Primary actions — right, with background colors */}
                <div className="flex flex-wrap items-center gap-2">
                  {showClaim && (
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={handleClaim}
                      disabled={claimSubmitting}
                    >
                      <Hand className="h-3.5 w-3.5 mr-1.5" />
                      {claimSubmitting ? 'Claiming…' : 'Claim'}
                    </Button>
                  )}
                  {showAssign && (
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setActiveModal('assign')}>
                      <UserCheck className="h-3.5 w-3.5 mr-1.5" />
                      Assign
                    </Button>
                  )}
                  {showReassign && (
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setActiveModal('assign')}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      Reassign
                    </Button>
                  )}
                  {showStartWork && (
                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={handleStartWork}
                      disabled={startSubmitting}
                    >
                      <Play className="h-3.5 w-3.5 mr-1.5" />
                      {startSubmitting ? 'Starting…' : 'Start work'}
                    </Button>
                  )}
                  {showStatusUpdate && (
                    <Button size="sm" variant="outline" onClick={() => setActiveModal('status')}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      Update Status
                    </Button>
                  )}
                  {showConfirmResolved && (
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setActiveModal('rate')}>
                      <Star className="h-3.5 w-3.5 mr-1.5" />
                      Rate &amp; close
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* ── Scrollable body ────────────────────────────────────────────── */}
            <div className="flex-1 min-h-0 overflow-auto bg-gray-50/60 p-3 sm:p-6">
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-5 items-start">

                {/* Left column: the fault, its files, and what has happened */}
                <div className="space-y-5 min-w-0">
                  <Card>
                    <CardContent className="p-4 sm:p-5">
                      <SectionLabel>What&apos;s wrong</SectionLabel>
                      {ticket.description ? (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{ticket.description}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No description provided.</p>
                      )}

                      {/* Attachments — uploaded by the wizard after the ticket exists. */}
                      {attachments.length > 0 && (
                        <ul className="mt-4 grid gap-2 sm:grid-cols-2" aria-label="Attachments">
                          {attachments.map((att) => (
                            <li key={att.id}>
                              <a
                                href={att.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 rounded-md border bg-white px-3 py-2 hover:bg-accent/50"
                              >
                                {att.mime_type.startsWith('image/') ? (
                                  <img
                                    src={att.url}
                                    alt={att.original_name}
                                    loading="lazy"
                                    className="size-10 shrink-0 rounded object-cover"
                                  />
                                ) : (
                                  <FileText className="size-5 shrink-0 text-muted-foreground" />
                                )}
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-xs font-medium">{att.original_name}</span>
                                  <span className="block text-[10px] text-muted-foreground">
                                    {formatBytes(att.stored_size)}
                                  </span>
                                </span>
                                <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>

                  {/* Activity, and the comment thread beneath it. Staff read
                      and post; the raiser reads it only while the ticket is
                      pending or resolved, which is when the server serves it. */}
                  <Card>
                    <CardContent className="p-4 sm:p-5">
                      <SectionLabel>Activity</SectionLabel>
                      <TicketTimeline events={events} loading={timelineLoading} hideHeader />
                      {showComments && (
                        <div className="mt-6 pt-5 border-t">
                          {viewsAsRequester && (
                            <SectionLabel>Notes from the maintenance team</SectionLabel>
                          )}
                          <CommentThread
                            ticket={ticket}
                            hideHeader
                            readOnly={viewsAsRequester}
                            viewerRole={currentUser?.role ?? undefined}
                            viewerId={currentUser?.id}
                            onCommentAdded={() => invalidate(ticket.id)}
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Right column: what is happening now, then the facts */}
                <div className="space-y-4 min-w-0">

                  {/* Why the job is stopped. The label is resolved server-side. */}
                  {ticket.status === 'pending' && ticket.pending_reason_display && (
                    <Callout tone="--status-pending" icon={<PauseCircle className="h-4 w-4" />} title="On hold">
                      <p className="font-medium">{ticket.pending_reason_display}</p>
                      {ticket.pending_reason_note && (
                        <p className="mt-1 text-gray-700">{ticket.pending_reason_note}</p>
                      )}
                    </Callout>
                  )}

                  {/* What the technician said when they resolved it. */}
                  {resolutionNote && (
                    <Callout tone="--status-resolved" icon={<CheckCheck className="h-4 w-4" />} title="Resolution">
                      <p className="whitespace-pre-wrap">{resolutionNote}</p>
                    </Callout>
                  )}

                  {/* The requester's rating. Nested on the detail payload only. */}
                  {ticket.feedback && (
                    <Callout tone="--status-approval" icon={<Star className="h-4 w-4" />} title="Requester feedback">
                      <RatingStars rating={ticket.feedback.rating} comment={ticket.feedback.comment} />
                    </Callout>
                  )}

                  {/* `paused_at` is the server's own marker for a frozen clock. */}
                  {ticket.resolution_due_at && !['resolved', 'closed'].includes(ticket.status) && (
                    <Card>
                      <CardContent className="p-4">
                        <SectionLabel>Time to resolve</SectionLabel>
                        <SLACountdown
                          dueDate={ticket.resolution_due_at}
                          createdAt={ticket.created_at}
                          isPaused={!!ticket.paused_at}
                        />
                        <p className="text-xs text-muted-foreground mt-2">
                          Due {formatDateTime(ticket.resolution_due_at)}
                        </p>
                      </CardContent>
                    </Card>
                  )}


                  <Card>
                    <CardContent className="p-4 sm:p-5 space-y-4">
                      {ticket.service_item && (
                        <DetailGroup title="Service Request">
                          <DetailRow label="Trade" value={ticket.trade?.name ?? ticket.service_item.trade?.name} />
                          <DetailRow label="Service" value={ticket.service_item.name} />
                        </DetailGroup>
                      )}
                      <DetailGroup title="Ticket Information">
                        <DetailRow label="Campus" value={ticket.requester_campus?.name ?? '—'} />
                        <DetailRow
                          label="Raised by"
                          value={
                            typeof ticket.raised_by === 'string'
                              ? ticket.raised_by
                              : ticket.raised_by.full_name || ticket.raised_by.username
                          }
                        />
                        <DetailRow
                          label="Assigned to"
                          value={
                            ticket.assigned_to
                              ? ticket.assigned_to.full_name
                              : <span className="text-muted-foreground italic text-xs">Unassigned</span>
                          }
                        />
                        {ticket.contact_phone && (
                          <DetailRow
                            label="Contact"
                            value={
                              <a href={`tel:${ticket.contact_phone}`} className="text-primary hover:underline">
                                {formatPhoneLocal(ticket.contact_phone)}
                              </a>
                            }
                          />
                        )}
                        <DetailRow label="Opened" value={formatDateTime(ticket.created_at)} />
                        {ticket.resolution_due_at && (
                          <DetailRow
                            label="Fix by"
                            value={
                              <>
                                {formatDateTime(ticket.resolution_due_at)}
                                {ticket.sla_outcome && (
                                  <TokenPill
                                    token={SLA_OUTCOME[ticket.sla_outcome].token}
                                    className="ml-1.5 align-middle"
                                  >
                                    {SLA_OUTCOME[ticket.sla_outcome].label}
                                  </TokenPill>
                                )}
                              </>
                            }
                          />
                        )}
                        {ticket.resolved_at && (
                          <DetailRow label="Resolved" value={formatDateTime(ticket.resolved_at)} />
                        )}
                      </DetailGroup>
                      {ticket.location && (
                        <DetailGroup title="Location Details">
                          <DetailRow label="Facility type" value={ticket.location.facility_type?.name} />
                          <DetailRow label="Facility" value={ticket.location.facility?.name} />
                          <DetailRow label="Where" value={ticket.location.detail} />
                        </DetailGroup>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>

            {/* ── Sub-modals (portal to document.body, above this dialog) ──── */}

            <StatusUpdateModal
              ticket={ticket}
              open={activeModal === 'status'}
              onClose={() => setActiveModal(null)}
              onSuccess={onModalSuccess}
            />

            <AssignmentModal
              ticket={ticket}
              open={activeModal === 'assign'}
              onClose={() => setActiveModal(null)}
              onSuccess={onModalSuccess}
              mode={showReassign && ticket.assigned_to != null ? 'reassign' : 'assign'}
            />

            {activeModal === 'rate' && (
              <RatingModal
                ticket={ticket}
                open
                onClose={() => setActiveModal(null)}
                onSuccess={onModalSuccess}
                resolutionNote={resolutionNote}
              />
            )}

            <ConfirmDialog
              open={activeModal === 'reopen'}
              onOpenChange={(v) => !v && setActiveModal(null)}
              title="Reopen ticket"
              description="This will return the ticket to the open queue. The technician will need to be reassigned."
              confirmLabel="Reopen"
              onConfirm={handleReopen}
              loading={reopenSubmitting}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
