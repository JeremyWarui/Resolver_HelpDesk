import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  UserCheck, RefreshCw, AlertCircle,
  RotateCcw, Star, Hand, CheckCheck, Play, Paperclip, FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/shared/ticket/StatusBadge';
import { PriorityBadge } from '@/components/shared/ticket/PriorityBadge';
import { SLACountdown } from '@/components/shared/ticket/SLACountdown';
import { TicketTimeline } from '@/components/shared/ticket/TicketTimeline';
import CommentThread from '@/components/shared/ticket/CommentThread';
import { StatusUpdateModal } from '@/features/technician/StatusUpdateModal';
import { AssignmentModal } from '@/features/shared/AssignmentModal';
import { RatingModal } from '@/features/user/RatingModal';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { useTicketAttachments, useTicketDetail, useTicketInvalidate, useTicketTimeline } from '@/hooks/tickets/useTicketDetail';
import { usePermissions } from '@/lib/auth/permissions';
import { useAuthStore } from '@/stores/authStore';
import { claimTicket, reopenTicket, updateTicketStatus } from '@/lib/api/tickets';
import { RatingStars } from '@/components/shared/ticket/RatingWidget';
import { formatDate, formatDateTime } from '@/utils/date';
import { formatPhoneLocal } from '@/utils/phone';
import { formatBytes } from '@/utils/format';
import { ROLE_LABELS } from '@/constants/roles';
import type { Ticket, UserRole } from '@/types';

