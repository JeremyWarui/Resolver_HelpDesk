import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  UserCheck, RefreshCw, AlertCircle,
  RotateCcw, Star, Hand, CheckCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/shared/ticket/StatusBadge';
import { PriorityBadge } from '@/components/shared/ticket/PriorityBadge';
import { SLACountdown } from '@/components/shared/ticket/SLACountdown';
import { TicketTimeline } from '@/components/shared/ticket/TicketTimeline';
import { CommentThread } from '@/components/shared/ticket/CommentThread';
import { StatusUpdateModal } from '@/features/technician/StatusUpdateModal';
import { AssignmentModal } from '@/features/hos/AssignmentModal';
import { EscalationModal } from '@/features/tickets/EscalationModal';
import { RatingModal } from '@/features/user/RatingModal';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { useTicketDetail, useTicketTimeline, useTicketInvalidate } from '@/hooks/tickets/useTicketDetail';
import { usePermissions } from '@/lib/auth/roleContext';
import { useAuthStore } from '@/stores/authStore';
import { joinChannel, leaveChannel } from '@/lib/ws/wsClient';
import { claimTicket, reopenTicket } from '@/lib/api/tickets';
import { RatingStars } from '@/components/shared/ticket/RatingWidget';
import { formatDate, formatDateTime } from '@/utils/date';
import { formatSectionDisplay } from '@/utils/formatSection';
import type { Ticket } from '@/types';

type ActiveModal = 'status' | 'assign' | 'escalate' | 'rate' | 'reopen' | null;

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

