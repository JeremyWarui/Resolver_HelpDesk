"""The demo data has to be believable, or it hides real faults.

Three bugs lived here undetected because nothing asserted anything about the
numbers the seed produces. Each one made every dashboard in the demo show the
same wrong thing, which is the worst case: a uniform failure reads as a design
choice rather than a bug, and a genuine regression becomes invisible against
it.

The seed builds 39 users and 45 tickets, so this module is deliberately one
test with several assertions rather than several tests each re-seeding.
"""


import pytest
from django.core.management import call_command

from apps.tickets.models import Ticket, TicketLog

pytestmark = pytest.mark.django_db


@pytest.fixture
def seeded(monkeypatch):
    monkeypatch.setenv("SEED_DEFAULT_PASSWORD", "test-only-password")
    call_command("seed", verbosity=0)


def test_the_seed_produces_data_a_dashboard_can_be_judged_against(seeded):
    resolved = list(
        Ticket.objects.filter(
            resolved_at__isnull=False, resolution_due_at__isnull=False
        )
    )
    assert resolved, "no resolved tickets — nothing to measure"

    # Resolution time is drawn from each ticket's own SLA window. It used to be
    # a flat 2–72 hours regardless of priority, so a Critical ticket (2h to
    # resolve) nearly always missed: 7% of resolved tickets met their deadline
    # and every gauge in the product read 0%.
    met = sum(1 for t in resolved if t.resolved_at <= t.resolution_due_at)
    rate = met / len(resolved)
    assert 0.5 < rate < 1.0, (
        f"{rate:.0%} of resolved tickets met their SLA — the demo should show "
        "mostly-healthy with a visible minority of breaches, not all of one"
    )

    # TicketLog.created_at is auto_now_add, so a plain create() stamps every
    # log with the moment the seed ran. Response SLA is measured from the first
    # action log against response_due_at, so that put every ticket's first
    # response days after its deadline — 0% response SLA everywhere.
    late = [
        log.ticket.ticket_no
        for log in TicketLog.objects.select_related("ticket")
        if log.created_at < log.ticket.created_at
    ]
    assert late == [], f"logs stamped before their own ticket existed: {late[:5]}"

    creations = TicketLog.objects.filter(event_type="created").select_related("ticket")
    assert creations.exists()
    assert all(
        abs((log.created_at - log.ticket.created_at).total_seconds()) < 60
        for log in creations
    ), "the 'created' log should sit at the ticket's creation, not at seed time"

    # A ticket cannot be confirmed closed before it was fixed. The old flat
    # 73–120h draw did not guarantee this once resolution became SLA-relative.
    out_of_order = [
        t.ticket_no
        for t in Ticket.objects.filter(
            closed_at__isnull=False, resolved_at__isnull=False
        )
        if t.closed_at < t.resolved_at
    ]
    assert out_of_order == [], f"closed before resolved: {out_of_order[:5]}"


def test_every_seeded_account_obeys_the_email_rule(seeded):
    """Demo accounts must be indistinguishable from registered ones (SOT §3a).

    The seed used to invent role-coded usernames (`hos.nrb`) and hang an
    unrelated name on them — a second identity rule the running system cannot
    reproduce, so the demo contradicted the product it was demonstrating.
    """
    from django.contrib.auth import get_user_model

    from apps.accounts.identity import identity_from_email

    wrong = []
    for user in get_user_model().objects.all():
        _, first, last = identity_from_email(user.email, exclude_pk=user.pk)
        expected_username = user.email.split("@")[0].lower()
        if (user.username, user.first_name, user.last_name) != (
            expected_username,
            first,
            last,
        ):
            wrong.append(user.email)
    assert wrong == [], f"seeded accounts not derived from their email: {wrong[:5]}"


def test_the_seed_refuses_to_invent_a_password(monkeypatch):
    """Otherwise a deployment quietly acquires a set of accounts whose password
    is in source control."""
    from django.core.management.base import CommandError

    monkeypatch.delenv("SEED_DEFAULT_PASSWORD", raising=False)
    with pytest.raises(CommandError):
        call_command("seed", verbosity=0)
