"""Notifications as messages: who acted, what they did, and what they wrote.

Each typed note reaches the people it was written for: the HOS's handover
note the technician, a progress note the requester, a hold's reason and note
the requester and the HOS, a resolution note the requester and the HOS. One
action sends one message to each recipient, and nobody hears of their own act.
"""

import pytest
from django.urls import reverse

from apps.notifications.models import Notification

pytestmark = pytest.mark.django_db


def _inbox(user):
    return list(Notification.objects.filter(user=user).order_by("pk"))


def _assign(api, hos, ticket, technician, note=""):
    api.force_authenticate(hos)
    response = api.post(
        reverse("ticket-assign", args=[ticket.pk]),
        {"assigned_to": technician.pk, "note": note},
        format="json",
    )
    assert response.status_code == 200, response.json()


def _move(api, actor, ticket, status, **extra):
    api.force_authenticate(actor)
    response = api.post(
        reverse("ticket-status", args=[ticket.pk]), {"status": status, **extra}, format="json"
    )
    assert response.status_code == 200, response.json()


@pytest.fixture
def working(api, nrb_hos, nrb_electrician, nrb_electrical_ticket):
    """A ticket assigned and started, with every inbox emptied."""
    _assign(api, nrb_hos, nrb_electrical_ticket, nrb_electrician)
    _move(api, nrb_electrician, nrb_electrical_ticket, "in_progress", reason="On site now")
    Notification.objects.all().delete()
    return nrb_electrical_ticket


def test_the_handover_note_reaches_the_technician_and_not_the_requester(
    api, nrb_hos, nrb_electrician, nrb_electrical_ticket, requester
):
    _assign(api, nrb_hos, nrb_electrical_ticket, nrb_electrician, note="Check the breaker first")

    [to_tech] = _inbox(nrb_electrician)
    assert to_tech.note == "Check the breaker first"
    assert to_tech.actor == nrb_hos
    [to_requester] = _inbox(requester)
    assert to_requester.note == ""
    assert "will handle your request" in to_requester.title
    assert _inbox(nrb_hos) == []


def test_a_progress_note_reaches_the_requester(
    api, nrb_hos, nrb_electrician, nrb_electrical_ticket, requester
):
    _assign(api, nrb_hos, nrb_electrical_ticket, nrb_electrician)
    Notification.objects.all().delete()

    _move(api, nrb_electrician, nrb_electrical_ticket, "in_progress", reason="Replacing the socket")

    [message] = _inbox(requester)
    assert "started work" in message.title
    assert message.note == "Replacing the socket"
    # Starting work is the requester's news, not the HOS's.
    assert _inbox(nrb_hos) == []
    assert _inbox(nrb_electrician) == []


def test_a_hold_reaches_the_requester_and_the_hos_with_its_reason_and_note(
    api, working, nrb_electrician, nrb_hos, requester
):
    _move(
        api, nrb_electrician, working, "pending",
        reason="Fitting removed",
        pending_reason="material_not_in_store",
        pending_reason_note="Socket out of stock; requisition raised.",
    )

    for person in (requester, nrb_hos):
        [message] = _inbox(person)
        assert "on hold" in message.title
        assert "Material not in store" in message.body
        assert "Socket out of stock; requisition raised." in message.note
        assert "Fitting removed" in message.note
    assert _inbox(nrb_electrician) == []


def test_resuming_tells_the_requester_and_the_hos(
    api, working, nrb_electrician, nrb_hos, requester
):
    _move(api, nrb_electrician, working, "pending", reason="x",
          pending_reason="material_not_in_store")
    Notification.objects.all().delete()

    _move(api, nrb_electrician, working, "in_progress", reason="Parts arrived")

    for person in (requester, nrb_hos):
        [message] = _inbox(person)
        assert "resumed work" in message.title
        assert message.note == "Parts arrived"


def test_a_resolution_note_reaches_the_requester_and_the_hos(
    api, working, nrb_electrician, nrb_hos, requester
):
    _move(api, nrb_electrician, working, "resolved", reason="New socket fitted and tested")

    [to_requester] = _inbox(requester)
    assert to_requester.note == "New socket fitted and tested"
    assert "Rate the fix" in to_requester.body
    [to_hos] = _inbox(nrb_hos)
    assert to_hos.note == "New socket fitted and tested"
    assert "Rate" not in to_hos.body
    assert _inbox(nrb_electrician) == []


