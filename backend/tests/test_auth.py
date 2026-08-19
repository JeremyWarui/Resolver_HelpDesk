"""Login, refresh, and the single role each user carries.

Role cover, role switching and multiple simultaneous roles are all gone. The
tests that matter here are the ones proving they stayed gone: a removed
endpoint that quietly comes back is a scope hole nobody notices, because
nothing fails.
"""

import pytest

from apps.accounts.models import RoleAssignment
from apps.common.roles import resolve_role
from apps.org.models import Section
from tests import factories

pytestmark = pytest.mark.django_db


LOGIN = "/api/v1/auth/login/"
ME = "/api/v1/auth/me/"
REFRESH = "/api/v1/auth/refresh/"


# ── Login ─────────────────────────────────────────────────────────────────────


def test_login_returns_a_token_and_the_users_role(api, nrb_hos):
    response = api.post(
        LOGIN, {"email": "nrb_hos@example.test", "password": "pw"}, format="json"
    )
    assert response.status_code == 200, response.json()
    body = response.json()
    assert body["accessToken"]
    assert body["user"]["active_role"]["role"] == "hos"


def test_login_rejects_a_bad_password(api, nrb_hos):
    assert api.post(
        LOGIN, {"email": "nrb_hos@example.test", "password": "wrong"}, format="json"
    ).status_code == 401


def test_login_ignores_the_case_of_the_email(api, nrb_hos):
    """People type their address however their phone capitalises it."""
    response = api.post(
        LOGIN, {"email": "NRB_HOS@Example.Test", "password": "pw"}, format="json"
    )
    assert response.status_code == 200, response.json()


def test_login_no_longer_accepts_a_username(api, nrb_hos):
    """Email is the credential. A username still working would mean two ways in,
    only one of which the login form and its validation know about."""
    response = api.post(LOGIN, {"email": "nrb_hos", "password": "pw"}, format="json")
    assert response.status_code == 401


def test_login_without_an_email_is_a_validation_error(api, nrb_hos):
    response = api.post(LOGIN, {"password": "pw"}, format="json")
    assert response.status_code == 422
    assert "email" in response.json()["error"]["message"]


def test_me_reports_the_current_role(api, nrb_electrician):
    api.force_authenticate(nrb_electrician)
    response = api.get(ME)
    assert response.status_code == 200
    assert response.json()["active_role"]["role"] == "technician"


def test_me_reflects_a_role_change_immediately(api, nrb_electrician, nrb_section):
    """The assignment is re-read from the database rather than taken from the
    token, so an admin's change lands on the next call — not at token expiry."""
    api.force_authenticate(nrb_electrician)
    assert api.get(ME).json()["active_role"]["role"] == "technician"

    RoleAssignment.objects.filter(user=nrb_electrician).delete()
    RoleAssignment.objects.create(
        user=nrb_electrician, role="hos", section=nrb_section
    )

    assert api.get(ME).json()["active_role"]["role"] == "hos"


# ── One role, no switching ────────────────────────────────────────────────────


def test_a_user_can_hold_only_one_role(nrb_electrician, nrb_section):
    """OneToOne — the database refuses a second row rather than leaving two
    assignments for the scope code to pick between."""
    from django.db import IntegrityError, transaction

    with pytest.raises(IntegrityError), transaction.atomic():
        RoleAssignment.objects.create(
            user=nrb_electrician, role="hos", section=nrb_section
        )


def test_me_does_not_offer_a_list_of_roles(api, nrb_electrician):
    """`available_roles` existing again would mean role switching had returned."""
    api.force_authenticate(nrb_electrician)
    assert "available_roles" not in api.get(ME).json()


def test_the_switch_role_endpoint_is_gone(api, nrb_electrician):
    api.force_authenticate(nrb_electrician)
    response = api.post("/api/v1/auth/switch-role/", {}, format="json")
    assert response.status_code == 404


def test_role_assignments_carry_no_validity_window():
    """Cover was time-boxed; without those fields it cannot be reintroduced by
    accident."""
    names = {f.name for f in RoleAssignment._meta.get_fields()}
    assert not names & {"is_primary", "valid_from", "valid_until"}


def test_role_assignment_has_no_activity_helpers():
    for gone in ("is_active", "is_demoted"):
        assert not hasattr(RoleAssignment, gone)


# ── Role resolution ───────────────────────────────────────────────────────────


def test_role_resolves_from_the_jwt_claim_first(api, nrb_electrician):
    """The claim is authoritative for the request; the database is the fallback
    for test clients that never issue a token."""

    class Request:
        auth = {"role": "hos"}
        user = nrb_electrician

    assert resolve_role(Request()) == "hos"


