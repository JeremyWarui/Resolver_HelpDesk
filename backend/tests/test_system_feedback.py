"""System feedback: anyone signed in sends it, only the admin reads it."""

import pytest
from django.core.cache import cache
from django.urls import reverse

from apps.system_feedback.models import SystemFeedback

pytestmark = pytest.mark.django_db

LIST = "system-feedback-list"


@pytest.fixture(autouse=True)
def _fresh_throttle():
    # The throttle counts in the cache, which outlives a test's database.
    cache.clear()
    yield
    cache.clear()


def _send(api, user, **body):
    api.force_authenticate(user)
    payload = {"category": "idea", "message": "Show the queue on a phone", **body}
    return api.post(reverse(LIST), payload, format="json")


def test_a_requester_sends_feedback_and_it_records_who_from_the_request(
    api, requester, nrb_hos
):
    response = _send(api, requester, page="/user/tickets", author=nrb_hos.pk)

    assert response.status_code == 201, response.json()
    row = SystemFeedback.objects.get()
    assert row.author == requester
    assert row.author_role == "user"
    assert row.page == "/user/tickets"
    assert row.reviewed is False


def test_a_sender_cannot_mark_their_own_feedback_reviewed(api, requester):
    _send(api, requester, reviewed=True)
    assert SystemFeedback.objects.get().reviewed is False


def test_staff_feedback_keeps_the_role_it_was_sent_under(api, nrb_hos):
    _send(api, nrb_hos)
    assert SystemFeedback.objects.get().author_role == "hos"


@pytest.mark.parametrize(
    "body, field",
    [
        ({"message": "   hi  "}, "message"),
        ({"message": "x" * (SystemFeedback.MESSAGE_MAX + 1)}, "message"),
        ({"category": "complaint"}, "category"),
    ],
)
def test_bad_feedback_is_refused_by_field(api, requester, body, field):
    response = _send(api, requester, **body)
    assert response.status_code == 400
    assert field in response.json()
    assert not SystemFeedback.objects.exists()


@pytest.mark.parametrize("who", ["requester", "nrb_hos", "nrb_hod", "manager"])
def test_only_the_admin_reads_the_list(api, request, who, admin_user):
    _send(api, admin_user)
    api.force_authenticate(request.getfixturevalue(who))
    assert api.get(reverse(LIST)).status_code == 403


def test_the_admin_reads_who_sent_it_and_from_where(api, admin_user, requester, nrb):
    _send(api, requester, category="problem", message="The wizard lost my photo")
    api.force_authenticate(admin_user)

    [row] = api.get(reverse(LIST)).json()["results"]

    assert row["category"] == "problem"
    assert row["message"] == "The wizard lost my photo"
    assert row["author_campus"] == nrb.name
    assert row["author_role"] == "user"


def test_status_narrows_the_list(api, admin_user, requester):
    _send(api, requester, message="first one")
    _send(api, requester, message="second one")
    SystemFeedback.objects.filter(message="first one").update(reviewed=True)
    api.force_authenticate(admin_user)

    new = api.get(reverse(LIST), {"status": "new"}).json()
    reviewed = api.get(reverse(LIST), {"status": "reviewed"}).json()
    everything = api.get(reverse(LIST)).json()

    assert [r["message"] for r in new["results"]] == ["second one"]
    assert [r["message"] for r in reviewed["results"]] == ["first one"]
    assert everything["count"] == 2


def test_the_admin_marks_feedback_reviewed_and_back(api, admin_user, requester):
    _send(api, requester)
    row = SystemFeedback.objects.get()
    api.force_authenticate(admin_user)
    url = reverse("system-feedback-review", args=[row.pk])

    assert api.patch(url, {"reviewed": True}, format="json").status_code == 200
    row.refresh_from_db()
    assert row.reviewed is True

    api.patch(url, {"reviewed": False}, format="json")
    row.refresh_from_db()
    assert row.reviewed is False


def test_the_review_cannot_rewrite_what_was_said(api, admin_user, requester):
    _send(api, requester, message="original words")
    row = SystemFeedback.objects.get()
    api.force_authenticate(admin_user)

    api.patch(
        reverse("system-feedback-review", args=[row.pk]),
        {"message": "edited words", "reviewed": True},
        format="json",
    )

    row.refresh_from_db()
    assert row.message == "original words"


@pytest.mark.parametrize("who", ["requester", "nrb_hos", "manager"])
def test_only_the_admin_reviews(api, request, who, requester):
    _send(api, requester)
    row = SystemFeedback.objects.get()
    api.force_authenticate(request.getfixturevalue(who))

    response = api.patch(
        reverse("system-feedback-review", args=[row.pk]), {"reviewed": True}, format="json"
    )

    assert response.status_code == 403
    row.refresh_from_db()
    assert row.reviewed is False


def test_feedback_outlives_its_author(api, requester, admin_user):
    _send(api, requester)
    requester.delete()
    api.force_authenticate(admin_user)

    [row] = api.get(reverse(LIST)).json()["results"]

    assert row["author_name"] == "Deleted account"


def test_signed_out_callers_can_neither_send_nor_read(api):
    assert api.post(reverse(LIST), {"category": "idea", "message": "hello there"}).status_code == 401
    assert api.get(reverse(LIST)).status_code == 401


def test_an_unknown_status_is_a_400(api, admin_user):
    api.force_authenticate(admin_user)
    assert api.get(reverse(LIST), {"status": "bogus"}).status_code == 400


def test_one_senders_limit_does_not_block_another(api, requester, nrb_hos):
    for _ in range(10):
        _send(api, requester)
    assert _send(api, requester).status_code == 429
    assert _send(api, nrb_hos).status_code == 201


def test_reading_the_list_is_never_throttled(api, admin_user):
    api.force_authenticate(admin_user)
    for _ in range(15):
        assert api.get(reverse(LIST)).status_code == 200
