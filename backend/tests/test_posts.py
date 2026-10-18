"""`accounts.posts` is the only writer of who holds a post.

Granting a post grants the scope and losing it takes the scope away,
parametrised over the role table, so a new role fails here until it is wired
into `posts`.
"""

import pytest

from apps.accounts.identity import display_name
from apps.accounts.models import CAMPUS_ROLES, RoleAssignment, TechnicianTrade
from apps.accounts.posts import assign_role
from apps.accounts.scope import post_holder, visible_campuses
from apps.tickets.scope import reporting_ticket_qs, scoped_ticket_qs
from tests import factories

pytestmark = pytest.mark.django_db


SUPERVISOR_ROLES = ("hos", "hod", "manager")


def _scope(role, campus):
    """What a supervisor role is scoped to: a campus, or nothing for a manager."""
    return {"campus": campus} if role in CAMPUS_ROLES else {}


def _holder(role, campus):
    """Who currently holds this post, asked the one way there is to ask."""
    holder = post_holder(role, **_scope(role, campus))
    return holder.pk if holder else None


@pytest.mark.parametrize("role", SUPERVISOR_ROLES)
def test_granting_a_post_grants_its_scope(role, nrb, nrb_electrical_ticket):
    """The label and the access come from the same row, so they cannot disagree."""
    user = factories.make_user(f"{role}_holder", campus=nrb)

    assign_role(user, role, **_scope(role, nrb))

    assert RoleAssignment.objects.get(user=user).role == role
    assert _holder(role, nrb) == user.pk
    assert (
        reporting_ticket_qs(user, role).filter(pk=nrb_electrical_ticket.pk).exists()
    )


@pytest.mark.parametrize("role", SUPERVISOR_ROLES)
def test_demotion_takes_the_scope_with_it(role, nrb, db):
    """Losing the role but keeping the access would leave a requester still
    reading a campus's tickets."""
    user = factories.make_user(f"{role}_holder", campus=nrb)
    assign_role(user, role, **_scope(role, nrb))

    assign_role(user, "user")

    assert RoleAssignment.objects.get(user=user).role == "user"
    assert _holder(role, nrb) is None
    assert not scoped_ticket_qs(user, role).exists()


@pytest.mark.parametrize("role", SUPERVISOR_ROLES)
def test_filling_a_post_demotes_the_incumbent(role, nrb, db):
    """One person holds a post, so filling it takes the role off the outgoing
    holder rather than leaving two.
    """
    outgoing = factories.make_user("outgoing", campus=nrb)
    incoming = factories.make_user("incoming", campus=nrb)
    assign_role(outgoing, role, **_scope(role, nrb))

    _, displaced = assign_role(incoming, role, **_scope(role, nrb))

    assert displaced == outgoing
    assert RoleAssignment.objects.get(user=outgoing).role == "user"
    assert RoleAssignment.objects.get(user=incoming).role == role
    assert _holder(role, nrb) == incoming.pk
    assert not scoped_ticket_qs(outgoing, role).exists()


def test_technician_gets_one_link_per_trade(nrb, electrical, plumbing, db):
    user = factories.make_user("tech", campus=nrb)

    assign_role(user, "technician", campus=nrb, trades=[electrical, plumbing])

    pairs = set(
        TechnicianTrade.objects.filter(user=user).values_list(
            "campus_id", "trade_id"
        )
    )
    assert pairs == {(nrb.pk, electrical.pk), (nrb.pk, plumbing.pk)}


def test_changing_post_takes_every_trade_link_with_it(
    nrb,
    msa,
    electrical,
    plumbing,
    db,
):
    """Links are the technician's actual access, so a move must not leave the old
    campus's pairs behind."""
    user = factories.make_user("tech", campus=nrb)
    assign_role(user, "technician", campus=nrb, trades=[electrical])
    factories.link_technician(user, msa, plumbing)

    assign_role(user, "technician", campus=msa, trades=[plumbing])

    assert set(
        TechnicianTrade.objects.filter(user=user).values_list("campus_id", flat=True)
    ) == {msa.pk}


def test_demoted_technician_keeps_no_links(nrb, electrical, db):
    user = factories.make_user("tech", campus=nrb)
    assign_role(user, "technician", campus=nrb, trades=[electrical])

    assign_role(user, "user")

    assert not TechnicianTrade.objects.filter(user=user).exists()
    assert not visible_campuses(user, "technician").exists()


def test_the_campus_roster_names_its_head(api, admin_user, nrb_hos, nrb):
    """The admin Campuses screen names the head of each campus. It reads the
    roster, not `/campuses/`: the head is a post, so `accounts` answers for it.
    """
    from django.urls import reverse

    api.force_authenticate(admin_user)
    rows = api.get(reverse("campus-roster")).json()["results"]

    row = next(r for r in rows if r["id"] == nrb.pk)
    assert row["hos"] == nrb_hos.pk
    # Fixture users carry no first or last name, so display_name falls back to the
    # username.
    assert row["hos_name"] == display_name(nrb_hos)


def test_a_newly_created_campus_appears_on_the_roster_unstaffed(api, admin_user):
    """Creating a campus is `org`'s job and says nothing about people, so the
    create response carries no post fields. The roster is where a brand-new
    campus reports that it has no head and no technicians yet.
    """
    from django.urls import reverse

    api.force_authenticate(admin_user)
    response = api.post(
        reverse("campus-list"), {"name": "Kisumu", "code": "KSM"}, format="json"
    )
    assert response.status_code == 201, response.content
    assert set(response.json()) == {"id", "name", "code", "location"}

    rows = api.get(reverse("campus-roster")).json()["results"]
    row = next(r for r in rows if r["id"] == response.json()["id"])
    assert row["hos"] is None
    assert row["hos_name"] is None
    assert row["technician_count"] == 0