def test_role_falls_back_to_the_assignment_without_a_token(nrb_electrician):
    class Request:
        auth = None
        user = nrb_electrician

    assert resolve_role(Request()) == "technician"


def test_a_user_with_no_assignment_has_no_role(db, nrb):
    roleless = factories.make_user("roleless", campus=nrb)

    class Request:
        auth = None
        user = roleless

    assert resolve_role(Request()) is None


def test_scope_fails_closed_for_a_roleless_user(db, nrb, nrb_electrical_ticket):
    """No role must mean no tickets, never all tickets."""
    from apps.tickets.services.scope import scoped_ticket_qs

    roleless = factories.make_user("roleless2", campus=nrb)
    assert not scoped_ticket_qs(roleless, None).exists()


# ── Registration ──────────────────────────────────────────────────────────────


REGISTER = "/api/v1/auth/register/"


def _register(api, email, campus, password="Str0ngPassphrase!"):
    return api.post(
        REGISTER,
        {"email": email, "password": password, "campus_id": campus.id},
        format="json",
    )


def test_registration_creates_a_plain_requester(api, nrb, db):
    response = _register(api, "new.starter@ksg.ac.ke", nrb)
    assert response.status_code in (200, 201), response.json()
    assert response.json()["user"]["active_role"]["role"] == "user"


def test_registration_derives_the_username_and_name_from_the_email(api, nrb, db):
    """jeremy.mwangi@ksg.ac.ke is username jeremy.mwangi, shown as Jeremy Mwangi.
    Nothing else may set either, so the login and the displayed name cannot drift."""
    response = _register(api, "jeremy.mwangi@ksg.ac.ke", nrb)
    assert response.status_code in (200, 201), response.json()
    user = response.json()["user"]
    assert user["username"] == "jeremy.mwangi"
    assert (user["first_name"], user["last_name"]) == ("Jeremy", "Mwangi")


def test_registration_ignores_client_supplied_names(api, nrb, db):
    """A name posted alongside the email must not win — the email is the identity."""
    response = api.post(
        REGISTER,
        {
            "email": "jane.doe@ksg.ac.ke",
            "password": "Str0ngPassphrase!",
            "campus_id": nrb.id,
            "first_name": "Impostor",
            "last_name": "Name",
            "username": "impostor",
        },
        format="json",
    )
    assert response.status_code in (200, 201), response.json()
    user = response.json()["user"]
    assert user["username"] == "jane.doe"
    assert user["first_name"] == "Jane"


def test_registration_without_a_dot_leaves_the_last_name_empty(api, nrb, db):
    """Better an empty surname than one invented from half a first name."""
    response = _register(api, "jmwangi@ksg.ac.ke", nrb)
    assert response.status_code in (200, 201), response.json()
    user = response.json()["user"]
    assert user["username"] == "jmwangi"
    assert (user["first_name"], user["last_name"]) == ("Jmwangi", "")


def test_the_same_name_at_another_domain_gets_a_numbered_username(api, nrb, db):
    """Emails are unique; local parts are not. Without the suffix the second
    person could not register at all."""
    assert _register(api, "sam.kip@ksg.ac.ke", nrb).status_code in (200, 201)
    response = _register(api, "sam.kip@gmail.com", nrb)
    assert response.status_code in (200, 201), response.json()
    assert response.json()["user"]["username"] == "sam.kip1"


def test_registration_rejects_an_email_already_in_use(api, nrb, db):
    assert _register(api, "dup.user@ksg.ac.ke", nrb).status_code in (200, 201)
    assert _register(api, "DUP.USER@ksg.ac.ke", nrb).status_code == 409


def test_registration_rejects_a_malformed_email(api, nrb, db):
    assert _register(api, "not-an-email", nrb).status_code == 422


def test_a_registered_user_can_sign_in_with_their_email(api, nrb, db):
    """The whole point of the change: what you register with is what you log in
    with, without ever being told a username."""
    assert _register(api, "log.inagain@ksg.ac.ke", nrb).status_code in (200, 201)
    response = api.post(
        LOGIN,
        {"email": "log.inagain@ksg.ac.ke", "password": "Str0ngPassphrase!"},
        format="json",
    )
    assert response.status_code == 200, response.json()


def test_an_admin_created_account_takes_its_username_from_the_email(
    api, admin_user, nrb
):
    """Admin creation and self-registration must answer "what is this person's
    username" the same way, or the same address means two different logins."""
    api.force_authenticate(admin_user)
    response = api.post(
        "/api/v1/users/",
        {
            "email": "grace.wanjiru@ksg.ac.ke",
            "password": "Str0ngPassphrase!",
            "campus_id": nrb.id,
        },
        format="json",
    )
    assert response.status_code == 201, response.json()
    body = response.json()
    assert body["username"] == "grace.wanjiru"
    assert (body["first_name"], body["last_name"]) == ("Grace", "Wanjiru")


