"""Notifications — generated on the backend, fetched by polling.

These rows are the only record that something happened, so the tests that
matter are the ones proving each domain event writes them, and to the right
people: a notification nobody receives is the same as no notification at all.
"""

import pytest
from django.urls import reverse

from apps.notifications.models import Notification
from tests import factories

pytestmark = pytest.mark.django_db


def _for(user, event=None):
    qs = Notification.objects.filter(user=user)
    return qs.filter(event_type=event) if event else qs


def test_raising_a_ticket_tells_the_supervisors(
    api,
    requester,
    nrb,
    electrical,
    nrb_hos,
    nrb_hod,
    priorities,
    somewhere,
):
    item = factories.make_service_item(electrical, "Dead socket")
    api.force_authenticate(requester)
    response = api.post(
        reverse("ticket-list"),
        {"service_item": item.pk, "description": "no power", "location": somewhere},
        format="json",
    )
    assert response.status_code == 201, response.json()

    assert _for(nrb_hos, "ticket_created").exists()
    assert _for(nrb_hod, "ticket_created").exists()
    # The requester already knows — they just filed it.
    assert not _for(requester, "ticket_created").exists()


def test_assigning_tells_the_technician_and_the_requester(
    api,
    nrb_hos,
    nrb_electrician,
    nrb_electrical_ticket,
    requester,
):
    api.force_authenticate(nrb_hos)
    response = api.post(
        reverse("ticket-assign", args=[nrb_electrical_ticket.pk]),
        {"assigned_to": nrb_electrician.pk},
        format="json",
    )
    assert response.status_code == 200, response.json()

    assert _for(nrb_electrician, "ticket_assigned").exists()
    assert _for(requester, "ticket_assigned").exists()


def test_the_feed_is_the_callers_own(api, requester, nrb_hos, nrb_electrical_ticket):
    Notification.objects.create(
        user=nrb_hos, event_type="ticket_created", title="t", body="b"
    )
    api.force_authenticate(requester)
    body = api.get(reverse("notifications-list")).json()
    assert body["results"] == []
    assert body["unread_count"] == 0


def test_another_users_notification_cannot_be_marked_read(api, requester, nrb_hos):
    theirs = Notification.objects.create(
        user=nrb_hos, event_type="ticket_created", title="t", body="b"
    )
    api.force_authenticate(requester)
    # reverse(), not a literal path: a slashless literal asserts against
    # APPEND_SLASH's 301 instead of the 404 the view returns.
    url = reverse("notification-mark-read", args=[theirs.pk])
    assert api.patch(url).status_code == 404
    theirs.refresh_from_db()
    assert theirs.read is False



def test_a_status_change_tells_the_requester(
    nrb_electrical_ticket, nrb_electrician, nrb_hos, requester
):
    from apps.tickets.lifecycle import assign_ticket, transition_status

    assign_ticket(nrb_electrical_ticket, nrb_electrician, nrb_hos)
    transition_status(nrb_electrical_ticket, "in_progress", nrb_electrician)

    assert _for(requester, "ticket_status_changed").count() == 1


def test_resolving_tells_the_requester_and_asks_for_a_rating(
    nrb_electrical_ticket, nrb_electrician, nrb_hos, requester
):
    """Resolved is its own event, not another status change: it is the one that
    asks for the rating, and the rating only exists after resolution."""
    from apps.tickets.lifecycle import assign_ticket, transition_status

    assign_ticket(nrb_electrical_ticket, nrb_electrician, nrb_hos)
    transition_status(nrb_electrical_ticket, "in_progress", nrb_electrician)
    transition_status(nrb_electrical_ticket, "resolved", nrb_electrician)

    assert _for(requester, "ticket_resolved").count() == 1
    # Resolution is not also announced as a plain status change.
    assert _for(requester, "ticket_status_changed").count() == 1


