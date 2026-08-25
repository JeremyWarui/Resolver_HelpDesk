"""One definition of how a person's name is rendered.

`apps/accounts/identity.py::display_name_parts` is that definition. It exists
because a name is not guaranteed — `names_from_email` leaves the surname empty
for a dotless local part like `admin@ksg.ac.ke`, and `createsuperuser` bypasses
the email rule entirely — so every renderer needs the same username fallback or
the UI shows a blank cell where a person should be.

The failure mode is not a crash. Two modules had pasted the expression instead
of importing it, so they agreed with each other right up until one of them was
edited; a name rendered one way in Analytics and another way in the Excel export
of the same numbers is not a bug anyone reports, it is a bug someone quietly
stops trusting the report over.
"""

import pathlib
import re

import pytest

from apps.accounts.identity import display_name, display_name_parts

pytestmark = pytest.mark.django_db


# ── The rule ──────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "first,last,username,expected",
    [
        ("Jeremy", "Mwangi", "jeremy.mwangi", "Jeremy Mwangi"),
        # Dotless email: names_from_email gives a first name and no surname.
        ("Admin", "", "admin", "Admin"),
        # createsuperuser: no names at all, so the username carries the row.
        ("", "", "root", "root"),
        (None, None, "root", "root"),
        # Nothing to show and nothing to fall back to — empty, never "None None".
        ("", "", "", ""),
        (None, None, None, ""),
    ],
)
def test_a_name_is_never_rendered_blank_or_as_none(first, last, username, expected):
    assert display_name_parts(first, last, username) == expected


def test_display_name_is_the_same_rule_for_a_user_object(requester):
    assert display_name(requester) == display_name_parts(
        requester.first_name, requester.last_name, requester.username
    )


def test_display_name_tolerates_no_user():
    """Callers pass `ticket.assigned_to`, which is null on an unassigned ticket."""
    assert display_name(None) == ""


# ── The guard ─────────────────────────────────────────────────────────────────


def test_no_module_joins_a_name_by_hand():
    """If you are rendering a person's name, import it — do not paste the f-string.

    Mirrors `test_no_module_writes_the_status_list_out_by_hand`: the rule is
    cheap to retype and expensive to have two of.
    """
    root = pathlib.Path(__file__).resolve().parent.parent / "apps"
    # Any f-string joining a first name to a last name.
    literal = re.compile(r"first_name[^\n]{0,40}\}\s*\{[^\n]{0,40}last_name")
    offenders = [
        str(path.relative_to(root))
        for path in root.rglob("*.py")
        if "migrations" not in path.parts
        and path.name != "identity.py"
        and literal.search(path.read_text(encoding="utf-8"))
    ]
    assert offenders == [], f"name joined by hand in: {offenders}"


# ── Through the endpoints that had pasted it ──────────────────────────────────


def test_a_technician_with_no_surname_is_named_in_the_trade_mix(
    api, nrb_hos, nrb_section, electrical, nrb_electrical_ticket
):
    """The case the pasted copies and the real rule could disagree on.

    `mwangi@ksg.ac.ke` has no dot, so `last_name` is empty. Both spellings
    handle that identically today — this pins that they still will, through the
    endpoint rather than at the helper.
    """
    from tests import factories

    tech = factories.make_technician("mwangi", nrb_section, [electrical])
    tech.first_name, tech.last_name = "Mwangi", ""
    tech.save(update_fields=["first_name", "last_name"])
    nrb_electrical_ticket.assigned_to = tech
    nrb_electrical_ticket.save(update_fields=["assigned_to"])

    api.force_authenticate(nrb_hos)
    body = api.get("/api/v1/analytics/performance/trade-mix/").json()

    names = {row["name"] for row in body["technicians"]}
    assert "Mwangi" in names, names
