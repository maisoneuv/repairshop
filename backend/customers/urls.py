from django.urls import path, include, re_path
from rest_framework.routers import DefaultRouter
from core.views import react_app_view
from .views import (AssetRetrieveUpdateAPIView,
                    AssetViewSet,
                    CustomerAPISearchView,
                    get_referral_sources,
                    CustomerViewSet, customer_assets_api, customer_lookup,
                    LeadViewSet)

app_name = "customers"

router = DefaultRouter()
router.register(r'customers', CustomerViewSet, basename="customer")
router.register(r'assets', AssetViewSet, basename="asset")
router.register(r'leads', LeadViewSet, basename="lead")

# Legacy Django template/htmx routes (all, detail/, create-inline/, …) were
# removed: unscoped by tenant and unused by the React frontend.
urlpatterns = [
    path('api/customers/search/', CustomerAPISearchView.as_view(), name='customer-api-search'),
    path('api/assets/<int:pk>/', AssetRetrieveUpdateAPIView.as_view(), name='asset-api-detail'),
    path('api/referral-sources/', get_referral_sources, name='referral-sources'),
    path('api/customers/<int:pk>/assets/', customer_assets_api, name='customer-assets-api'),
    path('api/customers/lookup/', customer_lookup, name='customer-lookup'),
    path("api/", include(router.urls)),
]

# Catch-all for non-API routes - serve React app
# This allows frontend routes like /customers/16 to work
# Exclude static files, media files, and API routes
urlpatterns += [
    re_path(r'^(?!api/|static/|media/).*$', react_app_view, name='customers-react-catchall'),
]
