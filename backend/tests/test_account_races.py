"""Account writes that two people can make at once, and input sign-in must survive."""

import pytest
from django.db import IntegrityError, transaction
from django.db.models.query import QuerySet
from django.urls import reverse
from rest_framework import serializers

from apps.accounts import posts
from apps.accounts.models import CustomUser, RoleAssignment
from apps.accounts.password_reset import reset_link, reset_password
from apps.accounts.posts import PostRefused, assign_role
from apps.accounts.serializers import UserCreateSerializer, UserUpdateSerializer
from tests import factories

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize(
    "body",
    [{"email": 7, "password": "pw"}, {"email": ["a@b.c"], "password": "pw"}, ["a@b.c"]],
)
def test_a_login_with_a_value_that_is_not_text_is_refused_not_an_error(api, body):
    response = api.post(reverse("auth-login"), body, format="json")

    assert response.status_code == 400


def test_the_database_holds_one_hos_per_campus(nrb, nrb_hos):
    other = factories.make_user("second.hos", campus=nrb)
    RoleAssignment.objects.filter(user=other).delete()

    with pytest.raises(IntegrityError), transaction.atomic():
        RoleAssignment.objects.create(user=other, role="hos", campus=nrb)


def test_the_database_holds_one_manager(manager):
    other = factories.make_user("second.manager")
    RoleAssignment.objects.filter(user=other).delete()

    with pytest.raises(IntegrityError), transaction.atomic():
        RoleAssignment.objects.create(user=other, role="manager")


def test_a_post_filled_between_the_read_and_the_write_is_refused_cleanly(
    nrb, nrb_hos, monkeypatch
):
    """The read that finds the incumbent ran before the other admin's write landed."""
    newcomer = factories.make_user("new.hos", campus=nrb)
    monkeypatch.setattr(posts, "_holder", lambda *args: None)

    with pytest.raises(PostRefused):
        assign_role(newcomer, "hos", campus=nrb)

    assert RoleAssignment.objects.get(user=nrb_hos).role == "hos"
    assert not RoleAssignment.objects.filter(user=newcomer, role="hos").exists()


def test_saving_the_same_post_again_writes_nothing(nrb, nrb_electrician, electrical):
    before = RoleAssignment.objects.get(user=nrb_electrician)

    _, displaced = assign_role(nrb_electrician, "technician", campus=nrb, trades=[electrical])

    after = RoleAssignment.objects.get(user=nrb_electrician)
    assert displaced is None
    assert (after.pk, after.assigned_at) == (before.pk, before.assigned_at)


def test_a_changed_trade_list_is_still_written(nrb, nrb_electrician, electrical, plumbing):
    assign_role(nrb_electrician, "technician", campus=nrb, trades=[electrical, plumbing])

    assert set(nrb_electrician.technician_trades.values_list("trade_id", flat=True)) == {
        electrical.pk,
        plumbing.pk,
    }


def test_the_database_holds_one_account_per_address_whatever_its_case(requester):
    with pytest.raises(IntegrityError), transaction.atomic():
        CustomUser.objects.create_user(username="copy", email=requester.email.upper())


def test_a_registration_that_loses_the_race_for_an_address_is_a_400(nrb, requester):
    """Validation passed for both; the other account was written first."""
    serializer = UserCreateSerializer()

    with pytest.raises(serializers.ValidationError) as caught:
        serializer.create(
            {"email": requester.email, "password": "a-sturdy-passphrase-9", "campus_id": nrb.pk}
        )

    assert "email" in caught.value.detail


def test_two_sign_ups_deriving_one_username_both_get_an_account(nrb, monkeypatch):
    """The second derived `jane.doe` before the first was saved; it tries again."""
    from apps.accounts import serializers as account_serializers

    factories.make_user("jane.doe", campus=nrb)
    real = account_serializers.identity_from_email
    stale = iter([("jane.doe", "Jane", "Doe")])
    monkeypatch.setattr(
        account_serializers,
        "identity_from_email",
        lambda email, **kw: next(stale, None) or real(email, **kw),
    )

    user = UserCreateSerializer().create(
        {"email": "jane.doe@other.test", "password": "a-sturdy-passphrase-9", "campus_id": nrb.pk}
    )

    assert user.username == "jane.doe1"


def test_an_email_change_that_loses_the_race_is_a_400(requester, msa_requester):
    with pytest.raises(serializers.ValidationError):
        UserUpdateSerializer().update(requester, {"email": msa_requester.email})


def test_a_reset_locks_the_account_row(requester, monkeypatch):
    """Two uses of one link at once: the second waits, then fails the token check."""
    locked = []
    original = QuerySet.select_for_update

    def spy(self, *args, **kwargs):
        locked.append(self.model)
        return original(self, *args, **kwargs)

    monkeypatch.setattr(QuerySet, "select_for_update", spy)
    link = reset_link(requester)
    uid, token = link.split("uid=")[1].split("&token=")

    reset_password(uid, token, "a-sturdy-passphrase-9")

    assert locked == [CustomUser]
