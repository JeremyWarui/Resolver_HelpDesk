"""In-app notifications: one message per thing that happened to a ticket.

A message names who acted and what they did, and carries what they typed,
when they typed something, to the people it was written for. One action sends
one message to each recipient, and nobody is told about their own action.

Every emitter is wrapped in `@_never_fails`: these rows are the courtesy, the
ticket is the work. The frontend polls `/notifications/`; nothing is pushed.
"""

import functools
import logging

from apps.accounts.identity import display_name
from apps.tickets.constants import REQUESTER_COMMENT_STATUSES

logger = logging.getLogger(__name__)


def _never_fails(emit):
    """A notification must never be the reason a ticket update fails.

    The guarantee has to live at the emitter boundary, not only inside the bulk
    insert: these functions also read related objects and format names, and any
    of that can raise on data the caller never anticipated.
    """

    @functools.wraps(emit)
    def guarded(*args, **kwargs):
        try:
            return emit(*args, **kwargs)
        except Exception as exc:
            logger.warning("%s failed: %s", emit.__name__, exc, exc_info=True)

    return guarded


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
            RoleAssignment.objects.filter(role=role, user__is_active=True, **scope).values_list(
                "user_id", flat=True
            )
        )
    except Exception:
        return []


def _hos_ids(ticket) -> list[int]:
    """The head of section at the ticket's campus."""
    return _role_holder_ids("hos", campus_id=ticket.requester_campus_id)


def _supervisor_ids(ticket) -> list[int]:
    """The HOS and HOD at the ticket's campus."""
    return _hos_ids(ticket) + _role_holder_ids("hod", campus_id=ticket.requester_campus_id)


def _service(ticket) -> str:
    """What the ticket is about, as a reader names it."""
    item = getattr(ticket, "service_item", None)
    return item.name if item else f"ticket #{ticket.ticket_no}"


def _name(user, fallback="Someone") -> str:
    return display_name(user) or fallback


def _clip(text: str, limit: int) -> str:
    """Fit a column, ending on a whole word with an ellipsis when cut."""
    if len(text) <= limit:
        return text
    cut = text[: limit - 1].rsplit(" ", 1)[0].rstrip(" ·,")
    return f"{cut}…"


def _notify_users(
    user_ids,
    event_type: str,
    title: str,
    body: str,
    ticket=None,
    actor=None,
    note: str = "",
) -> None:
    """Write one message per recipient, never to the actor (bulk insert, no-op on error)."""
    actor_id = getattr(actor, "pk", None)
    recipients = {uid for uid in user_ids if uid and uid != actor_id}
    if not recipients:
        return
    try:
        from django.db import transaction

        from apps.notifications.models import Notification

        rows = [
            Notification(
                user_id=uid,
                event_type=event_type,
                title=_clip(title, 128),
                body=_clip(body, 256),
                ticket=ticket,
                actor=actor,
                note=(note or "").strip(),
            )
            for uid in recipients
        ]
        # A savepoint: a failed insert must not abort the caller's transaction.
        with transaction.atomic():
            Notification.objects.bulk_create(rows)
    except Exception as exc:
        logger.warning("_notify_users failed: %s", exc)


@_never_fails
def emit_ticket_created(ticket, actor=None) -> None:
    """The campus's supervisors hear of every new request."""
    raiser = actor or ticket.raised_by
    facility = getattr(ticket.facility, "name", None) if ticket.facility_id else None
    _notify_users(
        _supervisor_ids(ticket),
        "ticket_created",
        f"New request: {_service(ticket)}",
        f"{_name(raiser)} reported it"
        + (f" at {facility}" if facility else "")
        + f" · #{ticket.ticket_no}",
        ticket,
        actor=raiser,
    )


@_never_fails
def emit_ticket_assigned(ticket, actor, previous_assignee=None, note="", claimed=False) -> None:
    """Who has the job now, as one message to each person concerned.

    The technician hears the HOS's handover note; the previous technician and
    the requester hear only who has it. A person in two of those places hears
    once, as the first. Handing the job to the technician who already has it
    is no news, so only a note, if there is one, goes to them.
    """
    assignee = ticket.assigned_to
    service = _service(ticket)
    assignee_name = _name(assignee, "a technician")
    no = f"#{ticket.ticket_no}"
    same_hands = (
        previous_assignee is not None and assignee is not None
        and previous_assignee.pk == assignee.pk
    )

    messages = []  # (user_id, title, body, note), first one per person wins
    if assignee is not None and not (same_hands and not note):
        if same_hands:
            title = f"{_name(actor)} sent you a note on {service}"
        else:
            verb = "reassigned" if previous_assignee is not None else "assigned"
            title = f"{_name(actor)} {verb} you {service}"
        messages.append((assignee.pk, title, no, note))
    if not same_hands:
        if previous_assignee is not None:
            messages.append(
                (previous_assignee.pk, f"{service} was reassigned",
                 f"{assignee_name} has it now · {no}", "")
            )
        if claimed:
            title = f"{assignee_name} has started on your request"
        elif previous_assignee is not None:
            title = f"{assignee_name} is now handling your request"
        else:
            title = f"{assignee_name} will handle your request"
        messages.append((ticket.raised_by_id, title, f"{service} · {no}", ""))

    told = set()
    for uid, title, body, text in messages:
        if uid in told:
            continue
        told.add(uid)
        _notify_users([uid], "ticket_assigned", title, body, ticket, actor=actor, note=text)


