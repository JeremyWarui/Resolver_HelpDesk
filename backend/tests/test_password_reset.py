"""Resetting a forgotten password by an emailed link."""

import re

import pytest
from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse

from apps.accounts.models import CustomUser

pytestmark = pytest.mark.django_db

REQUEST = reverse("auth-password-reset")
CONFIRM = reverse("auth-password-reset-confirm")
LOGIN = "/api/v1/auth/login/"
REFRESH = "/api/v1/auth/refresh/"
NEW = "a-sturdy-new-passphrase-42"


@pytest.fixture(autouse=True)
def _fresh_throttles():
    # The throttles count in the cache, which outlives a test's database.
    cache.clear()
    yield
    cache.clear()


@pytest.fixture(autouse=True)
def _send_inline(monkeypatch, request):
    # Sending happens on another thread; most tests read the outbox straight after.
    if "real_thread" not in request.keywords:
        monkeypatch.setattr("apps.accounts.password_reset.in_background", lambda fn, *args: fn(*args))


def _ask(api, email):
    return api.post(REQUEST, {"email": email}, format="json")


def _link(message):
    uid, token = re.search(r"/reset-password\?uid=([\w-]+)&token=([\w-]+)", message.body).groups()
    return uid, token


def _confirm(api, uid, token, password=NEW):
    return api.post(CONFIRM, {"uid": uid, "token": token, "password": password}, format="json")


def _signs_in(api, user, password):
    return api.post(LOGIN, {"email": user.email, "password": password}, format="json").status_code == 200


# ─── Asking for a link ──────────────────────────────────────────────────────


@override_settings(FRONTEND_URL="https://resolver.ksg.ac.ke")
def test_an_account_is_emailed_a_link_to_the_reset_page(api, requester):
    response = _ask(api, requester.email)

    assert response.status_code == 200
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == [requester.email]
    assert "https://resolver.ksg.ac.ke/reset-password?uid=" in mail.outbox[0].body
    assert "within 60 minutes" in mail.outbox[0].body


def test_an_unknown_address_gets_the_same_answer_and_no_email(api, requester):
    known = _ask(api, requester.email)
    unknown = _ask(api, "nobody@example.test")

    assert (unknown.status_code, unknown.json()) == (known.status_code, known.json())
    assert [m.to for m in mail.outbox] == [[requester.email]]


def test_a_deactivated_account_gets_no_link(api, requester):
    CustomUser.objects.filter(pk=requester.pk).update(is_active=False)

    response = _ask(api, requester.email)

    assert response.status_code == 200
    assert mail.outbox == []


def test_the_address_is_matched_whatever_its_case(api, requester):
    _ask(api, f"  {requester.email.upper()} ")

    assert [m.to for m in mail.outbox] == [[requester.email]]


def test_a_blank_address_is_refused(api):
    assert _ask(api, "  ").status_code == 400


def test_one_address_is_sent_at_most_three_links_an_hour(api, requester, msa_requester):
    answers = [_ask(api, requester.email).status_code for _ in range(4)]

    assert answers == [200, 200, 200, 429]
    assert len(mail.outbox) == 3
    assert _ask(api, msa_requester.email).status_code == 200


def test_a_failed_send_still_gets_the_same_answer(api, requester, monkeypatch):
    def broken(*args, **kwargs):
        raise ConnectionRefusedError("no mail server")

    monkeypatch.setattr("apps.accounts.password_reset.get_connection", broken)

    response = _ask(api, requester.email)

    assert response.status_code == 200
    assert "If an account uses that address" in response.json()["detail"]


# ─── Using the link ─────────────────────────────────────────────────────────


def test_the_link_sets_a_new_password(api, requester):
    _ask(api, requester.email)

    response = _confirm(api, *_link(mail.outbox[0]))

    assert response.status_code == 200
    assert _signs_in(api, requester, NEW)
    assert not _signs_in(api, requester, "pw")


