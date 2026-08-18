"""In-app notification emitters.

One function per domain event, called from the ticket services. Each persists
`Notification` rows for the users who should hear about it; the frontend polls
`/notifications/` on a one-minute interval and on window focus.

Every emitter is wrapped in `@_never_fails` (see its docstring). These rows are
the courtesy; the ticket is the work.

WebSockets are deferred, not removed: a maintenance helpdesk runs on a
minutes-to-hours cadence, and live delivery would force ASGI plus Redis into
the deploy for a low-volume single-department app. Re-adding it means giving
these functions a second sink, not restructuring them.
"""

import functools
import logging
from apps.accounts.identity import display_name

logger = logging.getLogger(__name__)


def _never_fails(emit):
    """A notification must never be the reason a ticket update fails.

    The guarantee has to live at the emitter boundary, not only inside the bulk
    insert: these functions also read related objects and format names, and any
    of that can raise on data the caller never anticipated. Without this the
    promise held for a database error and broke for an attribute error.
    """

    @functools.wraps(emit)
    def guarded(*args, **kwargs):
        try:
            return emit(*args, **kwargs)
        except Exception as exc:
            logger.warning("%s failed: %s", emit.__name__, exc, exc_info=True)

    return guarded


# ── Scope helpers ─────────────────────────────────────────────────────────────


def _campus_department_id(ticket) -> int | None:
    """Return the campus_department_id for a ticket's section — one targeted query."""
    try:
        from apps.org.models import Section

        return Section.objects.values_list("campus_department_id", flat=True).get(
            pk=ticket.section_id
        )
    except Exception:
        return None


def _role_holder_ids(role, **scope) -> list[int]:
    """User IDs of the role-holders at a given scope — [] if the scope is unset.

    Swallows its own errors for the same reason `_never_fails` exists: a
    recipient lookup must not be what breaks the ticket update.
    """
    if any(v is None for v in scope.values()):
        return []
    try:
        from apps.accounts.models import RoleAssignment

        return list(
            RoleAssignment.objects.filter(role=role, **scope).values_list(
                "user_id", flat=True
            )
        )
    except Exception:
        return []


def _supervisor_ids(ticket) -> list[int]:
    """The HOS and HOD who should hear about this ticket. Order is immaterial —
    `_notify_users` de-duplicates."""
    return _role_holder_ids("hos", section_id=ticket.section_id) + _role_holder_ids(
        "hod", campus_department_id=_campus_department_id(ticket)
    )


# ── DB notification helper ────────────────────────────────────────────────────


def _notify_users(
    user_ids: list[int],
    event_type: str,
    title: str,
    body: str,
    ticket=None,
) -> None:
    """Persist in-app notifications for a list of users (bulk insert, no-op on error)."""
    if not user_ids:
        return
    try:
        from apps.notifications.models import Notification

        Notification.objects.bulk_create(
            [
                Notification(
                    user_id=uid,
                    event_type=event_type,
                    title=title,
                    body=body,
                    ticket=ticket,
                    ticket_no=ticket.ticket_no if ticket else "",
                )
                for uid in set(user_ids)
            ]
        )
    except Exception as exc:
        logger.warning("_notify_users failed: %s", exc)


# ── Public emit functions ─────────────────────────────────────────────────────


@_never_fails
def emit_ticket_created(ticket) -> None:
    recipients = _supervisor_ids(ticket)
    _notify_users(
        recipients,
        "ticket_created",
        "New ticket raised",
        f"Ticket #{ticket.ticket_no} has been submitted in your section.",
        ticket,
    )


