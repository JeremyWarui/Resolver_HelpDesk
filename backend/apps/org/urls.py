"""Campus and catalogue routes, included by resolver/api_urls.py under /api/v1/.

A router because all three are plain table CRUD, which is what ModelViewSet
is for. `catalog/` is not, so it is a path.
"""

from django.urls import path
from rest_framework.routers import SimpleRouter

from apps.org.views import (
    CampusViewSet,
    CatalogTreeView,
    ServiceItemViewSet,
    TradeViewSet,
)

router = SimpleRouter()
router.register("campuses", CampusViewSet, basename="campus")
router.register("trades", TradeViewSet, basename="trade")
router.register("service-items", ServiceItemViewSet, basename="serviceitem")

urlpatterns = router.urls + [
    path("catalog/", CatalogTreeView.as_view(), name="catalog-tree"),
]
