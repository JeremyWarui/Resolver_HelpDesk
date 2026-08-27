"""Priority routes, included by resolver/api_urls.py under /api/v1/."""

from rest_framework.routers import SimpleRouter

from apps.sla.views import PriorityViewSet

router = SimpleRouter()
router.register("priorities", PriorityViewSet, basename="priority")

urlpatterns = router.urls
