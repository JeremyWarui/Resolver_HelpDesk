"""The escalation check as a scheduled job: each run recorded, a preview that
writes nothing, and the admin's view of whether the schedule is alive."""

from datetime import timedelta

import pytest
from django.core.management import call_command
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone

from apps.accounts.identity import display_name
from apps.notifications.models import Notification
from apps.tickets import escalation
from apps.tickets.models import EscalationRun, Ticket, TicketLog
from tests import factories

pytestmark = pytest.mark.django_db

STATUS, PREVIEW, RUN = "escalation-status", "escalation-preview", "escalation-run"


def _due_for_hos(ticket):
    return factories.age_ticket(ticket, minutes=ticket.priority.escalate_to_hos_minutes + 1)


def _due_for_hod(ticket):
    return factories.age_ticket(ticket, minutes=ticket.priority.escalate_to_hod_minutes + 1)


@pytest.fixture
def two_due(nrb_electrical_ticket, nrb_plumbing_ticket, nrb_hos, nrb_hod):
    """One ticket due to climb to the HOS, one already with the HOS and due for the HOD."""
    _due_for_hos(nrb_electrical_ticket)
    Ticket.objects.filter(pk=nrb_plumbing_ticket.pk).update(current_level="hos")
    _due_for_hod(nrb_plumbing_ticket)
    return nrb_electrical_ticket, nrb_plumbing_ticket


# ─── A run ──────────────────────────────────────────────────────────────────


def test_the_scheduled_command_records_a_run_by_level(two_due):
    call_command("process_auto_escalations", "--scheduled")

    run = EscalationRun.objects.get()
    assert (run.scheduled, run.started_by, run.to_hos, run.to_hod, run.error) == (True, None, 1, 1, "")
    assert run.finished_at is not None
    levels = set(Ticket.objects.filter(pk__in=[t.pk for t in two_due]).values_list("current_level", flat=True))
    assert levels == {"hos", "hod"}


def test_a_run_with_nothing_due_is_still_recorded(nrb_electrical_ticket, nrb_hos):
    call_command("process_auto_escalations")

    run = EscalationRun.objects.get()
    assert (run.to_hos, run.to_hod) == (0, 0) and run.finished_at is not None


def test_a_second_run_moves_nothing_already_moved(two_due):
    call_command("process_auto_escalations")
    call_command("process_auto_escalations")

    second = EscalationRun.objects.first()
    assert (second.to_hos, second.to_hod) == (0, 0)
    assert TicketLog.objects.filter(event_type="escalated").count() == 2


def test_a_ticket_that_fails_is_skipped_and_named_and_the_rest_still_climb(monkeypatch, two_due):
    real = escalation._escalate
    bad = two_due[0].pk

    def fails_on_one(ticket, now):
        if ticket.pk == bad:
            raise RuntimeError("priority missing")
        return real(ticket, now)

    monkeypatch.setattr(escalation, "_escalate", fails_on_one)

    run = escalation.record_run()

    assert run.finished_at is not None
    assert run.error == f"ticket {bad}: RuntimeError: priority missing"
    assert (run.to_hos, run.to_hod) == (0, 1)
    assert Ticket.objects.get(pk=bad).current_level == "technician"
    assert Ticket.objects.get(pk=two_due[1].pk).current_level == "hod"


def test_a_run_that_cannot_start_keeps_its_error_and_raises(monkeypatch, two_due):
    def broken():
        raise RuntimeError("database went away")

    monkeypatch.setattr(escalation, "_candidates", broken)

    with pytest.raises(RuntimeError):
        call_command("process_auto_escalations")

    run = EscalationRun.objects.get()
    assert (run.finished_at, run.error) == (None, "RuntimeError: database went away")


def test_a_run_overlapping_another_leaves_a_ticket_it_moved_to_the_next_run(
    nrb_electrical_ticket, nrb_hos, nrb_hod
):
    # Past both thresholds: one run takes it to the HOS. A second run that read
    # its candidates before the first moved it must not take it on to the HOD.
    factories.age_ticket(nrb_electrical_ticket, minutes=nrb_electrical_ticket.priority.escalate_to_hod_minutes + 1)
    now = timezone.now()
    read_early = escalation._candidates()

    first = list(escalation._escalate_candidates(escalation._candidates(), now))
    second = list(escalation._escalate_candidates(read_early, now))

    assert [(before, after) for _, before, after in first] == [("technician", "hos")]
    assert second == []
    assert TicketLog.objects.filter(event_type="escalated").count() == 1