def test_a_link_works_once(api, requester):
    _ask(api, requester.email)
    uid, token = _link(mail.outbox[0])
    _confirm(api, uid, token)

    response = _confirm(api, uid, token, password="another-sturdy-passphrase-7")

    assert response.status_code == 400
    assert "expired or has already been used" in response.json()["token"][0]
    assert _signs_in(api, requester, NEW)


def test_an_expired_link_is_refused(api, requester):
    _ask(api, requester.email)
    uid, token = _link(mail.outbox[0])

    with override_settings(PASSWORD_RESET_TIMEOUT=-1):
        response = _confirm(api, uid, token)

    assert response.status_code == 400
    assert _signs_in(api, requester, "pw")


@pytest.mark.parametrize("uid, token", [("", ""), ("garbage", "garbage"), ("MQ", "1-abc"), (None, None), ("%%%", "x")])
def test_a_made_up_link_is_refused_not_an_error(api, requester, uid, token):
    response = _confirm(api, uid, token)

    assert response.status_code == 400
    assert "token" in response.json()


def test_one_persons_token_does_not_open_another_persons_account(api, requester, msa_requester):
    from django.utils.encoding import force_bytes
    from django.utils.http import urlsafe_base64_encode

    _ask(api, requester.email)
    _, token = _link(mail.outbox[0])

    response = _confirm(api, urlsafe_base64_encode(force_bytes(msa_requester.pk)), token)

    assert response.status_code == 400
    assert _signs_in(api, msa_requester, "pw")


def test_a_weak_password_is_refused_and_the_link_still_works(api, requester):
    _ask(api, requester.email)
    uid, token = _link(mail.outbox[0])

    weak = _confirm(api, uid, token, password="12345678")

    assert weak.status_code == 400 and weak.json()["password"]
    assert _signs_in(api, requester, "pw")
    assert _confirm(api, uid, token).status_code == 200


def test_a_link_stops_working_when_the_account_is_deactivated(api, requester):
    _ask(api, requester.email)
    uid, token = _link(mail.outbox[0])
    CustomUser.objects.filter(pk=requester.pk).update(is_active=False)

    assert _confirm(api, uid, token).status_code == 400


def test_a_reset_signs_the_account_out_everywhere(api, requester):
    assert api.post(LOGIN, {"email": requester.email, "password": "pw"}, format="json").status_code == 200
    _ask(api, requester.email)

    _confirm(api, *_link(mail.outbox[0]))

    # The cookie jar still holds the refresh token from before the reset.
    assert api.post(REFRESH).status_code == 401


def test_guessing_at_links_is_limited(api, requester):
    answers = [_confirm(api, "MQ", f"guess-{n}").status_code for n in range(21)]

    assert answers[:20] == [400] * 20
    assert answers[20] == 429


# ─── A test system mails one address only ───────────────────────────────────


@override_settings(
    EMAIL_BACKEND="apps.common.mail.SendOnlyToBackend",
    EMAIL_DELIVERY_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    EMAIL_SEND_ONLY_TO="owner@example.test",
)
def test_with_send_only_to_set_the_email_goes_there_and_not_to_the_account(api, requester):
    _ask(api, requester.email)

    assert [m.to for m in mail.outbox] == [["owner@example.test"]]
    assert mail.outbox[0].cc == [] and mail.outbox[0].bcc == []
    assert f"meant for {requester.email}" in mail.outbox[0].body
    assert "/reset-password?uid=" in mail.outbox[0].body


@override_settings(
    EMAIL_BACKEND="apps.common.mail.SendOnlyToBackend",
    EMAIL_DELIVERY_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    EMAIL_SEND_ONLY_TO="owner@example.test",
)
def test_send_only_to_leaves_no_other_address_on_the_message():
    from django.core.mail import EmailMultiAlternatives

    original = EmailMultiAlternatives(
        "Hi", "Body", to=["a@example.test"], cc=["b@example.test"], bcc=["c@example.test"],
        reply_to=["d@example.test"], headers={"To": "e@example.test", "Cc": "f@example.test"},
    )
    original.attach_alternative("<p>Body</p>", "text/html")

    original.send()

    sent = mail.outbox[0]
    assert sent.recipients() == ["owner@example.test"]
    headers = {k: v for k, v in sent.message().items()}
    assert headers["To"] == "owner@example.test"
    assert not {"Cc", "Bcc", "Reply-To"} & set(headers)
    assert sent.alternatives
    assert original.to == ["a@example.test"], "the caller's message is left as it was"


