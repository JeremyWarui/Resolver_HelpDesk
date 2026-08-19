"""Ticket reads must not fan out into a query per relation.

`ticket_base_qs()` is the single place the relations live. The detail view once
kept its own hand-written `select_related` list, which drifted: it had lost
`sub_section` even though the serializer renders it on every response, and it
never applied the `has_feedback` annotation, so the serializer fell back to an
`.exists()` query per read. Neither cost anything a green `tsc` or a status-code
assertion would notice, which is why this file counts queries instead.
"""

import pytest
from django.urls import reverse

pytestmark = pytest.mark.django_db


def test_ticket_detail_reads_in_a_constant_number_of_queries(
    api, django_assert_num_queries, nrb_hos, nrb_electrical_ticket
):
    api.force_authenticate(nrb_hos)
    url = reverse("ticket-detail", args=[nrb_electrical_ticket.pk])

    # One scope check, one ticket fetch. Every nested field the serializer
    # renders — section, sub_section, priority, service_item, requester,
    # location, feedback — rides along on that second query.
    with django_assert_num_queries(2):
        response = api.get(url)

    assert response.status_code == 200
    body = response.json()
    assert body["sub_section"]["name"]
    assert body["has_feedback"] is False