def test_a_run_locks_each_ticket_it_reads(monkeypatch, two_due):
    from django.db.models import QuerySet

    real = QuerySet.select_for_update
    locked = []

    def spy(self, *args, **kwargs):
        locked.append(self.model.__name__)
        return real(self, *args, **kwargs)

    monkeypatch.setattr(QuerySet, "select_for_update", spy)

    escalation.record_run()

    assert locked.count("Ticket") == 2


def test_a_tally_commits_with_its_move_or_not_at_all(monkeypatch, two_due):
    # The tally is saved inside the move's transaction: if it fails, the move
    # rolls back with it rather than landing uncounted, and a later tally
    # counts only what landed.
    real = escalation._tally
    calls = []

    def first_fails(run_pk, level):
        calls.append(level)
        if len(calls) == 1:
            raise RuntimeError("tally lost")
        return real(run_pk, level)

    monkeypatch.setattr(escalation, "_tally", first_fails)

    run = escalation.record_run()

    stored = EscalationRun.objects.get()
    moved = TicketLog.objects.filter(event_type="escalated").count()
    assert moved == 1
    assert stored.to_hos + stored.to_hod == moved == run.to_hos + run.to_hod


def test_a_failing_notification_never_stops_the_run(monkeypatch, two_due):
    from apps.notifications import notify

    def broken(ticket):
        raise RuntimeError("template missing")

    monkeypatch.setattr(notify, "_service", broken)

    run = escalation.record_run()

    assert (run.to_hos, run.to_hod, run.error) == (1, 1, "")
    assert set(Ticket.objects.values_list("current_level", flat=True)) == {"hos", "hod"}


def test_the_preview_runs_no_write_and_takes_no_lock(monkeypatch, two_due):
    from django.db import connection
    from django.db.models import QuerySet
    from django.test.utils import CaptureQueriesContext

    # SQLite leaves FOR UPDATE out of its SQL, so the lock is caught where it is asked for.
    def refuse(self, *args, **kwargs):
        raise AssertionError("row lock taken")

    monkeypatch.setattr(QuerySet, "select_for_update", refuse)

    with CaptureQueriesContext(connection) as queries:
        assert len(escalation.preview()) == 2

    sql = [q["sql"].upper() for q in queries.captured_queries]
    assert not [q for q in sql if q.startswith(("INSERT", "UPDATE", "DELETE")) or "FOR UPDATE" in q]


def test_a_run_killed_part_way_still_says_what_it_moved(monkeypatch, two_due):
    real = escalation._escalate
    calls = []

    def killed_second(ticket, now):
        calls.append(ticket.pk)
        if len(calls) == 2:
            raise KeyboardInterrupt  # what the process sees when the task is stopped
        return real(ticket, now)

    monkeypatch.setattr(escalation, "_escalate", killed_second)

    with pytest.raises(KeyboardInterrupt):
        escalation.record_run()

    run = EscalationRun.objects.get()
    assert (run.to_hos + run.to_hod, run.finished_at, run.error) == (1, None, "")


# ─── The preview ────────────────────────────────────────────────────────────


def test_the_preview_lists_what_would_move_and_writes_nothing(two_due):
    notes_before = Notification.objects.count()

    moves = escalation.preview()

    assert sorted((t.ticket_no, before, after) for t, before, after in moves) == sorted([
        (two_due[0].ticket_no, "technician", "hos"),
        (two_due[1].ticket_no, "hos", "hod"),
    ])
    assert set(Ticket.objects.values_list("current_level", flat=True)) == {"technician", "hos"}
    assert not TicketLog.objects.filter(event_type="escalated").exists()
    assert Notification.objects.count() == notes_before
    assert not EscalationRun.objects.exists()


def test_the_preview_moves_exactly_what_the_run_then_moves(two_due):
    predicted = sorted((t.pk, after) for t, _, after in escalation.preview())
    run = escalation.record_run()

    moved = sorted(
        (log.ticket_id, log.to_value) for log in TicketLog.objects.filter(event_type="escalated")
    )
    assert moved == predicted
    assert (run.to_hos, run.to_hod) == (1, 1)


def test_the_dry_run_command_writes_nothing_and_names_the_tickets(capsys, two_due):
    call_command("process_auto_escalations", "--dry-run")

    out = capsys.readouterr().out
    assert f"{two_due[0].ticket_no}: technician -> hos" in out
    assert "2 ticket(s) would escalate" in out
    assert not EscalationRun.objects.exists()


# ─── Whether the schedule is alive ──────────────────────────────────────────


def test_a_check_that_has_never_run_says_so(db):
    assert escalation.schedule_state() == ("never", None)