def test_admin_creation_ignores_a_posted_name(api, admin_user, nrb):
    """There is no override anywhere. A name accepted here would be a second
    answer to who someone is, which is what deriving from the email removes."""
    api.force_authenticate(admin_user)
    response = api.post(
        "/api/v1/users/",
        {
            "email": "jkamau@ksg.ac.ke",
            "password": "Str0ngPassphrase!",
            "campus_id": nrb.id,
            "first_name": "Joseph",
            "last_name": "Kamau",
            "username": "joseph",
        },
        format="json",
    )
    assert response.status_code == 201, response.json()
    body = response.json()
    assert body["username"] == "jkamau"
    assert (body["first_name"], body["last_name"]) == ("Jkamau", "")


def test_changing_the_email_renames_the_account(api, admin_user, nrb, db):
    """The email is the identity, so moving address moves the name and username
    with it — otherwise an account keeps a name its address no longer supports."""
    api.force_authenticate(admin_user)
    created = api.post(
        "/api/v1/users/",
        {
            "email": "jmwangi@ksg.ac.ke",
            "password": "Str0ngPassphrase!",
            "campus_id": nrb.id,
        },
        format="json",
    ).json()

    response = api.patch(
        f"/api/v1/users/{created['id']}/",
        {"email": "jeremy.mwangi@ksg.ac.ke"},
        format="json",
    )
    assert response.status_code == 200, response.json()
    body = response.json()
    assert body["username"] == "jeremy.mwangi"
    assert (body["first_name"], body["last_name"]) == ("Jeremy", "Mwangi")


def test_a_name_cannot_be_edited_on_its_own(api, admin_user, nrb, db):
    """Without the email changing there is nothing to derive from, so the PATCH
    is a no-op rather than a back door to a hand-set name."""
    api.force_authenticate(admin_user)
    created = api.post(
        "/api/v1/users/",
        {
            "email": "ann.otieno@ksg.ac.ke",
            "password": "Str0ngPassphrase!",
            "campus_id": nrb.id,
        },
        format="json",
    ).json()

    response = api.patch(
        f"/api/v1/users/{created['id']}/",
        {"first_name": "Impostor", "last_name": "Name"},
        format="json",
    )
    assert response.status_code == 200, response.json()
    assert response.json()["first_name"] == "Ann"


def test_a_renamed_account_signs_in_with_the_new_email(api, admin_user, nrb, db):
    """Re-deriving the username must not lock anyone out — the credential is the
    address, and it is the address that changed."""
    api.force_authenticate(admin_user)
    created = api.post(
        "/api/v1/users/",
        {
            "email": "old.address@ksg.ac.ke",
            "password": "Str0ngPassphrase!",
            "campus_id": nrb.id,
        },
        format="json",
    ).json()
    api.patch(
        f"/api/v1/users/{created['id']}/",
        {"email": "new.address@ksg.ac.ke"},
        format="json",
    )
    api.force_authenticate(None)

    response = api.post(
        LOGIN,
        {"email": "new.address@ksg.ac.ke", "password": "Str0ngPassphrase!"},
        format="json",
    )
    assert response.status_code == 200, response.json()


def test_anyone_may_list_campuses_before_logging_in(api, nrb, msa):
    """The registration form needs them, and a campus list is not a secret."""
    response = api.get("/api/v1/auth/campuses/")
    assert response.status_code == 200
    assert {row["code"] for row in response.json()} >= {"NRB", "MSA"}


def test_me_requires_authentication(api):
    assert api.get(ME).status_code == 401


# ── Role assignment (admin) ───────────────────────────────────────────────────


def _assign_role(api, user, **scope):
    return api.post(
        f"/api/v1/users/{user.id}/role-assignments/",
        {"role": scope.pop("role"), **scope},
        format="json",
    )


def test_admin_can_promote_a_requester_to_hos(
    api, admin_user, requester, nrb, department, nrb_section
):
    """The whole point of the endpoint, and it was returning 500.

    The view locks the row it is about to replace with `select_for_update()`,
    while `select_related()`-ing three *nullable* scope FKs. Those join LEFT
    OUTER, and PostgreSQL refuses `FOR UPDATE` against the nullable side of an
    outer join — so every promotion made through the admin UI died with
    `NotSupportedError`, with nothing in the suite to catch it. The seed writes
    RoleAssignment rows straight through the ORM, so it never went near this
    path either.
    """
    api.force_authenticate(admin_user)
    response = _assign_role(
        api,
        requester,
        role="hos",
        campus_id=nrb.id,
        department_id=department.id,
        section_id=nrb_section.id,
    )

    assert response.status_code == 201, response.json()
    ra = RoleAssignment.objects.get(user=requester)
    assert ra.role == "hos"
    assert ra.section_id == nrb_section.id