def test_reassignment_tells_the_technician_who_lost_the_job(
    nrb, electrical, nrb_electrical_ticket, nrb_hos, requester
):
    """The outgoing technician has the job on their queue and has to be told it
    is gone, or they keep working a ticket that is no longer theirs."""
    from apps.tickets.lifecycle import assign_ticket

    first = factories.make_technician("elec_first", nrb, [electrical])
    second = factories.make_technician("elec_second", nrb, [electrical])

    assign_ticket(nrb_electrical_ticket, first, nrb_hos)
    assert _for(first, "ticket_assigned").count() == 1

    assign_ticket(nrb_electrical_ticket, second, nrb_hos)

    assert _for(second, "ticket_assigned").count() == 1
    assert _for(first, "ticket_assigned").count() == 2
    assert _for(requester, "ticket_assigned").count() == 2


@pytest.mark.parametrize(
    "status, requester_told",
    [
        ("assigned", False),
        ("in_progress", False),
        ("pending", True),
        ("resolved", True),
    ],
)
def test_a_comment_reaches_the_requester_only_when_they_may_read_it(
    nrb_electrical_ticket, nrb_electrician, nrb_hos, requester, status, requester_told
):
    """The requester is told of a comment exactly when the comments endpoint
    would show it to them; the assignee is told whenever someone else posts."""
    from apps.notifications.notify import emit_comment_added
    from apps.tickets.models import TicketComment

    nrb_electrical_ticket.assigned_to = nrb_electrician
    nrb_electrical_ticket.status = status
    nrb_electrical_ticket.save(update_fields=["assigned_to", "status"])
    comment = TicketComment.objects.create(
        ticket=nrb_electrical_ticket, author=nrb_hos, body="Parts ordered"
    )

    emit_comment_added(nrb_electrical_ticket, comment)

    assert _for(requester, "comment_added").exists() is requester_told
    assert _for(nrb_electrician, "comment_added").count() == 1


def test_an_assignee_who_raised_the_ticket_is_told_once(
    nrb, electrical, nrb_electrician, nrb_hos, priorities
):
    from apps.notifications.notify import emit_comment_added
    from apps.tickets.models import TicketComment

    own = factories.make_ticket(
        nrb_electrician, nrb, electrical, assigned_to=nrb_electrician, status="pending"
    )
    comment = TicketComment.objects.create(ticket=own, author=nrb_hos, body="Approved")

    emit_comment_added(own, comment)

    assert _for(nrb_electrician, "comment_added").count() == 1


def test_the_assignee_is_not_told_of_their_own_comment(
    nrb_electrical_ticket, nrb_electrician, requester
):
    from apps.notifications.notify import emit_comment_added
    from apps.tickets.models import TicketComment

    nrb_electrical_ticket.assigned_to = nrb_electrician
    nrb_electrical_ticket.status = "pending"
    nrb_electrical_ticket.save(update_fields=["assigned_to", "status"])
    comment = TicketComment.objects.create(
        ticket=nrb_electrical_ticket, author=nrb_electrician, body="Waiting on stores"
    )

    emit_comment_added(nrb_electrical_ticket, comment)

    assert not _for(nrb_electrician, "comment_added").exists()
    assert _for(requester, "comment_added").count() == 1


def test_an_escalation_tells_the_post_it_reached_and_the_assignee(
    nrb_electrical_ticket, nrb_electrician, nrb_hos, nrb_hod
):
    """Both halves matter: the HOS has to know it landed on them, and the
    technician has to know the job left their level."""
    from django.utils import timezone

    nrb_electrical_ticket.assigned_to = nrb_electrician
    nrb_electrical_ticket.status = "in_progress"
    nrb_electrical_ticket.save(update_fields=["assigned_to", "status"])
    factories.age_past(nrb_electrical_ticket, "escalate_to_hos_minutes")

    assert factories.escalate(nrb_electrical_ticket, timezone.now()) is True

    assert _for(nrb_hos, "ticket_escalated").count() == 1
    assert _for(nrb_electrician, "ticket_escalated").count() == 1
    # It reached the HOS, not the HOD — the level above has not been passed.
    assert not _for(nrb_hod, "ticket_escalated").exists()


