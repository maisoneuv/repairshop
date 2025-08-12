from django import forms
from .models import Device, Category, InventoryItem, InventoryBalance, PurchaseOrder, PurchaseOrderItem
from django.contrib.admin.widgets import FilteredSelectMultiple



class DeviceForm(forms.ModelForm):
    categories = forms.ModelMultipleChoiceField(
        queryset=Category.objects.all(),
        widget=FilteredSelectMultiple("Categories", is_stacked=False),
        required=False
    )

    class Meta:
        model = Device
        fields = ["manufacturer", "model", "categories"]


class InventoryItemForm(forms.ModelForm):
    class Meta:
        model = InventoryItem
        fields = ["name", "sku", "description"]


class InventoryBalanceForm(forms.ModelForm):
    class Meta:
        model = InventoryBalance
        fields = ["inventory_item", "inventory_list", "current_quantity", "quantity_unit", "rack", "shelf_slot"]


class PurchaseOrderForm(forms.ModelForm):
    class Meta:
        model = PurchaseOrder
        fields = ["order_number", "order_amount", "supplier", "status", "tracking_number", "origin_work_item"]

class PurchaseOrderItemForm(forms.ModelForm):
    class Meta:
        model = PurchaseOrderItem
        fields = ["purchase_order", "inventory_item", "quantity", "quantity_unit", "unit_cost"]


class DeviceInlineForm(forms.ModelForm):
    class Meta:
        model = Device
        fields = ["manufacturer", "model"]