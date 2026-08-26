"""`accounts.posts` is the only writer of who holds a post.

A post is recorded twice — the `RoleAssignment` a person is shown, and the org
FK `accounts.scope` actually reads — so the property that matters is not "does
assign_role work" but **do the two records ever disagree**. Every test here is a
form of that question, because every historical bug in this area was the same
shape: a supervisor with the title, the dashboard and the JWT claim, and an
empty ticket list.

`test_every_role_agrees_with_its_org_fk` is the one to keep if the file is ever
cut down. It is parametrised over the role table itself, so a new role with a
new scope FK fails here until it is wired into `posts`, rather than shipping
with a working portal and no tickets.
"""

import pytest

from apps.accounts.models import RoleAssignment
from apps.accounts.posts import add_trade, assign_role, ensure_requester
from apps.accounts.scope import SCOPE_FIELD_BY_ROLE, visible_sections
from apps.org.models import CampusDepartment, Department, Section, SectionTechnician
from apps.tickets.scope import scoped_ticket_qs
from tests import factories

pytestmark = pytest.mark.django_db


def _holder(role, scope_object):
    """Who the org structure currently says holds this post."""
    if role == "hos":
        return Section.objects.get(pk=scope_object.pk).hos_id
    if role == "hod":
        return CampusDepartment.objects.get(pk=scope_object.pk).head_of_department_id
    if role == "manager":
        return Department.objects.get(pk=scope_object.pk).manager_user_id
    raise AssertionError(f"{role} holds no single org FK")


SUPERVISOR_ROLES = ("hos", "hod", "manager")


@pytest.fixture
def scope_objects(nrb_section):
    """One scope object per supervisor role, all on the same campus."""
    return {
        "hos": nrb_section,
        "hod": nrb_section.campus_department,
        "manager": nrb_section.campus_department.department,
    }


# ── The invariant ─────────────────────────────────────────────────────────────


@pytest.mark.parametrize("role", SUPERVISOR_ROLES)
def test_every_role_agrees_with_its_org_fk(role, scope_objects, nrb, db):
    """Granting a post writes both records, so scope and label say the same thing."""
    target = scope_objects[role]
    field = SCOPE_FIELD_BY_ROLE[role]
    user = factories.make_user(f"{role}_holder", campus=nrb)

    assign_role(user, role, **{field: target})

    assert RoleAssignment.objects.get(user=user).role == role
    assert _holder(role, target) == user.pk


@pytest.mark.parametrize("role", SUPERVISOR_ROLES)
def test_demotion_clears_the_org_fk(role, scope_objects, nrb, db):
    """The failure this module was written for: losing the role but keeping the FK
    would leave a requester still reading a section's tickets."""
    target = scope_objects[role]
    user = factories.make_user(f"{role}_holder", campus=nrb)
    assign_role(user, role, **{SCOPE_FIELD_BY_ROLE[role]: target})

    assign_role(user, "user")

    assert RoleAssignment.objects.get(user=user).role == "user"
    assert _holder(role, target) is None
    assert not scoped_ticket_qs(user, role).exists()


@pytest.mark.parametrize("role", SUPERVISOR_ROLES)
def test_filling_a_post_demotes_the_incumbent(role, scope_objects, nrb, db):
    """One person holds a post. The other half of that — the outgoing holder
    losing the role, not just the FK — is what used to be missing."""
    target = scope_objects[role]
    field = SCOPE_FIELD_BY_ROLE[role]
    outgoing = factories.make_user("outgoing", campus=nrb)
    incoming = factories.make_user("incoming", campus=nrb)
    assign_role(outgoing, role, **{field: target})

    _, displaced = assign_role(incoming, role, **{field: target})

    assert displaced == outgoing
    assert RoleAssignment.objects.get(user=outgoing).role == "user"
    assert RoleAssignment.objects.get(user=incoming).role == role
    assert _holder(role, target) == incoming.pk
    assert not scoped_ticket_qs(outgoing, role).exists()


@pytest.mark.parametrize("role", SUPERVISOR_ROLES)
def test_reassigning_the_same_person_is_not_a_displacement(
    role, scope_objects, nrb, db
):
    """A scope edit on the sitting holder must not demote the person it is
    granting the role to."""
    target = scope_objects[role]
    field = SCOPE_FIELD_BY_ROLE[role]
    user = factories.make_user("holder", campus=nrb)
    assign_role(user, role, **{field: target})

    _, displaced = assign_role(user, role, **{field: target})

    assert displaced is None
    assert RoleAssignment.objects.get(user=user).role == role
    assert _holder(role, target) == user.pk


# ── Technicians: the pair is the scope ────────────────────────────────────────


def test_technician_gets_one_link_per_trade(nrb_section, electrical, plumbing, db):
    user = factories.make_user("tech", campus=nrb_section.campus_department.campus)

    assign_role(user, "technician", section=nrb_section, sub_sections=[electrical, plumbing])

    pairs = set(
        SectionTechnician.objects.filter(user=user).values_list(
            "section_id", "sub_section_id"
        )
    )
    assert pairs == {(nrb_section.pk, electrical.pk), (nrb_section.pk, plumbing.pk)}


def test_changing_post_takes_every_trade_link_with_it(
    nrb_section, msa_section, electrical, plumbing, db
):
    """Links are the technician's actual access, so a move must not leave the old
    campus's pairs behind."""
    user = factories.make_user("tech", campus=nrb_section.campus_department.campus)
    assign_role(user, "technician", section=nrb_section, sub_sections=[electrical])
    add_trade(user, msa_section, plumbing)

    assign_role(user, "technician", section=msa_section, sub_sections=[plumbing])

    assert set(
        SectionTechnician.objects.filter(user=user).values_list("section_id", flat=True)
    ) == {msa_section.pk}


def test_demoted_technician_keeps_no_links(nrb_section, electrical, db):
    user = factories.make_user("tech", campus=nrb_section.campus_department.campus)
    assign_role(user, "technician", section=nrb_section, sub_sections=[electrical])

    assign_role(user, "user")

    assert not SectionTechnician.objects.filter(user=user).exists()
    assert not visible_sections(user, "technician").exists()


# ── The scope rule itself ─────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "role,field", sorted((r, f) for r, f in SCOPE_FIELD_BY_ROLE.items() if f)
)
def test_the_role_table_and_the_writer_agree(role, field, scope_objects, nrb_section, db):
    """`SCOPE_FIELD_BY_ROLE` is the declaration; `assign_role` must honour it for
    every row, including any added later."""
    target = scope_objects.get(role, nrb_section)
    user = factories.make_user(f"{role}_x", campus=nrb_section.campus_department.campus)
    extra = {"sub_sections": [factories.make_sub_section(nrb_section.section_type)]}

    ra, _ = assign_role(
        user, role, **{field: target}, **(extra if role == "technician" else {})
    )

    assert getattr(ra, f"{field}_id") == target.pk
    # And nothing else: a role carrying two scopes is a role whose queryset is
    # ambiguous.
    for other in ("section", "campus_department", "department"):
        if other != field:
            assert getattr(ra, f"{other}_id") is None


def test_ensure_requester_is_idempotent_and_never_downgrades(nrb_section, db):
    user = factories.make_user("someone", campus=nrb_section.campus_department.campus)
    assign_role(user, "hos", section=nrb_section)

    ensure_requester(user)

    assert RoleAssignment.objects.get(user=user).role == "hos"
    assert RoleAssignment.objects.filter(user=user).count() == 1
