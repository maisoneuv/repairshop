import json

from django.http import JsonResponse, HttpResponse
from django.shortcuts import render, reverse
from django.views.generic import TemplateView, ListView, DetailView, CreateView, UpdateView
from rest_framework import generics
from rest_framework.response import Response


from .models import Device, InventoryItem, InventoryList, InventoryBalance, InventoryTransaction, PurchaseOrder, PurchaseOrderItem, Category
from .forms import DeviceForm, InventoryItemForm, InventoryBalanceForm, PurchaseOrderForm, PurchaseOrderItemForm, DeviceInlineForm
from core.views import BaseListView
from core.utils import build_table_data, get_nested_attr
from .serializers import DeviceSerializer, CategorySerializer
from django.db.models import Q
from rest_framework.decorators import api_view


class DeviceListView(ListView):
    template_name = "inventory/device_list.html"
    queryset = Device.objects.all()
    context_object_name = "devices"


class DeviceDetailView(DetailView):
    template_name = "inventory/device_detail.html"
    queryset = Device.objects.all()
    context_object_name = "device"


class DeviceCreateView(CreateView):
    template_name = "inventory/device_create.html"
    form_class = DeviceForm

    def get_success_url(self):
        return reverse("inventory:device_list")


class DeviceUpdateView(UpdateView):
    template_name = "inventory/device_update.html"
    queryset = Device.objects.all()
    form_class = DeviceForm

    def get_success_url(self):
        return reverse("inventory:device_list")


class InventoryItemDetailView(DetailView):
    template_name = "inventory/inventory_item_detail.html"
    queryset = InventoryItem.objects.all()
    context_object_name = "inventory_item"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        inventory_item = self.object
        balances = InventoryBalance.objects.filter(inventory_item = inventory_item)

        inventory_balances_columns = [
            {"label": "ID", "field": "id", "is_link": True, "url_name": "inventory:inventory_balance_detail", "url_field": "pk"},
            {"label": "Current Quantity", "field": "get_quantity_with_unit", "is_link": False, "url_name": None, "url_field": None},
            {"label": "Inventory List", "field": "inventory_list.name", "is_link": False, "url_name": None, "url_field": None, "display_field": "inventory_list.name"},
            {"label": "Location", "field": "get_location", "is_link": False, "url_name": None, "url_field": None},
        ]

        context["balance_columns"] = inventory_balances_columns
        context["balance_rows"] = build_table_data(balances, inventory_balances_columns)

        return context


class InventoryItemListView(ListView):
    template_name = "inventory/inventory_list.html"
    queryset = InventoryItem.objects.all()
    context_object_name = "inventory_items"

class InventoryItemCreateView(CreateView):
    template_name = "inventory/inventory_item_create.html"
    form_class = InventoryItemForm
    model = InventoryItem

    def get_success_url(self):
        return reverse("inventory:inventory_list")

    def get_initial(self):
        initial = super().get_initial()
        user = self.request.user

        # if hasattr(user, 'employee'):
            # inventory_list = InventoryList.objects.filter(location=user.employee.location)
            # initial['inventory_list'] = inventory_list[0]

        return initial

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        return context

class InventoryItemUpdateView(UpdateView):
    template_name = "inventory/inventory_item_update.html"
    queryset = InventoryItem.objects.all()
    form_class = InventoryItemForm

    def get_success_url(self):
        return reverse("inventory:inventory_detail", kwargs={"pk": self.object.pk})

class InventoryBalanceDetailView(DetailView):
    template_name = "inventory/inventory_balance_detail.html"
    queryset = InventoryBalance.objects.all()
    context_object_name = "balance"

# class InventoryBalanceListView(ListView):
#     template_name = "inventory/inventory_balance_list.html"
#     queryset = InventoryBalance.objects.all()
#     context_object_name = "inventory_balances"