# ─── Odd input, the rate limits, and old sessions ───────────────────────────


@pytest.mark.parametrize("body", [
    {"email": 5}, {"email": ["a@example.test"]}, {"email": {"x": 1}}, {"email": True}, {}, ["a"], "text",
])
def test_a_request_that_is_not_an_address_is_refused_not_an_error(api, body):
    assert api.post(REQUEST, body, format="json").status_code == 400


@pytest.mark.parametrize("field, value", [
    ("uid", 5), ("uid", ["MQ"]), ("token", 5), ("token", ["a"]), ("password", 123), ("password", ["x"]),
])
def test_a_confirm_with_a_value_that_is_not_text_is_refused_not_an_error(api, requester, field, value):
    _ask(api, requester.email)
    uid, token = _link(mail.outbox[0])
    body = {"uid": uid, "token": token, "password": NEW, field: value}

    assert api.post(CONFIRM, body, format="json").status_code == 400
    assert _signs_in(api, requester, "pw")


def test_a_confirm_whose_body_is_not_an_object_is_refused(api):
    assert api.post(CONFIRM, ["a"], format="json").status_code == 400


def test_one_network_address_is_limited_whatever_addresses_it_asks_for(api):
    answers = [_ask(api, f"person{n}@example.test").status_code for n in range(21)]

    assert answers[-1] == 429


def test_a_forwarded_for_header_does_not_get_round_the_limit(api):
    answers = [
        api.post(REQUEST, {"email": f"person{n}@example.test"}, format="json", HTTP_X_FORWARDED_FOR=f"10.0.0.{n}").status_code
        for n in range(21)
    ]

    assert answers[-1] == 429


@pytest.mark.parametrize("variant", ["REQUESTER@EXAMPLE.TEST", " requester@example.test", "Requester@Example.Test "])
def test_spellings_of_one_address_share_its_limit(api, requester, variant):
    for _ in range(3):
        _ask(api, requester.email)

    assert _ask(api, variant).status_code == 429


@pytest.mark.parametrize("address", ["requeſter@example.test", "ırene@example.test", "café@example.test"])
def test_an_address_outside_plain_ascii_is_never_matched(address):
    # Postgres folds some of these to ASCII letters, so they would reach a real
    # account under a rate-limit bucket of their own.
    from apps.accounts.password_reset import normalise

    assert normalise(address) == ""


def test_an_address_with_letters_outside_ascii_matches_no_account(api, requester):
    _ask(api, requester.email.replace("s", "ſ"))

    assert mail.outbox == []


def test_an_account_without_a_usable_password_gets_no_link(api, requester):
    requester.set_unusable_password()
    requester.save()

    _ask(api, requester.email)

    assert mail.outbox == []


def test_a_reset_ends_access_tokens_issued_before_it(api, requester):
    access = api.post(LOGIN, {"email": requester.email, "password": "pw"}, format="json").json()["accessToken"]
    _ask(api, requester.email)
    _confirm(api, *_link(mail.outbox[0]))

    api.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    assert api.get("/api/v1/auth/me/").status_code == 401


@pytest.mark.real_thread
def test_the_email_is_sent_after_the_answer_not_before_it(api, requester, monkeypatch):
    import threading
    import time

    sent = threading.Event()

    class Slow:
        def send_messages(self, messages):
            time.sleep(0.5)
            sent.set()

    monkeypatch.setattr("apps.accounts.password_reset.get_connection", lambda: Slow())

    started = time.monotonic()
    response = _ask(api, requester.email)
    took = time.monotonic() - started

    assert response.status_code == 200
    assert took < 0.4 and not sent.is_set()
    assert sent.wait(5)
