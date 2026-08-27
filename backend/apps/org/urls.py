"""Campus and catalogue routes, included by resolver/api_urls.py under /api/v1/."""

from django.urls import path
from rest_framework.routers import SimpleRouter

from apps.org.views import (
    CampusViewSet,
    CatalogTreeView,
    ScopedTechnicianRosterView,
    ServiceItemViewSet,
    SubSectionViewSet,
)

router = SimpleRouter()
router.register("campuses", CampusViewSet, basename="campus")
router.register("sub-sections", SubSectionViewSet, basename="subsection")
router.register("service-items", ServiceItemViewSet, basename="serviceitem")

urlpatterns = router.urls + [
    path("catalog/", CatalogTreeView.as_view(), name="catalog-tree"),
    # Read only: `accounts.posts.assign_role` is the only writer of a trade link.
    path(
        "technicians/",
        ScopedTechnicianRosterView.as_view(),
        name="technician-list",
    ),
]