def test_a_claim_is_one_message_to_the_requester(
    api, nrb_electrician, nrb_electrical_ticket, requester
):
    api.force_authenticate(nrb_electrician)
    assert api.post(reverse("ticket-claim", args=[nrb_electrical_ticket.pk])).status_code == 200

    [message] = _inbox(requester)
    assert "has started on your request" in message.title
    assert _inbox(nrb_electrician) == []
    assert Notification.objects.count() == 1


def test_rating_closes_the_ticket_and_tells_nobody(
    api, working, nrb_electrician, requester
):
    _move(api, nrb_electrician, working, "resolved", reason="Done")
    Notification.objects.all().delete()

    api.force_authenticate(requester)
    response = api.post(
        reverse("ticket-feedback", args=[working.pk]), {"rating": 5}, format="json"
    )

    assert response.status_code in (200, 201), response.json()
    assert Notification.objects.count() == 0


def test_a_reopen_tells_the_hos_and_the_technician_who_had_it(
    api, working, nrb_electrician, nrb_hos, requester
):
    _move(api, nrb_electrician, working, "resolved", reason="Done")
    Notification.objects.all().delete()

    _move(api, requester, working, "open")

    for person in (nrb_hos, nrb_electrician):
        [message] = _inbox(person)
        assert "reopened" in message.title
        assert message.actor == requester
    assert _inbox(requester) == []


def test_a_comment_arrives_as_the_whole_message(
    api, working, nrb_electrician, nrb_hos
):
    long_body = "Breaker trips under load. " * 20
    api.force_authenticate(nrb_hos)
    response = api.post(
        reverse("ticket-comments", args=[working.pk]), {"body": long_body}, format="json"
    )
    assert response.status_code == 201, response.json()

    [message] = _inbox(nrb_electrician)
    # The body field is capped; the note is the comment in full.
    assert message.note == long_body.strip()
    assert message.actor == nrb_hos


def test_the_feed_carries_the_sender_and_their_words(
    api, nrb_hos, nrb_electrician, nrb_electrical_ticket
):
    _assign(api, nrb_hos, nrb_electrical_ticket, nrb_electrician, note="Bring a ladder")
    api.force_authenticate(nrb_electrician)

    [row] = api.get(reverse("notifications-list")).json()["results"]

    assert row["note"] == "Bring a ladder"
    assert row["actor_name"]
    assert row["actor_name"] in row["title"]


def test_on_reassignment_the_note_goes_to_the_new_technician_only(
    api, nrb, electrical, nrb_hos, nrb_electrician, nrb_electrical_ticket, requester
):
    from tests import factories

    second = factories.make_technician("nrb_electrician_two", nrb, [electrical])
    _assign(api, nrb_hos, nrb_electrical_ticket, nrb_electrician)
    Notification.objects.all().delete()

    _assign(api, nrb_hos, nrb_electrical_ticket, second, note="Take over, the meter is upstairs")

    [to_new] = _inbox(second)
    assert to_new.note == "Take over, the meter is upstairs"
    [to_old] = _inbox(nrb_electrician)
    assert "was reassigned" in to_old.title and to_old.note == ""
    [to_requester] = _inbox(requester)
    assert "now handling" in to_requester.title and to_requester.note == ""


def test_handing_the_job_to_the_technician_who_has_it_sends_only_a_note(
    api, nrb_hos, nrb_electrician, nrb_electrical_ticket, requester
):
    _assign(api, nrb_hos, nrb_electrical_ticket, nrb_electrician)
    Notification.objects.all().delete()

    _assign(api, nrb_hos, nrb_electrical_ticket, nrb_electrician)
    assert Notification.objects.count() == 0

    _assign(api, nrb_hos, nrb_electrical_ticket, nrb_electrician, note="Priority raised")
    [message] = _inbox(nrb_electrician)
    assert message.note == "Priority raised"
    assert _inbox(requester) == []


def test_a_technician_assigned_their_own_request_hears_once(
    api, nrb, electrical, nrb_hos, nrb_electrician, priorities
):
    from tests import factories

    own = factories.make_ticket(nrb_electrician, nrb, electrical)
    _assign(api, nrb_hos, own, nrb_electrician, note="Your own fault, fix it")

    [message] = _inbox(nrb_electrician)
    assert message.note == "Your own fault, fix it"


