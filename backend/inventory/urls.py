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

    # Legacy template views
    path('all', views.DeviceListView.as_view(), name="device_list"),
    path('detail/<pk>/', views.DeviceDetailView.as_view(), name="device_detail"),
    path('detail/<pk>/update', views.DeviceUpdateView.as_view(), name="device_update"),
    path('create', views.DeviceCreateView.as_view(), name="device_create"),
    path('list', views.InventoryItemListView.as_view(), name="inventory_list"),
    path('inventory/create/', views.InventoryItemCreateView.as_view(), name="inventory_create"),
    path('inventory/<pk>/', views.InventoryItemDetailView.as_view(), name="inventory_detail"),
    path('inventory/<pk>/update', views.InventoryItemUpdateView.as_view(), name="inventory_update"),
    path('inventory-balance/', views.InventoryBalanceListViewLegacy.as_view(), name="inventory_balance_list"),
    path('inventory-balance/create/', views.InventoryBalanceCreateView.as_view(), name="inventory_balance_create"),
    path('inventory-balance/<pk>/', views.InventoryBalanceDetailView.as_view(), name="inventory_balance_detail"),
    path('inventory-balance/<pk>/update', views.InventoryBalanceUpdateView.as_view(), name="inventory_balance_update"),
    path('purchase-orders/', views.PurchaseOrderListView.as_view(), name="purchase_order_list"),
    path('purchase-orders/create/', views.PurchaseOrderCreateView.as_view(), name="purchase_order_create"),
    path('purchase-orders/<pk>/', views.PurchaseOrderDetailView.as_view(), name="purchase_order_detail"),
    path('purchase-orders/<pk>/update', views.PurchaseOrderUpdateView.as_view(), name="purchase_order_update"),
    path('purchase-order-items/', views.PurchaseOrderItemListView.as_view(), name="purchase_order_item_list"),
    path('purchase-order-item/create/', views.PurchaseOrderItemCreateView.as_view(), name="purchase_order_item_create"),
    path('purchase-order-item/<pk>/', views.PurchaseOrderItemDetailView.as_view(), name="purchase_order_item_detail"),
    path('purchase-order-item/<pk>/update', views.PurchaseOrderItemUpdateView.as_view(), name="purchase_order_item_update"),
    path('device-create-inline/', views.device_create_inline, name='device_create_inline'),
]
