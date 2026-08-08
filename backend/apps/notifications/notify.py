"""In-app notification emitters.

One function per domain event, called from the ticket services. Each persists
`Notification` rows for the users who should hear about it; the frontend polls
`/notifications/`. Every emitter swallows its own errors — a notification must
never be the reason a ticket update fails.

WebSockets are deferred, not removed: a maintenance helpdesk runs on a
minutes-to-hours cadence, and live delivery would force ASGI plus Redis into
the deploy for a low-volume single-department app. Re-adding it means giving
these functions a second sink, not restructuring them.
"""

import logging

logger = logging.getLogger(__name__)


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


def _hos_user_ids(section_id) -> list[int]:
    """User IDs of the HOS role-holders for a section."""
    try:
        from apps.accounts.models import RoleAssignment

        return list(
            RoleAssignment.objects.filter(
                role="hos", section_id=section_id
            ).values_list("user_id", flat=True)
        )
    except Exception:
        return []


def _hod_user_ids(cd_id) -> list[int]:
    """User IDs of the HOD role-holders for a campus-department."""
    if not cd_id:
        return []
    try:
        from apps.accounts.models import RoleAssignment

        return list(
            RoleAssignment.objects.filter(
                role="hod", campus_department_id=cd_id
            ).values_list("user_id", flat=True)
        )
    except Exception:
        return []


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


def emit_ticket_created(ticket) -> None:
    cd_id = _campus_department_id(ticket)

    recipients = _hos_user_ids(ticket.section_id) + _hod_user_ids(cd_id)
    _notify_users(
        recipients,
        "ticket_created",
        "New ticket raised",
        f"Ticket #{ticket.ticket_no} has been submitted in your section.",
        ticket,
    )


def emit_ticket_assigned(ticket, previous_assignee=None) -> None:
    assignee = ticket.assigned_to
    assignee_name = (
        (assignee.get_full_name() or assignee.username) if assignee else None
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


def emit_ticket_status_changed(ticket, from_status: str) -> None:
    _notify_users(
        [ticket.raised_by_id],
        "ticket_status_changed",
        "Ticket updated",
        f"Ticket #{ticket.ticket_no} status changed to {ticket.status.replace('_', ' ')}.",
        ticket,
    )


def emit_ticket_resolved(ticket) -> None:
    _notify_users(
        [ticket.raised_by_id],
        "ticket_resolved",
        "Your ticket has been resolved",
        f"Ticket #{ticket.ticket_no} has been resolved. Please rate your experience.",
        ticket,
    )


def emit_comment_added(ticket, comment) -> None:
    author = comment.author
    payload = {
        "ticketId": ticket.id,
        "commentId": comment.id,
        "authorName": (author.get_full_name() or author.username) if author else "",
        "preview": (comment.body or "")[:100],
    }
    emit_ws_event(f"user_{ticket.raised_by_id}", "comment_added", payload)

    if author and author.id != ticket.raised_by_id:
        _notify_users(
            [ticket.raised_by_id],
            "comment_added",
            "New comment on your ticket",
            f"{payload['authorName']} commented on #{ticket.ticket_no}: {payload['preview']}",
            ticket,
        )


def emit_ticket_escalated(ticket) -> None:
    cd_id = _campus_department_id(ticket)

    recipients = _hod_user_ids(cd_id) + _hos_user_ids(ticket.section_id)
    _notify_users(
        recipients,
        "ticket_escalated",
        "Ticket escalated",
        f"Ticket #{ticket.ticket_no} has been escalated to {ticket.current_level.upper()}.",
        ticket,
    )

