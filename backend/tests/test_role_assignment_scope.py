"""A role and its organisational scope are one fact, checked on every write.

`RoleAssignment.clean()` is the rule; `save()` calls `full_clean()` so there is
no code path — serializer, seed, shell, admin — that can write a half-formed
assignment. A technician with no section, or an admin carrying a department,
does not fail loudly at write time; it fails much later and much quieter, as a
role that reads nothing (`scoped_ticket_qs` finds no matching pair) or reads
past its remit. That is why this is enforced on the model rather than in the
one serializer that happens to be the current front door.

`SCOPE_FIELD_BY_ROLE` is the declaration and this file tests it as data, so a
role added to `ROLE_CHOICES` cannot arrive without a rule.
"""

import pytest
from django.core.exceptions import ValidationError

from apps.accounts.models import SCOPE_FIELD_BY_ROLE, SCOPE_FIELDS, RoleAssignment
from tests import factories

pytestmark = pytest.mark.django_db


@pytest.fixture
def scope_objects(nrb, department, maintenance, nrb_section):
    """One real object per scope FK, so a rule can be satisfied or violated."""
    from apps.org.models import CampusDepartment

    return {
        "section": nrb_section,
        "campus_department": CampusDepartment.objects.get(
            campus=nrb, department=department
        ),
        "department": department,
    }


@pytest.fixture
def unassigned(nrb):
    """A user with no RoleAssignment yet — `make_user` skips it when role=None."""
    return factories.make_user("scope-probe", campus=nrb)


# ── The declaration is complete ───────────────────────────────────────────────


def test_every_role_choice_has_a_scope_rule():
    """`clean()` does a bare `SCOPE_FIELD_BY_ROLE[self.role]`.

    A role added to ROLE_CHOICES and forgotten here raises `KeyError` on every
    save of it — a 500, not a validation error — so the map has to be checked
    against the choices rather than trusted.
    """
    choices = {value for value, _label in RoleAssignment.ROLE_CHOICES}
    assert choices == set(SCOPE_FIELD_BY_ROLE), (
        f"missing a rule: {choices - set(SCOPE_FIELD_BY_ROLE)}; "
        f"rule for a role that does not exist: {set(SCOPE_FIELD_BY_ROLE) - choices}"
    )


def test_every_named_scope_field_is_a_real_nullable_fk():
    for field_name in SCOPE_FIELDS:
        field = RoleAssignment._meta.get_field(field_name)
        assert field.is_relation, f"{field_name} is not a FK"
        assert field.null, f"{field_name} must be nullable — not every role sets it"


def test_the_required_fields_are_drawn_from_the_declared_scope_fields():
    required = {f for f in SCOPE_FIELD_BY_ROLE.values() if f is not None}
    assert required <= set(SCOPE_FIELDS)


# ── The rule holds on save, for every role ────────────────────────────────────


@pytest.mark.parametrize("role,required", sorted(SCOPE_FIELD_BY_ROLE.items()))
def test_a_role_saves_with_exactly_its_own_scope(
    unassigned, scope_objects, role, required
):
    scope = {required: scope_objects[required]} if required else {}
    ra = RoleAssignment.objects.create(user=unassigned, role=role, **scope)
    ra.refresh_from_db()
    assert ra.role == role
    for field in SCOPE_FIELDS:
        expected = scope_objects[field].pk if field == required else None
        assert getattr(ra, f"{field}_id") == expected


@pytest.mark.parametrize(
    "role,required",
    sorted((r, f) for r, f in SCOPE_FIELD_BY_ROLE.items() if f is not None),
)
def test_a_scoped_role_cannot_save_without_its_scope(unassigned, role, required):
    with pytest.raises(ValidationError) as exc:
        RoleAssignment.objects.create(user=unassigned, role=role)
    # Reported against the field, so DRF renders it beside the right input.
    assert required in exc.value.message_dict


@pytest.mark.parametrize(
    "role", sorted(r for r, f in SCOPE_FIELD_BY_ROLE.items() if f is None)
)
@pytest.mark.parametrize("field", SCOPE_FIELDS)
def test_a_scopeless_role_cannot_carry_any_scope(
    unassigned, scope_objects, role, field
):
    """An admin or a plain user with a department is the quiet version of this
    bug: nothing rejects it, and the row now claims a remit the role never had."""
    with pytest.raises(ValidationError):
        RoleAssignment.objects.create(
            user=unassigned, role=role, **{field: scope_objects[field]}
        )


@pytest.mark.parametrize(
    "role,required",
    sorted((r, f) for r, f in SCOPE_FIELD_BY_ROLE.items() if f is not None),
)
def test_a_scoped_role_cannot_carry_a_second_scope(
    unassigned, scope_objects, role, required
):
    """Two scopes is two answers to "what does this person cover"."""
    wrong = next(f for f in SCOPE_FIELDS if f != required)
    with pytest.raises(ValidationError):
        RoleAssignment.objects.create(
            user=unassigned,
            role=role,
            **{required: scope_objects[required], wrong: scope_objects[wrong]},
        )


def test_an_unknown_role_is_rejected_as_a_choice_not_a_crash(unassigned):
    """`choices` catches it before `clean()` reaches the dict lookup."""
    with pytest.raises(ValidationError) as exc:
        RoleAssignment.objects.create(user=unassigned, role="supervisor")
    assert "role" in exc.value.message_dict


# ── The gate is on save, not on the serializer ────────────────────────────────


def test_the_rule_survives_a_later_edit(unassigned, scope_objects):
    """The row was valid when written; clearing its scope must not save."""
    ra = RoleAssignment.objects.create(
        user=unassigned, role="hos", section=scope_objects["section"]
    )
    ra.section = None
    with pytest.raises(ValidationError):
        ra.save()
    ra.refresh_from_db()
    assert ra.section_id == scope_objects["section"].pk


def test_replacing_a_users_role_is_not_blocked_by_their_own_existing_row(
    unassigned, scope_objects
):
    """`save()` passes `validate_unique=False` deliberately.

    The OneToOne on `user` already enforces one-role-per-user at the database.
    Validating it again here would turn every legitimate replace into a
    ValidationError before the delete-and-recreate in `UserRoleAssignmentView`
    ever ran.
    """
    RoleAssignment.objects.create(user=unassigned, role="user")
    RoleAssignment.objects.filter(user=unassigned).delete()
    ra = RoleAssignment.objects.create(
        user=unassigned, role="manager", department=scope_objects["department"]
    )
    assert ra.pk and ra.role == "manager"
