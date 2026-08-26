"""The single writer of who holds which post.

A post is recorded twice by design. `RoleAssignment` is what the person is told
they are: label, dashboard, JWT claim. The org FK (`Section.hos`,
`CampusDepartment.head_of_department`, `Department.manager_user`,
`SectionTechnician`) is what `accounts.scope` reads when it decides what they
can see. Two records of one fact only stay consistent while exactly one
function writes both, and this is that function.

Writing only one side produces a supervisor with the title, the dashboard and
the JWT claim, and an empty ticket list, with nothing saying why.

Anything that needs a role written calls `assign_role`. Nothing assigns a
`RoleAssignment` or an org FK directly.

Used by:
    accounts.serializers  assign_role, scope_kwargs_from_ids (the admin API)
    common.seed           assign_role
    tests.factories       assign_role, add_trade
"""

from django.db import transaction

from apps.accounts.models import RoleAssignment
from apps.accounts.scope import SCOPE_FIELD_BY_ROLE


def ensure_requester(user):
    """Guarantee the user has a RoleAssignment, defaulting to `user`.

    Every account has exactly one role and `user` is the floor everyone stands
    on, so this is safe to call unconditionally at account creation. A no-op if
    they already hold something.
    """
    return RoleAssignment.objects.get_or_create(user=user, defaults={"role": "user"})[0]


@transaction.atomic
def assign_role(
    target,
    role,
    *,
    section=None,
    campus_department=None,
    department=None,
    sub_sections=(),
    actor=None,
):
    """Give `target` the post, and make the org structure agree.

    Returns `(role_assignment, displaced)` where `displaced` is the person this
    assignment took a supervisor post off, or None. The caller reports them:
    "you have just demoted Peter" is not something an admin should have to
    infer from a screen that stops mentioning them.

    Scope objects are passed as models, not ids: resolving an id to a row is
    validation, and belongs to the serializer that took it from a client.
    """
    scope = {
        "section": section,
        "campus_department": campus_department,
        "department": department,
    }

    old = (
        RoleAssignment.objects.select_for_update(of=("self",))
        .filter(user=target)
        # `of=("self",)` locks the RoleAssignment row alone. All three scope FKs
        # are nullable, so they join LEFT OUTER, and PostgreSQL refuses FOR
        # UPDATE against the nullable side of an outer join — a bare
        # select_for_update() here made every role assignment 500. The row being
        # replaced is the only one written; the scope objects are read.
        .select_related("section", "campus_department", "department")
        .first()
    )

    if old is not None:
        _revoke(target, old)
        # Replaced, not updated, so assigned_by/assigned_at record who made
        # *this* change rather than the one before it.
        old.delete()

    ra = RoleAssignment.objects.create(
        user=target, role=role, assigned_by=actor, **scope
    )
    displaced = _grant(target, ra, sub_sections, actor)

    # The org FK is written with `.update()` — a queryset write, so the caller's
    # own instance still holds the value it was constructed with. Refreshing it
    # here means `assign_role(user, "hos", section=s)` leaves `s.hos` correct,
    # rather than handing back an object that quietly contradicts the database.
    for obj in scope.values():
        if obj is not None:
            obj.refresh_from_db()

    return ra, displaced


def add_trade(user, section, sub_section):
    """Give a technician one more (campus, trade) pair.

    `RoleAssignment.section` is a single FK, so `assign_role` can only grant
    pairs within the one section it names. A technician who covers Carpentry at
    Nairobi *and* Plumbing at Mombasa is expressible in `SectionTechnician` —
    the row is the pair — but not in their role row, and this is the operation
    that says so out loud rather than reaching into the table from elsewhere.

    Note `assign_role` clears every link a technician holds before granting the
    new ones, so pairs added here do not survive a change of post. That is
    deliberate: someone moved to a different section keeps nothing from the old
    one, and the alternative — links surviving a demotion — is the ghost-scope
    bug in reverse.
    """
    from apps.org.models import SectionTechnician

    link, _ = SectionTechnician.objects.get_or_create(
        user=user, section=section, sub_section=sub_section
    )
    return link