class InventoryBalanceListView(BaseListView):
    model = InventoryBalance
    template_name = "inventory/inventory_balance_list.html"
    columns = [
        {
            "label": "ID",
            "field": "id",
            "is_link": False,
            "url_name": None,
            "url_field": None,
            "display_field": "id",
        },
        {
            "label": "Name",
            "field": "inventory_item.name",
            "is_link": True,
            "url_name": "inventory:inventory_detail",
            "url_field": "pk",
            "display_field": "inventory_item.name",
        },
        {
            "label": "Current Quantity",
            "field": "get_quantity_with_unit",
            "is_link": False,
            "url_name": None,
            "url_field": None,
            "display_field": "current_quantity",
        },
        {
            "label": "Inventory List",
            "field": "inventory_list.name",
            "is_link": False,
            "url_name": None,
            "url_field": None,
            "display_field": "inventory_list.name",
        },
        {
            "label": "Location",
            "field": "get_location",
            "is_link": False,
            "url_name": None,
            "url_field": None,
            "constant_text": "Location",
        },
        {
            "label": "",
            "field": None,
            "is_link": True,
            "url_name": "inventory:inventory_balance_detail",
            "url_field": "pk",
            "constant_text": "View",
        },

    ]


class InventoryBalanceCreateView(CreateView):
    template_name = "inventory/inventory_balance_create.html"
    form_class = InventoryBalanceForm
    model = InventoryBalance

    def get_success_url(self):
        return reverse("inventory:inventory_balance_list")

class InventoryBalanceUpdateView(UpdateView):
    template_name = "inventory/inventory_balance_update.html"
    queryset = InventoryBalance.objects.all()
    form_class = InventoryBalanceForm

    def get_success_url(self):
        return reverse("inventory:inventory_balance_list")

class PurchaseOrderListView(BaseListView):
    model = PurchaseOrder
    template_name = "inventory/purchase_order_list.html"

    columns = [
        {
            "label": "ID",
            "field": "id",
            "is_link": False,
            "url_name": None,
            "url_field": None,
            "display_field": "id",
        },
        {
            "label": "Order Number",
            "field": "order_number",
            "is_link": True,
            "url_name": "inventory:purchase_order_detail",
            "url_field": "pk",
            "display_field": "order_number",
        },
        {
            "label": "Created Date",
            "field": "order_date",
            "is_link": False,
            "url_name": None,
            "url_field": None,
            "display_field": "order_date",
        },
        {
            "label": "Status",
            "field": "status",
            "is_link": False,
            "url_name": None,
            "url_field": None,
            "display_field": "status",
        },
        {
            "label": "Supplier",
            "field": "supplier",
            "is_link": False,
            "url_name": None,
            "url_field": None,
            "display_field": "supplier",
        },
    ]

class PurchaseOrderDetailView(DetailView):
    template_name = "inventory/purchase_order_detail.html"
    queryset = PurchaseOrder.objects.all()
    context_object_name = "order"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        order = self.object
        order_items = PurchaseOrderItem.objects.filter(purchase_order = order)

        item_columns = [
            {"label": "ID", "field": "id", "is_link": True, "url_name": "inventory:purchase_order_item_detail", "url_field": "pk"},
            {"label": "Quantity", "field": "get_quantity_with_unit", "is_link": False, "url_name": None, "url_field": None},
            {"label": "Inventory Item", "field": "inventory_item.name", "is_link": True, "url_name": "inventory:inventory_detail", "url_field": "pk", "display_field": "inventory_item.name"},
            {"label": "Unit Cost", "field": "unit_cost", "is_link": False, "url_name": None, "url_field": None},
        ]

        context["item_columns"] = item_columns
        context["item_rows"] = build_table_data(order_items, item_columns)

        return context

class PurchaseOrderCreateView(CreateView):
    template_name = "inventory/purchase_order_create.html"
    form_class = PurchaseOrderForm
    model = PurchaseOrder

    def get_success_url(self):
        return reverse("inventory:purchase_order_detail", kwargs={"pk": self.object.pk})

