from django.urls import path
from rest_framework.routers import DefaultRouter
from service import views

app_name = "service"

router = DefaultRouter()
router.register(r"shops", views.ShopViewSet, basename="shop")

urlpatterns = [
    path('api/employee/search/', views.EmployeeSearchView.as_view(), name="employee-api-search"),
    path('api/employee/me/', views.CurrentEmployeeView.as_view(), name="employee-api-current"),
    path('api/locations/search/', views.LocationSearchView.as_view(), name="location-api-search"),
]