def test_promoting_replaces_the_single_role_rather_than_adding_one(
    api, admin_user, requester, nrb, department, nrb_section
):
    """One row per user is the invariant; a promotion must not leave two."""
    api.force_authenticate(admin_user)
    for _ in range(2):
        assert _assign_role(
            api,
            requester,
            role="hos",
            campus_id=nrb.id,
            department_id=department.id,
            section_id=nrb_section.id,
        ).status_code == 201

    assert RoleAssignment.objects.filter(user=requester).count() == 1


def test_only_an_admin_may_assign_a_role(api, nrb_hos, requester, nrb, nrb_section):
    """An HOS promoting people would be an escalation path around the org chart."""
    api.force_authenticate(nrb_hos)
    response = _assign_role(
        api, requester, role="hos", campus_id=nrb.id, section_id=nrb_section.id
    )
    assert response.status_code == 403
    assert RoleAssignment.objects.get(user=requester).role == "user"


def test_displacing_a_section_head_demotes_the_one_who_held_it(
    api, admin_user, requester, nrb_hos, nrb, department, nrb_section
):
    """The defect SOT §3b recorded: displacement was doing only half the job.

    `_sync_org_scope` overwrote `Section.hos` and left the old holder's
    RoleAssignment alone, so they kept the HOS label, the HOS portal and the HOS
    JWT claim while `scoped_ticket_qs` — which reads the structural FK — showed
    them nothing. This asserts both halves now agree: the post moves, and the
    person who lost it is a plain requester with no scope left over.
    """
    assert Section.objects.get(pk=nrb_section.pk).hos_id == nrb_hos.id

    api.force_authenticate(admin_user)
    response = _assign_role(
        api,
        requester,
        role="hos",
        campus_id=nrb.id,
        department_id=department.id,
        section_id=nrb_section.id,
    )
    assert response.status_code == 201, response.json()

    # The post moved.
    assert Section.objects.get(pk=nrb_section.pk).hos_id == requester.id

    # And the incumbent is not still labelled its head.
    old = RoleAssignment.objects.get(user=nrb_hos)
    assert old.role == "user"
    assert old.section_id is None
    assert old.campus_department_id is None
    assert old.department_id is None


def test_the_displacement_is_reported_to_the_admin_who_caused_it(
    api, admin_user, requester, nrb_hos, nrb, department, nrb_section
):
    """An admin filling a post rarely knows who was in it, and demoting someone
    is a larger change than the one they asked for. Silence here is how a
    section head finds out by opening an empty dashboard."""
    api.force_authenticate(admin_user)
    body = _assign_role(
        api,
        requester,
        role="hos",
        campus_id=nrb.id,
        department_id=department.id,
        section_id=nrb_section.id,
    ).json()

    assert body["displaced"]["id"] == nrb_hos.id
    assert body["displaced"]["email"] == nrb_hos.email


def test_reassigning_the_holder_to_their_own_post_does_not_demote_them(
    api, admin_user, nrb_hos, nrb, department, nrb_section
):
    """A scope edit is not a displacement. Reading the incumbent and demoting
    them unconditionally would revoke the very role being granted — the update
    sets `hos` to the same person, so without the identity check they would be
    demoted a moment after being promoted."""
    api.force_authenticate(admin_user)
    body = _assign_role(
        api,
        nrb_hos,
        role="hos",
        campus_id=nrb.id,
        department_id=department.id,
        section_id=nrb_section.id,
    ).json()

    assert "displaced" not in body
    assert RoleAssignment.objects.get(user=nrb_hos).role == "hos"
    assert Section.objects.get(pk=nrb_section.pk).hos_id == nrb_hos.id


def test_an_empty_post_displaces_nobody(
    api, admin_user, requester, nrb, department, nrb_section
):
    """A vacant seat is the common case for a new section, and must not trip
    the demotion path."""
    Section.objects.filter(pk=nrb_section.pk).update(hos=None)

    api.force_authenticate(admin_user)
    body = _assign_role(
        api,
        requester,
        role="hos",
        campus_id=nrb.id,
        department_id=department.id,
        section_id=nrb_section.id,
    ).json()

    assert "displaced" not in body
    assert Section.objects.get(pk=nrb_section.pk).hos_id == requester.id