@override_settings(ESCALATION_INTERVAL_MINUTES=15)
def test_the_schedule_is_running_until_four_intervals_pass_without_a_run(db):
    when = timezone.now() - timedelta(minutes=59)
    run = EscalationRun.objects.create(scheduled=True, started_at=when, finished_at=when)
    assert escalation.schedule_state() == ("running", run)

    when = timezone.now() - timedelta(minutes=61)
    EscalationRun.objects.filter(pk=run.pk).update(started_at=when, finished_at=when)
    assert escalation.schedule_state()[0] == "stale"


def test_a_schedule_whose_latest_run_failed_is_failing_not_stopped(db):
    ok = EscalationRun.objects.create(scheduled=True, started_at=timezone.now() - timedelta(minutes=30), finished_at=timezone.now())
    EscalationRun.objects.create(scheduled=True, error="RuntimeError: boom")

    assert escalation.schedule_state() == ("failing", ok)


def test_a_success_after_a_failure_brings_the_schedule_back(db):
    EscalationRun.objects.create(scheduled=True, started_at=timezone.now() - timedelta(minutes=30), error="RuntimeError: boom")
    ok = EscalationRun.objects.create(scheduled=True, finished_at=timezone.now())

    assert escalation.schedule_state() == ("running", ok)


@override_settings(ESCALATION_INTERVAL_MINUTES=15)
def test_a_run_killed_at_its_time_limit_makes_the_schedule_failing(db):
    # IgnoreNew holds the next start until the hung run is stopped at four
    # intervals; the run after it is in progress when the admin looks.
    now = timezone.now()
    ok = EscalationRun.objects.create(scheduled=True, started_at=now - timedelta(hours=2), finished_at=now - timedelta(hours=2))
    EscalationRun.objects.create(scheduled=True, started_at=now - timedelta(minutes=70))
    EscalationRun.objects.create(scheduled=True, started_at=now - timedelta(minutes=5))

    assert escalation.schedule_state() == ("failing", ok)


def test_a_finished_run_that_skipped_a_ticket_makes_the_schedule_failing(db):
    run = EscalationRun.objects.create(scheduled=True, finished_at=timezone.now(), error="ticket 7: RuntimeError: x")

    assert escalation.schedule_state() == ("failing", run)


@override_settings(ESCALATION_INTERVAL_MINUTES=15)
def test_an_old_killed_run_does_not_keep_the_schedule_failing(db):
    now = timezone.now()
    EscalationRun.objects.create(scheduled=True, started_at=now - timedelta(days=3))
    good = EscalationRun.objects.create(scheduled=True, started_at=now - timedelta(minutes=10), finished_at=now - timedelta(minutes=10))
    EscalationRun.objects.create(scheduled=True, started_at=now - timedelta(minutes=1))

    assert escalation.schedule_state() == ("running", good)


@override_settings(ESCALATION_INTERVAL_MINUTES=15)
def test_a_schedule_that_failed_and_then_stopped_is_stale_not_failing(db):
    now = timezone.now()
    last = EscalationRun.objects.create(scheduled=True,
        started_at=now - timedelta(days=3), finished_at=now - timedelta(days=3), error="ticket 1: X",
    )

    assert escalation.schedule_state() == ("stale", last)


def test_a_run_typed_at_the_command_line_is_not_the_schedule(two_due):
    call_command("process_auto_escalations")

    run = EscalationRun.objects.get()
    assert (run.scheduled, run.to_hos + run.to_hod) == (False, 2)
    assert escalation.schedule_state() == ("never", None)


def test_a_skipped_ticket_is_named_before_a_kill_can_lose_it(monkeypatch, two_due):
    real = escalation._escalate
    calls = []

    def skip_then_killed(ticket, now):
        calls.append(ticket.pk)
        if len(calls) == 1:
            raise RuntimeError("priority missing")
        raise KeyboardInterrupt

    monkeypatch.setattr(escalation, "_escalate", skip_then_killed)

    with pytest.raises(KeyboardInterrupt):
        escalation.record_run(scheduled=True)

    run = EscalationRun.objects.get()
    assert run.finished_at is None
    assert run.error == f"ticket {calls[0]}: RuntimeError: priority missing"


def test_a_run_now_never_sets_the_schedule_state(admin_user):
    now = timezone.now()
    assert escalation.schedule_state() == ("never", None)

    EscalationRun.objects.create(started_by=admin_user, finished_at=now)
    assert escalation.schedule_state() == ("never", None)

    old = EscalationRun.objects.create(scheduled=True, started_at=now - timedelta(hours=3), finished_at=now - timedelta(hours=3))
    EscalationRun.objects.create(started_by=admin_user, started_at=now, finished_at=now)
    assert escalation.schedule_state() == ("stale", old)