def test_a_failing_notification_never_breaks_the_action(
    monkeypatch, nrb_electrical_ticket, nrb_electrician, nrb_hos
):
    """The row is the courtesy, the ticket is the work. The guard sits at the
    emitter boundary, so it has to hold for an error raised before the insert
    as well as inside it."""
    from apps.notifications import notify
    from apps.tickets.lifecycle import assign_ticket, transition_status

    def explode(*args, **kwargs):
        raise RuntimeError("the feed is down")

    monkeypatch.setattr(notify, "_notify_users", explode)

    assign_ticket(nrb_electrical_ticket, nrb_electrician, nrb_hos)
    transition_status(nrb_electrical_ticket, "in_progress", nrb_electrician)

    nrb_electrical_ticket.refresh_from_db()
    assert nrb_electrical_ticket.status == "in_progress"
    assert nrb_electrical_ticket.assigned_to_id == nrb_electrician.pk
    assert Notification.objects.count() == 0


def _note(user, event="ticket_status_changed", read=False):
    return Notification.objects.create(
        user=user, event_type=event, title="t", body="b", read=read
    )


def test_the_feed_filters_to_unread_and_still_counts_the_whole_feed(api, requester):
    unread = _note(requester)
    _note(requester, read=True)
    api.force_authenticate(requester)

    body = api.get(reverse("notifications-list"), {"unread": "1"}).json()

    assert [n["id"] for n in body["results"]] == [unread.pk]
    assert body["unread_count"] == 1


def test_the_feed_filters_to_the_event_types_asked_for(api, requester):
    comment = _note(requester, "comment_added")
    resolved = _note(requester, "ticket_resolved")
    _note(requester, "ticket_assigned")
    api.force_authenticate(requester)

    body = api.get(
        reverse("notifications-list"), {"event_type": "comment_added,ticket_resolved"}
    ).json()

    assert {n["id"] for n in body["results"]} == {comment.pk, resolved.pk}


def test_the_feed_pages_with_before_and_says_when_there_is_more(api, requester):
    notes = [_note(requester) for _ in range(53)]
    api.force_authenticate(requester)

    first = api.get(reverse("notifications-list")).json()
    assert len(first["results"]) == 50
    assert first["has_more"] is True
    assert first["results"][0]["id"] == notes[-1].pk

    second = api.get(
        reverse("notifications-list"), {"before": first["results"][-1]["id"]}
    ).json()
    assert [n["id"] for n in second["results"]] == [n.pk for n in reversed(notes[:3])]
    assert second["has_more"] is False


def test_the_feed_filters_never_reach_another_users_rows(api, requester, nrb_hos):
    _note(nrb_hos, "comment_added")
    api.force_authenticate(requester)

    body = api.get(
        reverse("notifications-list"), {"event_type": "comment_added", "unread": "1"}
    ).json()

    assert body["results"] == []
    assert body["unread_count"] == 0


@pytest.mark.parametrize("before", ["abc", "-1", " 5", "\u00b2"])
def test_a_malformed_before_is_a_400_not_a_server_error(api, requester, before):
    api.force_authenticate(requester)
    assert api.get(reverse("notifications-list"), {"before": before}).status_code == 400


def test_limit_sets_the_page_size_and_pages_on_from_there(api, requester):
    notes = [_note(requester) for _ in range(25)]
    api.force_authenticate(requester)

    first = api.get(reverse("notifications-list"), {"limit": 20}).json()
    assert [n["id"] for n in first["results"]] == [n.pk for n in reversed(notes[5:])]
    assert first["has_more"] is True

    second = api.get(
        reverse("notifications-list"), {"limit": 20, "before": first["results"][-1]["id"]}
    ).json()
    assert [n["id"] for n in second["results"]] == [n.pk for n in reversed(notes[:5])]
    assert second["has_more"] is False


def test_limit_is_capped_so_one_call_cannot_pull_the_whole_feed(api, requester):
    for _ in range(105):
        _note(requester)
    api.force_authenticate(requester)

    body = api.get(reverse("notifications-list"), {"limit": 5000}).json()

    assert len(body["results"]) == 100
    assert body["has_more"] is True


@pytest.mark.parametrize("limit", ["0", "-3", "ten", "\u00b2"])
def test_a_bad_limit_is_a_400(api, requester, limit):
    api.force_authenticate(requester)
    assert api.get(reverse("notifications-list"), {"limit": limit}).status_code == 400


