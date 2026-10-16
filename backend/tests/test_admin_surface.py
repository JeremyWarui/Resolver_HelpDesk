"""The admin-only account list, which sits outside ticket scope on purpose."""

import pytest
from django.urls import reverse

pytestmark = pytest.mark.django_db


def test_the_account_list_is_admin_only(api, admin_user, nrb_hos):
    """An HOS supervises technicians, not accounts. Reading the roster would
    give them every campus's staff and the post each one holds."""
    url = reverse("user-list")

    api.force_authenticate(nrb_hos)
    assert api.get(url).status_code == 403

    api.force_authenticate(admin_user)
    assert api.get(url).status_code == 200


def test_the_account_list_pages(api, admin_user, nrb, db):
    """The roster pages. An envelope that claims to page and returns the whole
    table arrives in one response every time anyone opens the Users screen.
    """
    from tests import factories

    for n in range(25):
        factories.make_user(f"staffer{n}", campus=nrb)

    api.force_authenticate(admin_user)
    body = api.get(reverse("user-list"), {"page_size": 10}).json()

    assert body["count"] >= 26  # the 25 above, plus the admin
    assert len(body["results"]) == 10
    assert body["next"] is not None


def test_an_account_row_carries_the_post_its_holder_has(
    api,
    admin_user,
    nrb_hos,
    nrb,
):
    """The list is how an admin sees who is what. A row with a name and no role
    is the screen this endpoint exists to draw, minus the only column that
    matters on it."""
    api.force_authenticate(admin_user)
    rows = api.get(reverse("user-list"), {"page_size": 100}).json()["results"]

    row = next(r for r in rows if r["id"] == nrb_hos.pk)
    assert row["role"] == "hos"
    assert row["primary_campus_id"] == nrb.pk
    assert row["home_campus_name"] == nrb.name


def test_there_is_no_cross_ticket_audit_log(api, admin_user):
    """A ticket's history is its own timeline; nothing lists every log row."""
    api.force_authenticate(admin_user)
    assert api.get("/api/v1/admin/audit-log/").status_code == 404
