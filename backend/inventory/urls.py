from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from .views import (
    DeviceAPISearchView, DeviceCreateListView, DeviceRetrieveUpdateAPIView,
    CategoryAPISearchView, CategoryCreateListView,
    InventoryItemViewSet, InventoryListViewSet,
    InventoryBalanceViewSet, InventoryTransactionViewSet,
    WorkItemPartsView, WorkItemPartDeleteView, StockAdjustmentView,
    SKUResolveView, ReceiveDeliveryView, UserDefaultLocationView,
)

app_name = "inventory"

router = DefaultRouter()
router.register(r'api/items', InventoryItemViewSet, basename='inventory-item')
router.register(r'api/lists', InventoryListViewSet, basename='inventory-list')
router.register(r'api/balances', InventoryBalanceViewSet, basename='inventory-balance')
router.register(r'api/transactions', InventoryTransactionViewSet, basename='inventory-transaction')

# Legacy Django template routes (device/inventory/purchase-order pages) were
# removed: unscoped by tenant and unused by the React frontend.
urlpatterns = [
    # REST API (router)
    path('', include(router.urls)),

    # Custom REST API endpoints
    path('api/work-item-parts/<int:work_item_id>/', WorkItemPartsView.as_view(), name='work-item-parts'),
    path('api/work-item-parts/<int:work_item_id>/<int:transaction_id>/', WorkItemPartDeleteView.as_view(), name='work-item-part-delete'),
    path('api/stock-adjustment/', StockAdjustmentView.as_view(), name='stock-adjustment'),
    path('api/sku-resolve/', SKUResolveView.as_view(), name='sku-resolve'),
    path('api/receive/', ReceiveDeliveryView.as_view(), name='receive-delivery'),
    path('api/my-default-location/', UserDefaultLocationView.as_view(), name='my-default-location'),

    # Device & Category API
    path('api/devices/search/', DeviceAPISearchView.as_view(), name='device-api-search'),
    path('api/devices/', DeviceCreateListView.as_view(), name='device-api-create'),
    path('api/devices/<int:pk>/', DeviceRetrieveUpdateAPIView.as_view(), name='device-api-detail'),
    path("api/devices/manufacturers/", views.manufacturer_search, name='manufacturer-api-search'),
    path("api/category/search/", CategoryAPISearchView.as_view(), name='category-api-search'),
    path('api/category/', CategoryCreateListView.as_view(), name='category-api-create'),
]
