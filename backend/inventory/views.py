import json

from django.http import HttpResponse
from django.shortcuts import render, reverse
from django.views.generic import ListView, DetailView, CreateView, UpdateView
from rest_framework import generics, viewsets, filters, status
from rest_framework.decorators import api_view
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
import django_filters
from django_filters.rest_framework import DjangoFilterBackend

from core.mixins import TenantScopedMixin
from core.views import BaseListView
from core.utils import build_table_data
from tasks.models import WorkItem
from service.models import Employee

from .models import (
    Device, Category, InventoryItem, InventoryList,
    InventoryBalance, InventoryTransaction, PurchaseOrder, PurchaseOrderItem,
)
from .forms import (
    DeviceForm, InventoryItemForm, InventoryBalanceForm,
    PurchaseOrderForm, PurchaseOrderItemForm, DeviceInlineForm,
)
from .serializers import (
    DeviceSerializer, CategorySerializer,
    InventoryItemSerializer, InventoryListSerializer,
    InventoryBalanceSerializer, InventoryTransactionSerializer,
    ConsumePartSerializer,
)
from django.db.models import Q
from django.db import transaction


# ── REST API ViewSets ──────────────────────────────────────────────────

class InventoryItemViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = InventoryItemSerializer
    queryset = InventoryItem.objects.all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['type', 'category']
    search_fields = ['name', 'sku', 'description']
    ordering_fields = ['name', 'sku', 'type']
    ordering = ['name']


class InventoryListViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = InventoryListSerializer
    queryset = InventoryList.objects.select_related('location').all()
    filter_backends = [filters.SearchFilter]
    search_fields = ['name']


class InventoryBalanceViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = InventoryBalanceSerializer
    queryset = InventoryBalance.objects.select_related('inventory_item', 'inventory_list').all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['inventory_item', 'inventory_list']
    search_fields = ['inventory_item__name', 'inventory_item__sku', 'rack', 'shelf_slot']
    ordering_fields = ['current_quantity', 'inventory_item__name']
    ordering = ['inventory_item__name']


class InventoryTransactionViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = InventoryTransactionSerializer
    queryset = InventoryTransaction.objects.select_related('inventory_item', 'inventory_list').all()
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['inventory_item', 'inventory_list', 'transaction_type', 'work_item']
    ordering_fields = ['transaction_date']
    ordering = ['-transaction_date']