def _revoke(target, old):
    """Strip whatever the previous role granted.

    Unconditional on the old scope, so a technician moving campus does not keep
    the old campus's trade links and a demoted HOS does not stay on their
    section.
    """
    from apps.org.models import (
        CampusDepartment,
        Department,
        Section,
        SectionTechnician,
    )

    if old.role == "hos" and old.section_id:
        Section.objects.filter(pk=old.section_id, hos=target).update(hos=None)
    elif old.role == "hod" and old.campus_department_id:
        CampusDepartment.objects.filter(
            pk=old.campus_department_id, head_of_department=target
        ).update(head_of_department=None)
    elif old.role == "manager" and old.department_id:
        Department.objects.filter(
            pk=old.department_id, manager_user=target
        ).update(manager_user=None)
    elif old.role == "technician":
        SectionTechnician.objects.filter(user=target).delete()


def _grant(target, ra, sub_sections, actor):
    """Write the org FK the new role reads. Returns whoever it displaced."""
    from apps.org.models import (
        CampusDepartment,
        Department,
        Section,
        SectionTechnician,
    )

    if ra.role == "technician":
        # One link per trade — this is where a technician's access actually
        # comes from. The RoleAssignment alone grants them nothing, which is
        # why the write serializer refuses a technician with no sub-sections.
        for sub_section in sub_sections:
            SectionTechnician.objects.get_or_create(
                user=target, section_id=ra.section_id, sub_section=sub_section
            )
        return None

    # One person per supervisor post, so filling it displaces whoever
    # held it. Read the incumbent *before* the update overwrites them.
    holders = {
        "hos": (Section, "pk", ra.section_id, "hos"),
        "hod": (
            CampusDepartment,
            "pk",
            ra.campus_department_id,
            "head_of_department",
        ),
        "manager": (Department, "pk", ra.department_id, "manager_user"),
    }
    post = holders.get(ra.role)
    if post is None:
        return None
    model, key, value, field = post
    if not value:
        return None

    rows = model.objects.filter(**{key: value})
    incumbent_pk = rows.values_list(field, flat=True).first()
    rows.update(**{field: target})

    # Re-assigning someone to the post they already hold is a scope edit, not a
    # displacement — demoting them here would revoke the role being granted.
    if incumbent_pk in (None, target.pk):
        return None

    from django.contrib.auth import get_user_model

    incumbent = get_user_model().objects.filter(pk=incumbent_pk).first()
    if incumbent is None:
        return None
    _demote(incumbent, actor)
    return incumbent


def _demote(incumbent, actor):
    """Drop a displaced supervisor to plain `user`, scope cleared.

    Demoted rather than deleted, so the invariant that every user has exactly
    one RoleAssignment holds. It is deliberately not a guess at what they should
    be instead: if they are moving to another section the admin assigns that
    next, and this simply stops them holding a post that is no longer theirs.
    """
    RoleAssignment.objects.filter(user=incumbent).delete()
    return RoleAssignment.objects.create(user=incumbent, role="user", assigned_by=actor)


def scope_kwargs_from_ids(role, *, campus_id=None, department_id=None, section_id=None):
    """Resolve client-supplied ids to the one scope object `role` requires.

    Raises `LookupError` with a field name and message the caller renders as a
    validation error. The role→field mapping is read from `SCOPE_FIELD_BY_ROLE`,
    never restated: adding a role means adding a row there, not an elif here.
    """
    from apps.org.models import CampusDepartment, Department, Section

    field = SCOPE_FIELD_BY_ROLE.get(role)
    if field is None:
        return {}

    if field == "section":
        if not section_id:
            raise LookupError(("section_id", f"A {role} assignment requires a section."))
        row = Section.objects.filter(pk=section_id).first()
        if row is None:
            raise LookupError(("section_id", "Section not found."))
        return {"section": row}

    if field == "campus_department":
        if not campus_id or not department_id:
            raise LookupError(
                ("campus_id", f"A {role} assignment requires both campus_id and department_id.")
            )
        row = CampusDepartment.objects.filter(
            campus_id=campus_id, department_id=department_id
        ).first()
        if row is None:
            raise LookupError(
                ("campus_id", "No campus-department exists for that campus and department.")
            )
        return {"campus_department": row}

    if field == "department":
        if not department_id:
            raise LookupError(
                ("department_id", f"A {role} assignment requires a department_id.")
            )
        row = Department.objects.filter(pk=department_id).first()
        if row is None:
            raise LookupError(("department_id", "Department not found."))
        return {"department": row}

    raise LookupError((field, f"Unhandled scope field {field!r}."))