class PurchaseOrderUpdateView(UpdateView):
    template_name = "inventory/purchase_order_update.html"
    queryset = PurchaseOrder.objects.all()
    form_class = PurchaseOrderForm

    def get_success_url(self):
        return reverse("inventory:purchase_order_detail", kwargs={"pk": self.object.pk})


class PurchaseOrderItemDetailView(DetailView):
    template_name = "inventory/purchase_order_item_detail.html"
    queryset = PurchaseOrderItem.objects.all()
    context_object_name = "item"


class PurchaseOrderItemCreateView(CreateView):
    template_name = "inventory/purchase_order_item_create.html"
    form_class = PurchaseOrderItemForm
    model = PurchaseOrderItem

    def get_success_url(self):
        return reverse("inventory:purchase_order_item_detail", kwargs={"pk": self.object.pk})

class PurchaseOrderItemUpdateView(UpdateView):
    template_name = "inventory/purchase_order_item_update.html"
    queryset = PurchaseOrderItem.objects.all()
    form_class = PurchaseOrderItemForm

    def get_success_url(self):
        return reverse("inventory:purchase_order_item_detail", kwargs={"pk": self.object.pk})

class PurchaseOrderItemListView(BaseListView):
    model = PurchaseOrderItem
    template_name = "inventory/purchase_order_item_list.html"

    columns = [
        {
            "label": "ID",
            "field": "id",
            "is_link": False,
            "url_name": None,
            "url_field": None,
            "display_field": "id",
        },
        {
            "label": "Order Number",
            "field": "purchase_order.order_number",
            "is_link": True,
            "url_name": "inventory:purchase_order_detail",
            "url_field": "pk",
            "display_field": "purchase_order.order_number",
        },
        {
            "label": "Inventory Item",
            "field": "inventory_item.name",
            "is_link": True,
            "url_name": "inventory:inventory_detail",
            "url_field": "pk",
            "display_field": "inventory_item.name",
        },
        {
            "label": "Quantity",
            "field": "get_quantity_with_unit",
            "is_link": False,
            "url_name": None,
            "url_field": None,
            "display_field": "quantity",
        },
        {
            "label": "Unit Cost",
            "field": "unit_cost",
            "is_link": False,
            "url_name": None,
            "url_field": None,
            "display_field": "unit_cost",
        },
    ]

def device_create_inline(request):
    print(request.POST)
    if request.method == 'POST':
        form = DeviceInlineForm(request.POST)
        if form.is_valid():
            device = form.save()
            return HttpResponse(
                "",
                headers={
                    "HX-Trigger": json.dumps({
                        "device-created": {
                            "id": device.id,
                            "label": str(device),
                        }
                    })
                }
            )
        else:
            print("Form is NOT valid")
            print(form.errors)
        return render(request, 'partials/device_form_inline.html', {'form': form})
    else:
        form = DeviceInlineForm()
        return render(request, 'partials/device_form_inline.html', {'form': form})

class DeviceAPISearchView(generics.ListAPIView):
    serializer_class = DeviceSerializer

    def get_queryset(self):
        query = self.request.query_params.get('q', '')
        return Device.objects.filter(
            Q(model__icontains=query) |
            Q(manufacturer__icontains=query)
        )[:10]

class DeviceCreateListView(generics.ListCreateAPIView):
    queryset = Device.objects.all()
    serializer_class = DeviceSerializer

@api_view(['GET'])
def manufacturer_search(request):
    query = request.GET.get("q", "").lower()
    manufacturers = (
        Device.objects.values_list("manufacturer", flat=True)
        .distinct()
        .order_by("manufacturer")
    )

    if query:
        manufacturers = [m for m in manufacturers if query in m.lower()]

    return Response([{"id": m, "name": m} for m in manufacturers])

class CategoryAPISearchView(generics.ListAPIView):
    serializer_class = CategorySerializer

    def get_queryset(self):
        query = self.request.query_params.get('q', '')
        return Category.objects.filter(
            Q(name__icontains=query)
        )[:10]

class CategoryCreateListView(generics.ListCreateAPIView):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer