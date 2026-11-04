from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AppointmentViewSet, DriverViewSet, RouteViewSet

app_name = "appointments"

router = DefaultRouter()
router.register(r"appointments", AppointmentViewSet, basename="appointment")
router.register(r"routes", RouteViewSet, basename="route")
router.register(r"drivers", DriverViewSet, basename="driver")

urlpatterns = [
    path("", include(router.urls)),
]