type ActiveModal = 'status' | 'assign' | 'rate' | 'reopen' | null;

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
      {children}
    </p>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <div className="px-4 py-3 flex items-center justify-between gap-4">
      <span className="text-sm font-medium text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm text-foreground text-right">{value}</span>
    </div>
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

  // The resolution note is prose and has no column on the ticket, so it is read
  // off the timeline. The hold reason is a column and is read from there.
  const resolutionNote = useMemo(() => {
    if (!ticket || !['resolved', 'closed'].includes(ticket.status)) return null;
    const ev = [...events].reverse().find((e) => e.event_type === 'resolved');
    return ev?.note ?? null;
  }, [ticket, events]);

  // A technician claims an unassigned open ticket in their own (campus, trade)
  // pairs. They can only reach an out-of-scope ticket as its requester, so
  // excluding their own leaves exactly the claimable queue.
  const showClaim =
    currentUser?.role === 'technician' &&
    ticket != null &&
    ticket.status === 'open' &&
    ticket.assigned_to == null &&
    !isRaisedByCurrentUser;

  // "Start work" — the assignee leaving `assigned`. Its own button rather than
  // a trip through the status modal, because the modal insists on a progress
  // note and there is nothing to say yet beyond "I have begun". The dwell in
  // `assigned` is what the response-time SLA measures, so it stays a real
  // resting state — this just makes leaving it one tap.
  const showStartWork =
    ticket != null &&
    ticket.status === 'assigned' &&
    ticket.assigned_to?.id === currentUser?.id;

  const showStatusUpdate =
    permissions.canUpdateTicketStatus &&
    ticket != null &&
    ['assigned', 'in_progress', 'pending'].includes(ticket.status);

  const showAssign =
    permissions.canAssignTicket && ticket?.status === 'open';

  const showReassign =
    permissions.canReassignTicket &&
    ticket != null &&
    ['assigned', 'in_progress'].includes(ticket.status) &&
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
      await updateTicketStatus(ticket.id, 'in_progress', 'Started work');
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
        className="w-[65vw] max-w-[65vw] sm:max-w-[65vw] min-w-[640px] flex flex-col p-0 gap-0"
        aria-describedby={undefined}
      >
        {(!open || ticketId == null) ? null : loading ? (
          <TicketDetailSkeleton />
        ) : error || !ticket ? (
          <TicketNotFound onClose={onClose} />
        ) : (
          <>
            {/* ── Dialog header ──────────────────────────────────────────────── */}
            <DialogHeader className="px-6 py-4 border-b shrink-0">
              <div className="flex items-center gap-2 flex-wrap pr-8 min-w-0">
                <DialogTitle asChild>
                  <span className="font-bold text-sm text-muted-foreground shrink-0">{ticket.ticket_no}</span>
                </DialogTitle>
                <span className="text-muted-foreground shrink-0">:</span>
                <span className="font-semibold text-sm min-w-0 truncate">
                  {ticket.service_item?.name ?? ticket.description ?? 'Untitled'}
                </span>
                <span className="text-muted-foreground shrink-0 mx-0.5">—</span>
                <StatusBadge status={ticket.status} className="shrink-0" />
                {ticket.priority && <PriorityBadge priority={ticket.priority} className="shrink-0" />}
              </div>
            </DialogHeader>

            {/* ── Action toolbar ─────────────────────────────────────────────── */}
            {(showClaim || showStartWork || showStatusUpdate || showAssign || showReassign || showConfirmResolved || showReopen) && (
              <div className="px-6 py-3 border-b bg-muted/30 shrink-0 flex items-center justify-between gap-2">
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
                <div className="flex items-center gap-2 shrink-0">
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
            <div className="flex-1 overflow-auto p-6 min-h-[68vh] max-h-[72vh]">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left column — 2/3 */}
                <div className="lg:col-span-2 space-y-5">

                  {/* Description */}
                  <Card>
                    <CardContent className="p-5">
                      <SectionLabel>Description</SectionLabel>
                      {ticket.description ? (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {ticket.description}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No description provided.</p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Attachments — uploaded by the wizard after the ticket exists.
                      Absent on most tickets, so the card only appears when there
                      is something to show. */}
                  {attachments.length > 0 && (
                    <Card>
                      <CardContent className="p-5">
                        <SectionLabel>Attachments</SectionLabel>
                        <ul className="grid gap-2 sm:grid-cols-2">
                          {attachments.map((att) => (
                            <li key={att.id}>
                              <a
                                href={att.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 rounded-md border px-3 py-2 hover:bg-accent/50"
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
                                  <span className="block truncate text-xs font-medium">
                                    {att.original_name}
                                  </span>
                                  <span className="block text-[10px] text-muted-foreground">
                                    {formatBytes(att.stored_size)}
                                  </span>
                                </span>
                                <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                              </a>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  )}

                  {/* Activity, and the staff comment thread beneath it.
                      The raiser gets the Activity trail only: comments are the
                      staff working log and the server refuses them the thread,
                      so rendering it would show them an error where the
                      timeline already tells them what happened. */}
                  <Card>
                    <CardContent className="p-5">
                      <SectionLabel>Activity</SectionLabel>
                      <TicketTimeline events={events} loading={timelineLoading} hideHeader />
                      {!isRaisedByCurrentUser && currentUser?.role !== 'manager' && (
                        <div className="mt-6 pt-5 border-t">
                          <CommentThread
                            ticket={ticket}
                            hideHeader
                            viewerRole={currentUser?.role ?? undefined}
                            viewerId={currentUser?.id}
                            onCommentAdded={() => invalidate(ticket.id)}
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Right column — 1/3 */}
                <div className="space-y-5">

                  {/* Details */}
                  <Card>
                    <CardContent className="p-5 space-y-4">
                      {ticket.service_item && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Service Request</p>
                          <div className="border rounded-lg divide-y">
                            <DetailRow label="Trade" value={ticket.trade?.name ?? ticket.service_item.trade?.name} />
                            <DetailRow label="Service" value={ticket.service_item.name} />
                          </div>
                        </div>
                      )}
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ticket Information</p>
                        <div className="border rounded-lg divide-y">
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
                          {ticket.resolved_at && (
                            <DetailRow label="Resolved" value={formatDate(ticket.resolved_at)} />
                          )}
                        </div>
                      </div>

                      {ticket.location && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Location Details</p>
                          <div className="border rounded-lg divide-y">
                            {ticket.location.facility_type?.name && (
                              <DetailRow label="Facility type" value={ticket.location.facility_type.name} />
                            )}
                            {ticket.location.facility?.name && (
                              <DetailRow label="Facility" value={ticket.location.facility.name} />
                            )}
                            {Object.entries(ticket.location.values ?? {}).map(([k, v]) => (
                              <DetailRow
                                key={k}
                                label={k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                                value={String(v)}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* `paused_at` is the server's own marker for a frozen clock —
                      the same fact the ticket table reads, rather than a second
                      derivation of it from the status. */}
                  {ticket.resolution_due_at && (
                    <Card>
                      <CardContent className="p-5">
                        <SectionLabel>SLA</SectionLabel>
                        <SLACountdown
                          dueDate={ticket.resolution_due_at}
                          createdAt={ticket.created_at}
                          isPaused={!!ticket.paused_at}
                        />
                        <p className="text-xs text-muted-foreground mt-2">
                          Due: {formatDate(ticket.resolution_due_at)}
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  {/* How far the ticket has climbed. Server-owned: escalation is
                      structural, not a workflow anyone configures. */}
                  {ticket.current_level && ticket.current_level !== 'technician' && (
                    <Card style={{ borderColor: 'var(--status-escalated-border)' }}>
                      <CardContent className="p-5">
                        <SectionLabel>Escalation</SectionLabel>
                        <div className="space-y-1.5 text-sm">
                          <p>
                            <span className="text-muted-foreground">Currently with: </span>
                            <span className="font-semibold" style={{ color: 'var(--status-escalated-text)' }}>
                              {ROLE_LABELS[ticket.current_level as UserRole] ?? ticket.current_level}
                            </span>
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Why the job is stopped, read straight off the ticket. The
                      label is resolved server-side, so no vocabulary lives
                      here. Amber for a waiting state. */}
                  {ticket.status === 'pending' && ticket.pending_reason_display && (
                    <Card style={{ borderColor: 'var(--status-approval-border)' }}>
                      <CardContent className="p-5">
                        <SectionLabel>On Hold</SectionLabel>
                        <p className="text-sm font-medium" style={{ color: 'var(--status-approval-text)' }}>
                          {ticket.pending_reason_display}
                        </p>
                        {ticket.pending_reason_note && (
                          <p className="mt-1.5 text-sm text-muted-foreground">
                            {ticket.pending_reason_note}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* What the technician said when they resolved it. */}
                  {resolutionNote && (
                    <Card style={{ borderColor: 'var(--status-resolved-border, var(--status-resolved))' }}>
                      <CardContent className="p-5">
                        <SectionLabel>Resolution</SectionLabel>
                        <div className="flex items-start gap-2">
                          <CheckCheck className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--status-resolved)' }} />
                          <p className="text-sm whitespace-pre-wrap">{resolutionNote}</p>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* The requester's rating. Nested on the detail payload only —
                      a list row carries `has_feedback` instead. */}
                  {ticket.feedback && (
                    <Card>
                      <CardContent className="p-5">
                        <SectionLabel>Requester Feedback</SectionLabel>
                        <RatingStars rating={ticket.feedback.rating} comment={ticket.feedback.comment} />
                      </CardContent>
                    </Card>
                  )}
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