def test_a_schedule_that_ran_and_stopped_is_stale_even_if_no_run_ever_finished(db):
    EscalationRun.objects.create(scheduled=True, started_at=timezone.now() - timedelta(hours=3), error="RuntimeError: x")

    assert escalation.schedule_state() == ("stale", None)


def test_the_first_run_still_going_is_running(db):
    EscalationRun.objects.create(scheduled=True)

    assert escalation.schedule_state() == ("running", None)


# ─── The admin's endpoints ──────────────────────────────────────────────────


@pytest.mark.parametrize("who", ["manager", "nrb_hod", "nrb_hos", "nrb_electrician", "requester"])
@pytest.mark.parametrize("name,method", [(STATUS, "get"), (PREVIEW, "get"), (RUN, "post")])
def test_only_the_admin_reaches_the_escalation_check(api, request, who, name, method):
    api.force_authenticate(request.getfixturevalue(who))
    assert getattr(api, method)(reverse(name)).status_code == 403
    assert not EscalationRun.objects.exists()


@pytest.mark.parametrize("name,method", [(STATUS, "get"), (PREVIEW, "get"), (RUN, "post")])
def test_the_escalation_check_needs_a_login(api, name, method):
    assert getattr(api, method)(reverse(name)).status_code == 401


def test_the_status_says_what_is_due_and_lists_recent_runs(api, admin_user, two_due):
    api.force_authenticate(admin_user)

    before = api.get(reverse(STATUS)).json()
    assert (before["state"], before["last_run"], before["runs"]) == ("never", None, [])
    assert before["due"] == {"hos": 1, "hod": 1}
    assert before["interval_minutes"] == 15 and before["stale_after_minutes"] == 60

    escalation.record_run(scheduled=True)
    after = api.get(reverse(STATUS)).json()
    assert after["state"] == "running"
    assert after["due"] == {"hos": 0, "hod": 0}
    assert (after["last_run"]["to_hos"], after["last_run"]["to_hod"], after["last_run"]["started_by"]) == (1, 1, None)
    assert len(after["runs"]) == 1


def test_the_status_lists_ten_runs_newest_first(api, admin_user):
    for minutes in range(12):
        EscalationRun.objects.create(scheduled=True, started_at=timezone.now() - timedelta(minutes=minutes), finished_at=timezone.now())
    api.force_authenticate(admin_user)

    runs = api.get(reverse(STATUS)).json()["runs"]

    assert len(runs) == 10
    assert runs == sorted(runs, key=lambda r: r["started_at"], reverse=True)


def test_the_preview_endpoint_names_each_ticket_and_writes_nothing(api, admin_user, two_due):
    api.force_authenticate(admin_user)

    data = api.get(reverse(PREVIEW)).json()

    assert data["count"] == 2
    assert {(t["ticket_no"], t["from_level"], t["to_level"], t["campus"]) for t in data["tickets"]} == {
        (two_due[0].ticket_no, "technician", "hos", "Nairobi"),
        (two_due[1].ticket_no, "hos", "hod", "Nairobi"),
    }
    assert not TicketLog.objects.filter(event_type="escalated").exists()


@override_settings(ESCALATION_INTERVAL_MINUTES=15)
def test_each_run_says_how_it_ended(api, admin_user):
    now = timezone.now()
    EscalationRun.objects.create(scheduled=True,
        started_at=now - timedelta(minutes=95), finished_at=now - timedelta(minutes=94), error="ticket 7: x",
    )
    EscalationRun.objects.create(scheduled=True, started_at=now - timedelta(minutes=90), finished_at=now - timedelta(minutes=89))
    EscalationRun.objects.create(scheduled=True, started_at=now - timedelta(minutes=80), error="RuntimeError: boom")
    EscalationRun.objects.create(scheduled=True, started_at=now - timedelta(minutes=61))  # four intervals: stopped
    EscalationRun.objects.create(scheduled=True, started_at=now - timedelta(minutes=50))  # still going, short of the limit
    api.force_authenticate(admin_user)

    outcomes = [r["outcome"] for r in api.get(reverse(STATUS)).json()["runs"]]

    assert outcomes == ["running", "did_not_finish", "failed", "finished", "failed"]


def test_run_now_records_the_admin_who_started_it(api, admin_user, two_due):
    api.force_authenticate(admin_user)

    response = api.post(reverse(RUN))

    assert response.status_code == 201
    row = response.json()
    assert (row["to_hos"], row["to_hod"]) == (1, 1)
    assert row["started_by"] == display_name(admin_user)
    assert EscalationRun.objects.get().started_by == admin_user
