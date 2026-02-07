from django.urls import path
from rest_framework.routers import DefaultRouter
from service import views

app_name = "service"

router = DefaultRouter()
router.register(r"shops", views.ShopViewSet, basename="shop")
router.register(r"cash-registers", views.CashRegisterViewSet, basename="cash-register")
router.register(r"cash-transactions", views.CashTransactionViewSet, basename="cash-transaction")

urlpatterns = [
    path('api/employee/search/', views.EmployeeSearchView.as_view(), name="employee-api-search"),
    path('api/employee/list/', views.EmployeeListView.as_view(), name="employee-api-list"),
    path('api/employee/me/', views.CurrentEmployeeView.as_view(), name="employee-api-current"),
    path('api/locations/search/', views.LocationSearchView.as_view(), name="location-api-search"),
    path('api/locations/create-freeform/', views.create_freeform_location, name="location-api-create-freeform"),
    path('api/locations/customer-address/', views.ensure_customer_address_location, name="location-api-customer-address"),
    path('api/shops/search/', views.ShopSearchView.as_view(), name="shop-api-search"),
    path('api/cash-registers/transfer/', views.transfer_between_registers, name="cash-register-transfer"),
]

urlpatterns = router.urls + urlpatterns