class WorkItemPartsView(APIView):
    """
    GET  /api/inventory/work-item-parts/<work_item_id>/
         List parts consumed for a work item (USE transactions).

    POST /api/inventory/work-item-parts/<work_item_id>/
         Consume a part for a work item.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, work_item_id):
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return Response({'detail': 'Tenant not resolved.'}, status=status.HTTP_400_BAD_REQUEST)

        transactions = InventoryTransaction.objects.filter(
            tenant=tenant,
            work_item_id=work_item_id,
            transaction_type=InventoryTransaction.USAGE,
        ).select_related('inventory_item', 'inventory_list').order_by('-transaction_date')

        serializer = InventoryTransactionSerializer(transactions, many=True)
        return Response(serializer.data)

    def post(self, request, work_item_id):
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return Response({'detail': 'Tenant not resolved.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            work_item = WorkItem.objects.get(id=work_item_id, tenant=tenant)
        except WorkItem.DoesNotExist:
            return Response({'detail': 'Work item not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = ConsumePartSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        transaction = InventoryTransaction.objects.create(
            tenant=tenant,
            inventory_item=data['_item'],
            inventory_list=data['_inv_list'],
            transaction_type=InventoryTransaction.USAGE,
            quantity=-abs(data['quantity']),
            quantity_unit=data['_item'].quantity_unit,
            unit_cost=0,
            work_item=work_item,
        )

        return Response(
            InventoryTransactionSerializer(transaction).data,
            status=status.HTTP_201_CREATED,
        )


class WorkItemPartDeleteView(APIView):
    """
    DELETE /api/inventory/work-item-parts/<work_item_id>/<transaction_id>/
           Return a consumed part (creates a reverse transaction).
    """
    permission_classes = [IsAuthenticated]

    def delete(self, request, work_item_id, transaction_id):
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return Response({'detail': 'Tenant not resolved.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            original = InventoryTransaction.objects.get(
                id=transaction_id,
                work_item_id=work_item_id,
                tenant=tenant,
                transaction_type=InventoryTransaction.USAGE,
            )
        except InventoryTransaction.DoesNotExist:
            return Response({'detail': 'Transaction not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Create a reverse transaction to return the part
        InventoryTransaction.objects.create(
            tenant=tenant,
            inventory_item=original.inventory_item,
            inventory_list=original.inventory_list,
            transaction_type=InventoryTransaction.RETURN,
            quantity=abs(original.quantity),
            quantity_unit=original.quantity_unit,
            unit_cost=0,
            work_item=original.work_item,
        )

        return Response(status=status.HTTP_204_NO_CONTENT)


class StockAdjustmentView(APIView):
    """
    POST /api/inventory/stock-adjustment/
         Manually adjust stock (add or remove).
         Body: { inventory_item, inventory_list, quantity, rack?, shelf_slot? }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return Response({'detail': 'Tenant not resolved.'}, status=status.HTTP_400_BAD_REQUEST)

        inventory_item_id = request.data.get('inventory_item')
        inventory_list_id = request.data.get('inventory_list')
        quantity = request.data.get('quantity')
        rack = request.data.get('rack', '')
        shelf_slot = request.data.get('shelf_slot', '')

        if not all([inventory_item_id, inventory_list_id, quantity is not None]):
            return Response(
                {'detail': 'inventory_item, inventory_list, and quantity are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            quantity = int(quantity)
        except (ValueError, TypeError):
            return Response({'detail': 'quantity must be an integer.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            item = InventoryItem.objects.get(id=inventory_item_id, tenant=tenant)
        except InventoryItem.DoesNotExist:
            return Response({'detail': 'Item not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            inv_list = InventoryList.objects.get(id=inventory_list_id, tenant=tenant)
        except InventoryList.DoesNotExist:
            return Response({'detail': 'Location not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Update rack/shelf if provided
        if rack or shelf_slot:
            balance, _ = InventoryBalance.objects.get_or_create(
                tenant=tenant,
                inventory_item=item,
                inventory_list=inv_list,
                defaults={'quantity_unit': item.quantity_unit, 'current_quantity': 0, 'average_cost': 0},
            )
            if rack:
                balance.rack = rack
            if shelf_slot:
                balance.shelf_slot = shelf_slot
            balance.save()

        transaction = InventoryTransaction.objects.create(
            tenant=tenant,
            inventory_item=item,
            inventory_list=inv_list,
            transaction_type=InventoryTransaction.ADJUSTMENT,
            quantity=quantity,
            quantity_unit=item.quantity_unit,
            unit_cost=0,
        )

        return Response(
            InventoryTransactionSerializer(transaction).data,
            status=status.HTTP_201_CREATED,
        )


# ── Receive Delivery endpoints ─────────────────────────────────────────

class SKUResolveView(APIView):
    """
    GET /api/inventory/items/resolve/?sku=...
    Resolve a SKU and return item info + suggested storage locations.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return Response({'detail': 'Tenant not resolved.'}, status=status.HTTP_400_BAD_REQUEST)

        sku = request.query_params.get('sku', '').strip()
        if not sku:
            return Response({'found': False, 'inventory_item': None, 'suggested_locations': []})

        try:
            item = InventoryItem.objects.get(tenant=tenant, sku__iexact=sku)
        except InventoryItem.DoesNotExist:
            return Response({'found': False, 'inventory_item': None, 'suggested_locations': []})

        # Build suggested locations from existing balances for this item
        balances = (
            InventoryBalance.objects
            .filter(tenant=tenant, inventory_item=item)
            .select_related('inventory_list')
            .order_by('-current_quantity')
        )

        suggestions = []
        for bal in balances[:3]:
            suggestions.append({
                'inventory_list_id': bal.inventory_list_id,
                'inventory_list_name': bal.inventory_list.name,
                'rack': bal.rack or '',
                'shelf_slot': bal.shelf_slot or '',
                'current_quantity': bal.current_quantity,
            })

        return Response({
            'found': True,
            'inventory_item': {
                'id': item.id,
                'name': item.name,
                'sku': item.sku,
                'quantity_unit': item.quantity_unit,
                'type': item.type,
                'category_id': item.category_id,
                'category_name': item.category.name if item.category else None,
            },
            'suggested_locations': suggestions,
        })


class ReceiveDeliveryView(APIView):
    """
    POST /api/inventory/receive/
    Finalize a delivery: create InventoryTransaction (PUR) rows and update InventoryBalance.

    Payload:
    {
      "lines": [
        {
          "sku": "R-10K-0603",
          "quantity": 200,
          "inventory_list_id": 12,
          "rack": "A",
          "shelf_slot": "3",
          "unit_cost": "0.01",
          "purchase_order_id": null
        }, ...
      ]
    }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return Response({'detail': 'Tenant not resolved.'}, status=status.HTTP_400_BAD_REQUEST)

        lines = request.data.get('lines', [])
        if not lines:
            return Response({'detail': 'No lines provided.'}, status=status.HTTP_400_BAD_REQUEST)

        # Validate all lines up front
        errors = []
        # Prefetch items and lists
        skus = [ln.get('sku', '').strip() for ln in lines]
        list_ids = set(ln.get('inventory_list_id') for ln in lines if ln.get('inventory_list_id'))

        items_by_sku = {}
        for item in InventoryItem.objects.filter(tenant=tenant, sku__in=skus):
            items_by_sku[item.sku.lower()] = item

        lists_by_id = {}
        if list_ids:
            for inv_list in InventoryList.objects.filter(tenant=tenant, id__in=list_ids):
                lists_by_id[inv_list.id] = inv_list

        po_cache = {}
        validated = []

        for i, ln in enumerate(lines):
            sku = (ln.get('sku') or '').strip()
            qty = ln.get('quantity')
            list_id = ln.get('inventory_list_id')
            rack = ln.get('rack', '') or ''
            shelf_slot = ln.get('shelf_slot', '') or ''
            unit_cost = ln.get('unit_cost', 0)
            po_id = ln.get('purchase_order_id')

            line_errors = []

            # Resolve item
            item = items_by_sku.get(sku.lower()) if sku else None
            if not item:
                line_errors.append(f'SKU "{sku}" not found.')

            # Validate quantity
            try:
                qty = int(qty)
                if qty <= 0:
                    line_errors.append('Quantity must be positive.')
            except (ValueError, TypeError):
                line_errors.append('Invalid quantity.')
                qty = 0

            # Validate list
            inv_list = lists_by_id.get(int(list_id)) if list_id else None
            if not inv_list:
                line_errors.append('inventory_list_id is required and must belong to tenant.')

            # Validate unit_cost
            try:
                unit_cost = float(unit_cost or 0)
            except (ValueError, TypeError):
                unit_cost = 0

            # Validate PO if provided
            po = None
            if po_id:
                if po_id in po_cache:
                    po = po_cache[po_id]
                else:
                    try:
                        po = PurchaseOrder.objects.get(id=po_id, tenant=tenant)
                        po_cache[po_id] = po
                    except PurchaseOrder.DoesNotExist:
                        line_errors.append(f'Purchase order {po_id} not found.')

            if line_errors:
                errors.append({'line': i, 'sku': sku, 'errors': line_errors})
            else:
                validated.append({
                    'item': item,
                    'quantity': qty,
                    'inv_list': inv_list,
                    'rack': rack,
                    'shelf_slot': shelf_slot,
                    'unit_cost': unit_cost,
                    'po': po,
                })

        if errors:
            return Response({'detail': 'Validation failed.', 'errors': errors}, status=status.HTTP_400_BAD_REQUEST)

        # Apply within a transaction
        created_count = 0
        updated_count = 0

        with transaction.atomic():
            # Prefetch existing balances for upsert
            balance_keys = [(v['item'].id, v['inv_list'].id) for v in validated]
            existing_balances = {}
            for bal in InventoryBalance.objects.filter(
                tenant=tenant,
                inventory_item_id__in=[k[0] for k in balance_keys],
                inventory_list_id__in=[k[1] for k in balance_keys],
            ):
                existing_balances[(bal.inventory_item_id, bal.inventory_list_id)] = bal

            transactions_to_create = []
            balances_to_update = []
            balances_to_create = []

            for v in validated:
                item = v['item']
                inv_list = v['inv_list']
                qty = v['quantity']

                # Build transaction
                transactions_to_create.append(InventoryTransaction(
                    tenant=tenant,
                    inventory_item=item,
                    inventory_list=inv_list,
                    transaction_type=InventoryTransaction.PURCHASE,
                    quantity=qty,
                    quantity_unit=item.quantity_unit,
                    unit_cost=v['unit_cost'],
                    purchase_order=v['po'],
                ))

                # Upsert balance
                key = (item.id, inv_list.id)
                bal = existing_balances.get(key)
                if bal:
                    # Update quantity
                    bal.current_quantity += qty
                    # Update rack/shelf if provided
                    if v['rack']:
                        bal.rack = v['rack']
                    if v['shelf_slot']:
                        bal.shelf_slot = v['shelf_slot']
                    # Update average cost
                    if v['unit_cost'] > 0 and qty > 0:
                        old_total = float(bal.average_cost) * (bal.current_quantity - qty)
                        new_total = v['unit_cost'] * qty
                        if bal.current_quantity > 0:
                            bal.average_cost = (old_total + new_total) / bal.current_quantity
                    balances_to_update.append(bal)
                    updated_count += 1
                else:
                    new_bal = InventoryBalance(
                        tenant=tenant,
                        inventory_item=item,
                        inventory_list=inv_list,
                        current_quantity=qty,
                        quantity_unit=item.quantity_unit,
                        average_cost=v['unit_cost'],
                        rack=v['rack'],
                        shelf_slot=v['shelf_slot'],
                    )
                    balances_to_create.append(new_bal)
                    # Track so duplicate lines in same request work
                    existing_balances[key] = new_bal
                    updated_count += 1

            # Bulk create transactions (signal won't fire for bulk_create,
            # but we handle balances manually above)
            InventoryTransaction.objects.bulk_create(transactions_to_create)
            created_count = len(transactions_to_create)

            # Save balances
            if balances_to_create:
                InventoryBalance.objects.bulk_create(balances_to_create)
            if balances_to_update:
                InventoryBalance.objects.bulk_update(
                    balances_to_update,
                    ['current_quantity', 'rack', 'shelf_slot', 'average_cost'],
                )

        return Response({
            'created_transactions_count': created_count,
            'updated_balances_count': updated_count,
            'errors': [],
        }, status=status.HTTP_201_CREATED)


class UserDefaultLocationView(APIView):
    """
    GET /api/inventory/my-default-location/
    Returns the InventoryList linked to the current user's Employee location (if any).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return Response({'inventory_list_id': None})

        try:
            employee = Employee.objects.select_related('location').get(
                user=request.user, tenant=tenant
            )
        except Employee.DoesNotExist:
            return Response({'inventory_list_id': None})

        if not employee.location_id:
            return Response({'inventory_list_id': None})

        try:
            inv_list = InventoryList.objects.get(
                tenant=tenant, location=employee.location
            )
            return Response({
                'inventory_list_id': inv_list.id,
                'inventory_list_name': inv_list.name,
            })
        except InventoryList.DoesNotExist:
            return Response({'inventory_list_id': None})


# ── Existing Device/Category API views ─────────────────────────────────

class DeviceFilter(django_filters.FilterSet):
    model = django_filters.CharFilter(field_name='model', lookup_expr='icontains')
    manufacturer = django_filters.CharFilter(field_name='manufacturer', lookup_expr='icontains')
    category = django_filters.NumberFilter(field_name='category')
    category_name = django_filters.CharFilter(field_name='category__name', lookup_expr='icontains')

    class Meta:
        model = Device
        fields = ['model', 'manufacturer', 'category', 'category_name']


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
    filter_backends = [DjangoFilterBackend]
    filterset_class = DeviceFilter


class DeviceRetrieveUpdateAPIView(generics.RetrieveUpdateAPIView):
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
    serializer_class = CategorySerializer

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        if not tenant:
            return Category.objects.none()
        return Category.objects.filter(tenant=tenant)

    def perform_create(self, serializer):
        tenant = getattr(self.request, 'tenant', None)
        if not tenant:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"detail": "Tenant required"})
        serializer.save(tenant=tenant)


# ── Legacy template views (kept for backward compatibility) ─────────────

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
        balances = InventoryBalance.objects.filter(inventory_item=inventory_item)

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


class InventoryBalanceListViewLegacy(BaseListView):
    model = InventoryBalance
    template_name = "inventory/inventory_balance_list.html"
    columns = [
        {"label": "ID", "field": "id", "is_link": False, "url_name": None, "url_field": None, "display_field": "id"},
        {"label": "Name", "field": "inventory_item.name", "is_link": True, "url_name": "inventory:inventory_detail", "url_field": "pk", "display_field": "inventory_item.name"},
        {"label": "Current Quantity", "field": "get_quantity_with_unit", "is_link": False, "url_name": None, "url_field": None, "display_field": "current_quantity"},
        {"label": "Inventory List", "field": "inventory_list.name", "is_link": False, "url_name": None, "url_field": None, "display_field": "inventory_list.name"},
        {"label": "Location", "field": "get_location", "is_link": False, "url_name": None, "url_field": None, "constant_text": "Location"},
        {"label": "", "field": None, "is_link": True, "url_name": "inventory:inventory_balance_detail", "url_field": "pk", "constant_text": "View"},
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
        {"label": "ID", "field": "id", "is_link": False, "url_name": None, "url_field": None, "display_field": "id"},
        {"label": "Order Number", "field": "order_number", "is_link": True, "url_name": "inventory:purchase_order_detail", "url_field": "pk", "display_field": "order_number"},
        {"label": "Created Date", "field": "order_date", "is_link": False, "url_name": None, "url_field": None, "display_field": "order_date"},
        {"label": "Status", "field": "status", "is_link": False, "url_name": None, "url_field": None, "display_field": "status"},
        {"label": "Supplier", "field": "supplier", "is_link": False, "url_name": None, "url_field": None, "display_field": "supplier"},
    ]


class PurchaseOrderDetailView(DetailView):
    template_name = "inventory/purchase_order_detail.html"
    queryset = PurchaseOrder.objects.all()
    context_object_name = "order"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        order = self.object
        order_items = PurchaseOrderItem.objects.filter(purchase_order=order)

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
        {"label": "ID", "field": "id", "is_link": False, "url_name": None, "url_field": None, "display_field": "id"},
        {"label": "Order Number", "field": "purchase_order.order_number", "is_link": True, "url_name": "inventory:purchase_order_detail", "url_field": "pk", "display_field": "purchase_order.order_number"},
        {"label": "Inventory Item", "field": "inventory_item.name", "is_link": True, "url_name": "inventory:inventory_detail", "url_field": "pk", "display_field": "inventory_item.name"},
        {"label": "Quantity", "field": "get_quantity_with_unit", "is_link": False, "url_name": None, "url_field": None, "display_field": "quantity"},
        {"label": "Unit Cost", "field": "unit_cost", "is_link": False, "url_name": None, "url_field": None, "display_field": "unit_cost"},
    ]


def device_create_inline(request):
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
        return render(request, 'partials/device_form_inline.html', {'form': form})
    else:
        form = DeviceInlineForm()
        return render(request, 'partials/device_form_inline.html', {'form': form})
