"""Reference-data reads must not scale their query count with their rows.

Both endpoints here nest a list inside each row, and both declared a
`prefetch_related` that the serializer then threw away by building a fresh
queryset (`.select_related(...)`, `.filter(is_active=True)`) instead of reading
the cache. Nothing failed — the responses were correct, just one query per
department, and two per sub-section on the catalogue the requester's
QuickActions widget loads. Only a query count can see that.
"""

import pytest
from django.urls import reverse

from tests import factories

pytestmark = pytest.mark.django_db


@pytest.fixture
def catalogue(department, maintenance, nrb, msa):
    """Two campuses under one department, three trades, two items each."""
    for campus in (nrb, msa):
        factories.make_campus_department(campus, department)
    for name in ("Electrical", "Plumbing", "Carpentry"):
        sub = factories.make_sub_section(maintenance, name=name)
        factories.make_service_item(sub, f"{name} repair")
        factories.make_service_item(sub, f"{name} inspection")
    return maintenance


def test_department_list_does_not_query_per_department(
    api, django_assert_num_queries, admin_user, catalogue
):
    api.force_authenticate(admin_user)

    # Constant regardless of how many campus links each department has: the
    # page count, the departments, then one query for the prefetched campus
    # links and one for the heads of department they point at.
    with django_assert_num_queries(4):
        response = api.get(reverse("department-list"))

    assert response.status_code == 200
    row = response.json()["results"][0]
    assert len(row["campuses"]) == 2


def test_section_type_list_does_not_query_per_sub_section(
    api, django_assert_num_queries, admin_user, catalogue
):
    api.force_authenticate(admin_user)

    # Three trades with two service items each, still one query for all the
    # sub-sections and one for all the service items.
    with django_assert_num_queries(4):
        response = api.get(reverse("sectiontype-list"))

    assert response.status_code == 200
    row = response.json()["results"][0]
    assert [s["name"] for s in row["sub_sections"]] == [
        "Carpentry",
        "Electrical",
        "Plumbing",
    ]
    assert len(row["sub_sections"][0]["service_items"]) == 2


def test_inactive_catalogue_rows_stay_hidden(api, admin_user, catalogue):
    """The active-only filter moved onto the viewset's Prefetch — prove it
    still filters, rather than having quietly become 'everything'."""
    sub = catalogue.sub_sections.get(name="Plumbing")
    sub.service_items.filter(name="Plumbing inspection").update(is_active=False)
    sub.is_active = False
    sub.save(update_fields=["is_active"])

    api.force_authenticate(admin_user)
    row = api.get(reverse("sectiontype-list")).json()["results"][0]

    names = [s["name"] for s in row["sub_sections"]]
    assert "Plumbing" not in names
    electrical = next(s for s in row["sub_sections"] if s["name"] == "Electrical")
    assert len(electrical["service_items"]) == 2