def test_a_technician_who_raises_and_claims_a_job_hears_nothing(
    api, nrb, electrical, nrb_electrician, priorities
):
    from tests import factories

    own = factories.make_ticket(nrb_electrician, nrb, electrical)
    api.force_authenticate(nrb_electrician)
    assert api.post(reverse("ticket-claim", args=[own.pk])).status_code == 200

    assert Notification.objects.count() == 0


def test_a_hos_who_raised_the_ticket_hears_of_its_hold_once(
    api, nrb, electrical, nrb_hos, nrb_electrician, priorities
):
    from tests import factories

    own = factories.make_ticket(nrb_hos, nrb, electrical)
    _assign(api, nrb_hos, own, nrb_electrician)
    _move(api, nrb_electrician, own, "in_progress", reason="On it")
    Notification.objects.all().delete()

    _move(api, nrb_electrician, own, "pending", reason="Waiting",
          pending_reason="material_not_in_store")

    assert len(_inbox(nrb_hos)) == 1


def test_a_hold_whose_two_notes_match_carries_one_copy(
    api, working, nrb_electrician, requester
):
    _move(api, nrb_electrician, working, "pending", reason="No parts",
          pending_reason="material_not_in_store", pending_reason_note="No parts")

    [message] = _inbox(requester)
    assert message.note == "No parts"


def test_changing_the_hold_reason_is_one_message_and_never_says_work_resumed(
    api, working, nrb_electrician, nrb_hos, requester
):
    _move(api, nrb_electrician, working, "pending", reason="x",
          pending_reason="material_not_in_store")
    Notification.objects.all().delete()

    _move(api, nrb_electrician, working, "pending", pending_reason="requester_unavailable",
          pending_reason_note="Office locked")

    working.refresh_from_db()
    assert working.status == "pending"
    assert working.pending_reason == "requester_unavailable"
    for person in (requester, nrb_hos):
        [message] = _inbox(person)
        assert "changed the hold reason" in message.title
        assert "Requestor was not available" in message.body
        assert message.note == "Office locked"


def test_other_campuses_and_the_hod_hear_nothing_of_a_hold_or_a_resolve(
    api, working, nrb_electrician, msa_hos, nrb_hod
):
    _move(api, nrb_electrician, working, "pending", reason="x",
          pending_reason="material_not_in_store")
    _move(api, nrb_electrician, working, "in_progress", reason="back")
    _move(api, nrb_electrician, working, "resolved", reason="done")

    assert _inbox(msa_hos) == []
    assert _inbox(nrb_hod) == []


def test_a_reopen_from_closed_reaches_the_hos_and_the_last_technician(
    api, working, nrb_electrician, nrb_hos, requester
):
    _move(api, nrb_electrician, working, "resolved", reason="done")
    api.force_authenticate(requester)
    api.post(reverse("ticket-feedback", args=[working.pk]), {"rating": 2}, format="json")
    working.refresh_from_db()
    assert working.status == "closed"
    Notification.objects.all().delete()

    _move(api, requester, working, "open")

    assert len(_inbox(nrb_hos)) == 1
    assert len(_inbox(nrb_electrician)) == 1


def test_a_reopen_by_the_hos_tells_the_technician_not_the_hos(
    api, working, nrb_electrician, nrb_hos
):
    _move(api, nrb_electrician, working, "resolved", reason="done")
    Notification.objects.all().delete()

    _move(api, nrb_hos, working, "open")

    assert _inbox(nrb_hos) == []
    [message] = _inbox(nrb_electrician)
    assert "reopened" in message.title


def test_the_requesters_log_hides_the_handover_note_and_staff_see_it(
    api, nrb_hos, nrb_electrician, nrb_electrical_ticket, requester
):
    _assign(api, nrb_hos, nrb_electrical_ticket, nrb_electrician, note="Requester is difficult")
    url = reverse("ticket-logs", args=[nrb_electrical_ticket.pk])

    def assigned_reasons(user):
        api.force_authenticate(user)
        return [r["reason"] for r in api.get(url).json()["results"] if r["event_type"] == "assigned"]

    assert assigned_reasons(requester) == [""]
    assert assigned_reasons(nrb_electrician) == ["Requester is difficult"]
