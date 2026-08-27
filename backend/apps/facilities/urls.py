"""Facility routes, included by resolver/api_urls.py under /api/v1/."""

from django.urls import path
from rest_framework.routers import SimpleRouter

from apps.facilities.views import FacilityTypeViewSet, FacilityViewSet

router = SimpleRouter()
router.register("facilities", FacilityViewSet, basename="facility")

urlpatterns = router.urls + [
    # List only: nothing fetches a facility type by id.
    path(
        "facility-types/",
        FacilityTypeViewSet.as_view({"get": "list"}),
        name="facilitytype-list",
    ),
]
