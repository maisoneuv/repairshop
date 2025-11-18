from django.contrib import admin
from mptt.admin import DraggableMPTTAdmin

from core.admin_mixins import TenantAwareImportExportAdmin, TenantAwareImportExportMixin

from .models import (
    AttributeDefinition,
    Category,
    Device,
    InventoryBalance,
    InventoryItem,
    InventoryList,
    InventoryTransaction,
    PartAttributeValue,
    PurchaseOrder,
    PurchaseOrderItem,
    Supplier,
)


@admin.register(Category)
class CategoryAdmin(TenantAwareImportExportMixin, DraggableMPTTAdmin):
    list_display = ('tree_actions', 'indented_title', 'description')
    search_fields = ('name',)

    class Media:
        css = {"all": ("mptt/draggable-admin.css",)}


@admin.register(Device)
class DeviceAdmin(TenantAwareImportExportAdmin):
    list_display = ('manufacturer', 'model', 'category')
    search_fields = ('manufacturer', 'model')
    autocomplete_fields = ['category']


@admin.register(InventoryList)
class InventoryListAdmin(TenantAwareImportExportAdmin):
    list_display = ('name', 'location')
    search_fields = ('name', 'location__name')
    autocomplete_fields = ['location']


@admin.register(InventoryItem)
class InventoryItemAdmin(TenantAwareImportExportAdmin):
    list_display = ('name', 'sku', 'inventory_list', 'type')
    search_fields = ('name', 'sku')
    list_filter = ('inventory_list',)
    autocomplete_fields = ['inventory_list', 'parent_inventory_item']


@admin.register(Supplier)
class SupplierAdmin(TenantAwareImportExportAdmin):
    list_display = ('name',)
    search_fields = ('name',)


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(TenantAwareImportExportAdmin):
    list_display = ('order_number', 'supplier', 'status', 'order_date')
    search_fields = ('order_number', 'supplier__name')
    list_filter = ('status', 'order_date')
    autocomplete_fields = ['supplier', 'origin_work_item']


@admin.register(PurchaseOrderItem)
class PurchaseOrderItemAdmin(TenantAwareImportExportAdmin):
    list_display = ('purchase_order', 'inventory_item', 'quantity', 'unit_cost')
    autocomplete_fields = ['purchase_order', 'inventory_item']


@admin.register(InventoryTransaction)
class InventoryTransactionAdmin(TenantAwareImportExportAdmin):
    list_display = ('inventory_item', 'transaction_type', 'quantity', 'transaction_date')
    list_filter = ('transaction_type', 'transaction_date')
    autocomplete_fields = ['inventory_item', 'inventory_list', 'purchase_order', 'work_item']


@admin.register(InventoryBalance)
class InventoryBalanceAdmin(TenantAwareImportExportAdmin):
    list_display = ('inventory_item', 'inventory_list', 'current_quantity')
    autocomplete_fields = ['inventory_item', 'inventory_list']


@admin.register(AttributeDefinition)
class AttributeDefinitionAdmin(TenantAwareImportExportAdmin):
    list_display = ('name', 'data_type')
    search_fields = ('name',)


@admin.register(PartAttributeValue)
class PartAttributeValueAdmin(TenantAwareImportExportAdmin):
    list_display = ('part', 'attribute')
    search_fields = ('part__name', 'attribute__name')
    autocomplete_fields = ['part', 'attribute']