@_never_fails
def emit_ticket_assigned(ticket, previous_assignee=None) -> None:
    assignee = ticket.assigned_to
    assignee_name = (
        display_name(assignee) if assignee else None
    )
    is_reassignment = previous_assignee is not None
    if assignee:
        title = (
            "Ticket reassigned to you" if is_reassignment else "Ticket assigned to you"
        )
        _notify_users(
            [assignee.id],
            "ticket_assigned",
            title,
            f"Ticket #{ticket.ticket_no} has been assigned to you.",
            ticket,
        )

    if is_reassignment and previous_assignee:
        prev_name = assignee_name or "another technician"
        _notify_users(
            [previous_assignee.id],
            "ticket_assigned",
            "Ticket reassigned",
            f"Ticket #{ticket.ticket_no} has been reassigned to {prev_name}.",
            ticket,
        )

    requester_title = "Ticket reassigned" if is_reassignment else "Ticket assigned"
    requester_body = (
        f"Ticket #{ticket.ticket_no} has been reassigned to {assignee_name or 'a technician'}."
        if is_reassignment
        else f"Ticket #{ticket.ticket_no} has been assigned to {assignee_name or 'a technician'}."
    )
    _notify_users(
        [ticket.raised_by_id],
        "ticket_assigned",
        requester_title,
        requester_body,
        ticket,
    )


@_never_fails
def emit_ticket_status_changed(ticket, from_status: str) -> None:
    _notify_users(
        [ticket.raised_by_id],
        "ticket_status_changed",
        "Ticket updated",
        f"Ticket #{ticket.ticket_no} status changed to {ticket.status.replace('_', ' ')}.",
        ticket,
    )


@_never_fails
def emit_ticket_resolved(ticket) -> None:
    _notify_users(
        [ticket.raised_by_id],
        "ticket_resolved",
        "Your ticket has been resolved",
        f"Ticket #{ticket.ticket_no} has been resolved. Please rate your experience.",
        ticket,
    )


@_never_fails
def emit_comment_added(ticket, comment) -> None:
    author = comment.author
    if author and author.id != ticket.raised_by_id:
        author_name = display_name(author)
        preview = (comment.body or "")[:100]
        _notify_users(
            [ticket.raised_by_id],
            "comment_added",
            "New comment on your ticket",
            f"{author_name} commented on #{ticket.ticket_no}: {preview}",
            ticket,
        )


@_never_fails
def emit_sla_breach(ticket) -> None:
    """A ticket has passed its resolution deadline.

    Goes to the supervisors, not the technician: by the time this fires the
    deadline is already gone, and the decision it calls for — reassign, chase,
    reprioritise — is theirs. The assignee already sees the ticket turn red.
    """
    recipients = _supervisor_ids(ticket)
    _notify_users(
        recipients,
        "sla_breach",
        "SLA breached",
        f"Ticket #{ticket.ticket_no} has passed its resolution deadline.",
        ticket,
    )


@_never_fails
def emit_ticket_escalated(ticket, holder=None) -> None:
    """Tell the two people an escalation actually concerns.

    `holder` is the post the ticket escalated TO, resolved structurally by
    `sla.services.escalation.resolve_active_holder` — the same user the
    TicketLog records as `level_user`. It is passed in rather than looked up
    again here because the structural FK and RoleAssignment can disagree, and
    notifying a different person than the one the ticket was handed to is how
    an escalation goes unanswered.

    The assignee is told separately: the ticket is leaving their level, and
    they are the one who has to act on that.
    """
    level = ticket.current_level.upper()

    if holder is not None:
        _notify_users(
            [holder.pk],
            "ticket_escalated",
            "Ticket escalated to you",
            f"Ticket #{ticket.ticket_no} has been escalated to you as {level}.",
            ticket,
        )

    # Never notify the assignee twice — a technician who also holds the post
    # the ticket escalated to has already had the message above.
    if ticket.assigned_to_id and (holder is None or ticket.assigned_to_id != holder.pk):
        _notify_users(
            [ticket.assigned_to_id],
            "ticket_escalated",
            "Your ticket was escalated",
            f"Ticket #{ticket.ticket_no}, assigned to you, has been escalated to {level}.",
            ticket,
        )