function ReopenConfirm({
  open, onClose, onConfirm, submitting,
}: { open: boolean; onClose: () => void; onConfirm: () => void; submitting: boolean }) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Reopen ticket"
      description="This will return the ticket to the open queue. The technician will need to be reassigned."
      confirmLabel="Reopen"
      onConfirm={onConfirm}
      loading={submitting}
    />
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

  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [reopenSubmitting, setReopenSubmitting] = useState(false);
  const [claimSubmitting, setClaimSubmitting] = useState(false);

  useEffect(() => {
    if (ticketId == null) return;
    const channel = `ticket_${ticketId}`;
    joinChannel(channel);
    return () => leaveChannel(channel);
  }, [ticketId]);

  const isRaisedByCurrentUser = ticket?.raised_by_id === currentUser?.id;

  // Captured-but-hidden dialog data (QA D1/D2) — both travel as TicketLog.reason
  // and are already in the fetched timeline; no extra endpoint needed.
  const pendingReason = useMemo(() => {
    if (ticket?.status !== 'pending') return null;
    const ev = [...events].reverse().find(
      (e) => e.event_type === 'status_changed' && e.data?.to === 'pending',
    );
    return ev?.note ?? null;
  }, [ticket?.status, events]);

  const resolutionNote = useMemo(() => {
    if (!ticket || !['resolved', 'closed'].includes(ticket.status)) return null;
    const ev = [...events].reverse().find((e) => e.event_type === 'resolved');
    return ev?.note ?? null;
  }, [ticket, events]);

  // Claim (B2a): technician self-assigns an unassigned open section ticket.
  // A technician can only reach an out-of-section ticket as its requester, so
  // excluding own-raised tickets leaves exactly the claimable section queue.
  const showClaim =
    currentUser?.role === 'technician' &&
    ticket != null &&
    ticket.status === 'open' &&
    ticket.assigned_to == null &&
    !isRaisedByCurrentUser;

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

  const showEscalate =
    permissions.canEscalate &&
    ticket != null &&
    ['assigned', 'in_progress', 'pending'].includes(ticket.status);

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

  async function handleClaim() {
    if (!ticket) return;
    setClaimSubmitting(true);
    try {
      await claimTicket(ticket.id);
      toast.success('Ticket claimed — it is now assigned to you.');
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
            {(showClaim || showStatusUpdate || showAssign || showReassign || showEscalate || showConfirmResolved || showReopen) && (
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
                  {showStatusUpdate && (
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setActiveModal('status')}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      Update Status
                    </Button>
                  )}
                  {showEscalate && (
                    <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white" onClick={() => setActiveModal('escalate')}>
                      <AlertCircle className="h-3.5 w-3.5 mr-1.5" />
                      Escalate
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

                  {/* Activity + Comments merged */}
                  <Card>
                    <CardContent className="p-5">
                      <SectionLabel>Activity</SectionLabel>
                      <TicketTimeline events={events} loading={timelineLoading} hideHeader />
                      <div className="mt-6 pt-5 border-t">
                        <CommentThread
                          ticket={ticket}
                          hideHeader
                          viewerRole={currentUser?.role ?? undefined}
                          viewerId={currentUser?.id}
                          onCommentAdded={() => invalidate(ticket.id)}
                        />
                      </div>
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
                            <DetailRow label="Category" value={ticket.service_item.category_name} />
                            <DetailRow label="Service" value={ticket.service_item.name} />
                          </div>
                        </div>
                      )}
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ticket Information</p>
                        <div className="border rounded-lg divide-y">
                          {ticket.section?.department_code && (
                            <DetailRow label="Department" value={ticket.section.department_code} />
                          )}
                          <DetailRow label="Section" value={formatSectionDisplay(ticket.section)} />
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
                                ? (ticket.assigned_to.full_name || ticket.assigned_to.name || ticket.assigned_to.username)
                                : <span className="text-muted-foreground italic text-xs">Unassigned</span>
                            }
                          />
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

                  {/* SLA — use resolution_due_at; pause when status=pending (R9) */}
                  {ticket.resolution_due_at && (
                    <Card>
                      <CardContent className="p-5">
                        <SectionLabel>SLA</SectionLabel>
                        <SLACountdown
                          dueDate={ticket.resolution_due_at}
                          createdAt={ticket.created_at}
                          isPaused={ticket.status === 'pending'}
                        />
                        <p className="text-xs text-muted-foreground mt-2">
                          Due: {formatDate(ticket.resolution_due_at)}
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  {/* Escalation level (current_level axis — server-owned, R7/R10) */}
                  {ticket.current_level && ticket.current_level !== 'technician' && (
                    <Card style={{ borderColor: 'var(--status-escalated-border)' }}>
                      <CardContent className="p-5">
                        <SectionLabel>Escalation</SectionLabel>
                        <div className="space-y-1.5 text-sm">
                          <p>
                            <span className="text-muted-foreground">Currently with: </span>
                            <span className="font-semibold uppercase" style={{ color: 'var(--status-escalated-text)' }}>
                              {ticket.current_level}
                            </span>
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Pending reason (D1) — derived from the latest pending transition
                      in the timeline (the reason lands in TicketLog, not on Ticket).
                      Uses status-approval (amber) tokens for paused/waiting state. */}
                  {ticket.status === 'pending' && pendingReason && (
                    <Card style={{ borderColor: 'var(--status-approval-border)' }}>
                      <CardContent className="p-5">
                        <SectionLabel>On Hold</SectionLabel>
                        <p className="text-sm capitalize" style={{ color: 'var(--status-approval-text)' }}>
                          {pendingReason.replace(/_/g, ' ')}
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  {/* Resolution note (D2) — the resolved event's reason. */}
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

                  {/* Submitted rating (D3) — nested feedback from the detail API. */}
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

            <EscalationModal
              ticket={ticket}
              open={activeModal === 'escalate'}
              onClose={() => setActiveModal(null)}
              onSuccess={onModalSuccess}
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

            <ReopenConfirm
              open={activeModal === 'reopen'}
              onClose={() => setActiveModal(null)}
              onConfirm={handleReopen}
              submitting={reopenSubmitting}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default TicketDetailPage;