@_never_fails
def emit_ticket_status_changed(
    ticket, actor, old_status, new_status=None, note="", hold_reason="", previous_assignee_id=None
) -> None:
    """A move the people waiting on the ticket need to hear about, with its note.

    Work starting or resuming goes to the requester; a hold and its reason go
    to the requester and the HOS, and so does a resume; a reopen goes to the
    HOS, who must assign it again, and to the technician who had it. A ticket
    closed by its requester's rating tells nobody: they did it.

    `new_status` defaults to the ticket's; the seed passes it, replaying a
    history on a ticket already at its final status.
    """
    service = _service(ticket)
    who = _name(actor)
    no = f"#{ticket.ticket_no}"
    status = new_status or ticket.status

    if status == "in_progress":
        resumed = old_status == "pending"
        recipients = [ticket.raised_by_id] + (_hos_ids(ticket) if resumed else [])
        _notify_users(
            recipients,
            "ticket_status_changed",
            f"{who} {'resumed' if resumed else 'started'} work on {service}",
            no,
            ticket,
            actor=actor,
            note=note,
        )
    elif status == "pending":
        changed = old_status == "pending"
        _notify_users(
            [ticket.raised_by_id] + _hos_ids(ticket),
            "ticket_status_changed",
            f"{who} changed the hold reason on {service}" if changed else f"{who} put {service} on hold",
            f"{hold_reason} · {no}" if hold_reason else no,
            ticket,
            actor=actor,
            note=note,
        )
    elif status == "open":
        _notify_users(
            _hos_ids(ticket) + [previous_assignee_id],
            "ticket_status_changed",
            f"{who} reopened {service}",
            f"It needs assigning again · {no}",
            ticket,
            actor=actor,
            note=note,
        )
    elif status == "closed":
        _notify_users(
            [ticket.raised_by_id],
            "ticket_status_changed",
            f"{service} was closed",
            no,
            ticket,
            actor=actor,
            note=note,
        )


@_never_fails
def emit_ticket_resolved(ticket, actor, note="") -> None:
    """The requester hears it is fixed and is asked to rate it; the HOS hears too."""
    title = f"{_name(actor)} resolved {_service(ticket)}"
    no = f"#{ticket.ticket_no}"
    _notify_users(
        [ticket.raised_by_id], "ticket_resolved", title,
        f"Rate the fix to close it · {no}", ticket, actor=actor, note=note,
    )
    _notify_users(
        [uid for uid in _hos_ids(ticket) if uid != ticket.raised_by_id],
        "ticket_resolved", title, no, ticket, actor=actor, note=note,
    )


@_never_fails
def emit_comment_added(ticket, comment) -> None:
    """Tell the assignee, and the requester when they may read it, of a new comment.

    The requester hears only while the ticket is pending or resolved, the
    statuses at which the comments endpoint shows them the thread.
    """
    recipients = [ticket.assigned_to_id]
    if ticket.status in REQUESTER_COMMENT_STATUSES:
        recipients.append(ticket.raised_by_id)
    _notify_users(
        recipients,
        "comment_added",
        f"{_name(comment.author)} commented on {_service(ticket)}",
        f"#{ticket.ticket_no}",
        ticket,
        actor=comment.author,
        note=comment.body or "",
    )


@_never_fails
def emit_ticket_escalated(ticket, holder=None) -> None:
    """Tell the two people an escalation actually concerns.

    `holder` is the post the ticket escalated TO, resolved structurally by
    `tickets.escalation.resolve_active_holder` — the same user the TicketLog
    records as `level_user`. The assignee is told separately: the ticket is
    leaving their level.
    """
    level = ticket.current_level.upper()
    service = _service(ticket)

    if holder is not None:
        _notify_users(
            [holder.pk],
            "ticket_escalated",
            f"{service} escalated to you",
            f"It reached you as {level} · #{ticket.ticket_no}",
            ticket,
        )

    # A technician who also holds the post has already had the message above.
    if ticket.assigned_to_id and (holder is None or ticket.assigned_to_id != holder.pk):
        _notify_users(
            [ticket.assigned_to_id],
            "ticket_escalated",
            f"Your job {service} was escalated",
            f"It went to the {level} · #{ticket.ticket_no}",
            ticket,
        )