def test_unread_count_ignores_the_type_and_paging_filters(api, requester):
    _note(requester, "ticket_assigned")
    newest = _note(requester, "comment_added")
    _note(requester, "comment_added", read=True)
    api.force_authenticate(requester)
    url = reverse("notifications-list")

    by_type = api.get(url, {"event_type": "comment_added"}).json()
    paged = api.get(url, {"before": newest.pk}).json()

    assert by_type["unread_count"] == 2
    assert paged["unread_count"] == 2


@pytest.mark.parametrize("rows, more", [(50, False), (51, True)])
def test_has_more_is_exact_at_the_page_boundary(api, requester, rows, more):
    for _ in range(rows):
        _note(requester)
    api.force_authenticate(requester)

    body = api.get(reverse("notifications-list")).json()

    assert len(body["results"]) == 50
    assert body["has_more"] is more


def test_an_unknown_event_type_is_a_400(api, requester):
    api.force_authenticate(requester)
    response = api.get(reverse("notifications-list"), {"event_type": "comment_added,nonsense"})
    assert response.status_code == 400
    assert "nonsense" in str(response.json()["event_type"])


def test_the_feed_is_in_time_order_whatever_order_the_rows_were_written(api, requester):
    from datetime import timedelta

    from django.utils import timezone

    now = timezone.now()
    older = _note(requester)
    newer = _note(requester)
    # Written in one order, dated in the other, as a back-dated import would be.
    Notification.objects.filter(pk=older.pk).update(created_at=now)
    Notification.objects.filter(pk=newer.pk).update(created_at=now - timedelta(days=3))
    api.force_authenticate(requester)

    ids = [n["id"] for n in api.get(reverse("notifications-list")).json()["results"]]

    assert ids == [older.pk, newer.pk]


def test_paging_through_one_instant_neither_skips_nor_repeats(api, requester):
    from django.utils import timezone

    now = timezone.now()
    notes = [_note(requester) for _ in range(7)]
    Notification.objects.filter(user=requester).update(created_at=now)
    api.force_authenticate(requester)

    seen, before = [], None
    while True:
        params = {"limit": 3, **({"before": before} if before else {})}
        body = api.get(reverse("notifications-list"), params).json()
        seen += [n["id"] for n in body["results"]]
        if not body["has_more"]:
            break
        before = body["results"][-1]["id"]

    assert sorted(seen) == sorted(n.pk for n in notes)
    assert len(seen) == len(set(seen))


def test_paging_from_another_users_row_returns_nothing(api, requester, nrb_hos):
    _note(requester)
    theirs = _note(nrb_hos)
    api.force_authenticate(requester)

    body = api.get(reverse("notifications-list"), {"before": theirs.pk}).json()

    assert body["results"] == []


def test_mark_all_read_stops_at_what_the_reader_had_on_screen(api, requester):
    """A message that arrived after the page last polled stays unread."""
    seen = [_note(requester) for _ in range(3)]
    arrived_since = _note(requester)
    api.force_authenticate(requester)

    response = api.post(
        reverse("notifications-read-all"), {"up_to": seen[-1].pk}, format="json"
    )

    assert response.status_code == 204
    assert not Notification.objects.filter(pk__in=[n.pk for n in seen], read=False).exists()
    assert Notification.objects.get(pk=arrived_since.pk).read is False


def test_mark_all_read_without_a_bound_reads_everything(api, requester):
    for _ in range(2):
        _note(requester)
    api.force_authenticate(requester)

    api.post(reverse("notifications-read-all"))

    assert not Notification.objects.filter(user=requester, read=False).exists()


@pytest.mark.parametrize("up_to", ["7", 1.5, True, [1]])
def test_mark_all_read_with_a_bound_that_is_not_an_id_is_a_400(api, requester, up_to):
    note = _note(requester)
    api.force_authenticate(requester)

    response = api.post(reverse("notifications-read-all"), {"up_to": up_to}, format="json")

    assert response.status_code == 400
    assert Notification.objects.get(pk=note.pk).read is False
