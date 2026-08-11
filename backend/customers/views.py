import logging

from django.shortcuts import render, reverse, get_object_or_404
from django.template.loader import render_to_string
from rest_framework import generics, viewsets
from rest_framework.decorators import api_view, action, throttle_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from django.db import transaction

from core.mixins import TenantScopedMixin
from core.phone import region_for_tenant, to_e164
from core.security import CustomerLookupThrottle
from core.picklists import (
    CLOSED_ROLES,
    is_closed_status,
    status_label,
    workitem_status_index,
)
from .serializers import CustomerSerializer, LeadSerializer, AssetSerializer
from .models import Customer, Asset, Lead
from tasks.models import WorkItem
from django.views.generic import TemplateView, ListView, DetailView, CreateView, UpdateView
from .forms import CustomerForm, CustomerAssetForm, CustomerInlineForm, CustomerAssetInlineForm
from dal import autocomplete
from django.db.models import Q
from django.http import JsonResponse, HttpRequest, HttpResponse


class CustomerListView(ListView):
    template_name = "customers/customer_list.html"
    queryset = Customer.objects.all()
    context_object_name = "customers"


class CustomerDetailView(DetailView):
    template_name = "customers/customer_detail.html"
    queryset = Customer.objects.all()
    context_object_name = "customer"


class CustomerCreateView(CreateView):
    template_name = "customers/customer_create.html"
    form_class = CustomerForm

    def get_success_url(self):
        return reverse("customers:customer_list")


class CustomerUpdateView(UpdateView):
    template_name = "customers/customer_update.html"
    form_class = CustomerForm
    queryset = Customer.objects.all()

    def get_success_url(self):
        return reverse("customers:customer_list")


class CustomerAsetListView(ListView):
    template_name = "customers/asset_list.html"
    queryset = Asset.objects.all()
    context_object_name = "assets"


class CustomerAssetDetailView(DetailView):
    template_name = "customers/asset_detail.html"
    queryset = Asset.objects.all()
    context_object_name = "asset"


class CustomerAssetCreateView(CreateView):
    template_name = "customers/asset_create.html"
    form_class = CustomerAssetForm

    def get_success_url(self):
        return reverse("customers:asset_list")


class CustomerAssetUpdateView(UpdateView):
    template_name = "customers/asset_update.html"
    form_class = CustomerAssetForm
    queryset = Asset.objects.all()

    def get_success_url(self):
        return reverse("customers:asset_list")


class AssetRetrieveUpdateAPIView(TenantScopedMixin, generics.RetrieveUpdateAPIView):
    """API endpoint for retrieving and updating asset information"""
    queryset = Asset.objects.select_related("device", "customer")
    tenant_field = "customer__tenant"
    serializer_class = AssetSerializer


class AssetViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    """API endpoint for listing and creating customer assets (devices)"""
    queryset = Asset.objects.select_related("device", "customer")
    tenant_field = "customer__tenant"
    serializer_class = AssetSerializer

    def get_queryset(self):
        qs = super().get_queryset()

        # Optional filtering by customer_id
        customer_id = self.request.query_params.get('customer_id')
        if customer_id:
            qs = qs.filter(customer_id=customer_id)

        return qs


class CustomerSearchView(autocomplete.Select2QuerySetView):
    def get_queryset(self):
        if not self.request.user.is_authenticated:
            return Customer.objects.none()

        if not self.q:
            return Customer.objects.none()

        qs = Customer.objects.all()

        if self.q:
            qs = qs.filter(
                Q(phone_number__icontains=self.q) |
                Q(email__icontains=self.q) |
                Q(first_name__icontains=self.q)
            )
        return qs

    def get_result_label(self, customer):
        return f"{customer.full_name()} - {customer.phone_number} - {customer.email}"

    def get_selected_result_label(self, customer):
        return f"{customer.full_name()}"


class CustomerPhoneSearchView(autocomplete.Select2QuerySetView):
    def get_queryset(self):
        if not self.request.user.is_authenticated:
            return Customer.objects.none()

        if not self.q:
            return Customer.objects.none()

        qs = Customer.objects.all()

        if self.q:
            qs = qs.filter(
                Q(phone_number__icontains=self.q)
            )
        return qs


    def get_selected_result_label(self, customer):
        return f"{customer.phone_number}"

    def get_result_label(self, customer):
        return f"{customer.phone_number}"


def customer_search(request):
    # query = request.GET.get("customer_search", "").strip()
    query = request.GET.get("customer_search")
    if not query:
        customers = Customer.objects.none()
    else:
        customers = Customer.objects.filter(
            Q(first_name__icontains=query) | Q(email__icontains=query) | Q(phone_number__icontains=query)
        )
    if customers.exists():
        return render(request, 'partials/customer_search_results.html', {'customers': customers})
    else:
        return render(request, 'partials/no_customer_found.html')

def select_customer(request, customer_id):
    customer = get_object_or_404(Customer, id=customer_id)
    return render(request, 'partials/customer_selected.html', {'customer': customer})

def create_customer_form(request):
    form = CustomerForm()
    return render(request, "partials/customer_form.html", {"form": form})

def load_new_customer_fields(request):
    return render(request, 'partials/new_customer_fields.html')

def customer_create_inline(request):
    if request.method == 'POST':
        form = CustomerInlineForm(request.POST)
        if form.is_valid():
            customer = form.save()
            return JsonResponse({
                'success': True,
                'id': customer.id,
                'label': f"{customer.first_name} ({customer.phone_number})"
            })
        return render(request, 'partials/customer_form_inline.html', {'form': form})
    else:
        form = CustomerInlineForm()
        return render(request, 'partials/customer_form_inline.html', {'form': form})

def asset_create_inline(request):
    if request.method == 'POST':
        form = CustomerAssetInlineForm(request.POST)
        if form.is_valid():
            asset = form.save()
            return JsonResponse({
                'success': True,
                'id': asset.id,
                'label': f"{asset.device} ({asset.serial_number})"
            })
        return render(request, 'partials/device_form_inline.html', {'form': form})
    else:
        form = CustomerAssetInlineForm()
        return render(request, 'partials/device_form_inline.html', {'form': form})

def get_customer_assets(request, pk):
    customer = get_object_or_404(Customer, pk=pk)
    assets = customer.asset_set.select_related('device').all()
    html = render_to_string("partials/customer_assets_table.html", {"assets": assets})
    return HttpResponse(html)

class CustomerAPISearchView(TenantScopedMixin, generics.ListAPIView):
    queryset = Customer.objects.select_related("address")
    serializer_class = CustomerSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        tenant = getattr(self.request, "tenant", None)

        if not user.is_superuser:
            if not tenant or not user.has_permission('view_all_customers', tenant):
                return qs.none()

        query = self.request.query_params.get('q', '').strip()
        if not query:
            return qs.none()

        filters = (
            Q(first_name__icontains=query) |
            Q(last_name__icontains=query) |
            Q(workitem__reference_id__icontains=query)
        )

        phone_query = ''.join(filter(str.isdigit, query))
        if phone_query:
            filters |= Q(phone_number__startswith=phone_query)

        return qs.filter(filters).distinct()[:10]

# class CustomerCreateListView(generics.ListCreateAPIView):
#     queryset = Customer.objects.all()
#     serializer_class = CustomerSerializer

class CustomerViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    queryset = Customer.objects.select_related("address")
    serializer_class = CustomerSerializer

    def get_queryset(self):
        # Tenant scoping handled by TenantScopedMixin; narrow by user permissions here
        qs = super().get_queryset()
        user = self.request.user
        tenant = getattr(self.request, "tenant", None)

        if user.is_superuser or not tenant:
            return qs

        if user.has_permission('view_all_customers', tenant):
            return qs

        return qs.none()

    def perform_create(self, serializer):
        user = self.request.user
        if user.is_superuser:
            serializer.save()
            return

        if not user.has_permission('customers.add_customer', self.request.tenant):
            raise PermissionDenied("You don't have permission to add customers.")

        super().perform_create(serializer)

    def perform_update(self, serializer):
        user = self.request.user

        if user.is_superuser:
            serializer.save()
            return

        if not user.has_permission('customers.change_customer', self.request.tenant):
            raise PermissionDenied("You don't have permission to change customers.")

        serializer.save()

    def perform_destroy(self, instance):
        user = self.request.user

        if user.is_superuser:
            instance.delete()
            return

        if not user.has_permission('customers.delete_customer', self.request.tenant):
            raise PermissionDenied("You don't have permission to delete customers.")

        instance.delete()

@api_view(["GET"])
def get_referral_sources(request):
    choices = [
        {"value": key, "label": label}
        for key, label in Customer._meta.get_field("referral_source").choices
    ]
    return Response(choices)

# class CustomerSearchView(GenericSearchView):
#     queryset = Customer.objects.all()
#     serializer_class = CustomerSerializer
#     search_fields = ['first_name', 'last_name', 'email', 'phone_number']

@api_view(["GET"])
def customer_assets_api(request, pk):
    """Return all assets (devices) for a given customer."""
    customer = get_object_or_404(Customer, pk=pk, tenant=getattr(request, "tenant", None))
    assets = customer.asset_set.select_related("device").all()
    serializer = AssetSerializer(assets, many=True)
    return Response(serializer.data)


# Where we cut the fault description when it is used as a last-resort device
# name. The call screen has one line, not a paragraph.
DEVICE_LABEL_MAX = 40

# A separate logger so the lookup audit trail can be routed to its own file or
# to an alerting system without mixing it into the rest of the app's logs.
lookup_audit_log = logging.getLogger("customers.lookup_audit")


def _mask_phone(e164):
    """+48601234567 -> +48601***567

    Enough stays in the log to correlate queries. A full number would be
    personal data sitting outside the database's access controls.
    """
    if not e164 or len(e164) < 8:
        return "***"
    return f"{e164[:6]}***{e164[-3:]}"


def _device_label(work_item):
    """Device name to show the person answering, e.g. "Apple iPhone 13".

    Source order: manufacturer and model, then category, and finally a truncated
    fault description. `device.model` alone is not enough, because it is
    sometimes empty.
    """
    asset = work_item.customer_asset
    device = asset.device if asset else None

    if device:
        label = " ".join(part for part in (device.manufacturer, device.model) if part).strip()
        if label:
            return label
        if device.category and device.category.name:
            return device.category.name

    description = (work_item.description or "").strip()
    if len(description) > DEVICE_LABEL_MAX:
        return description[:DEVICE_LABEL_MAX].rstrip() + "..."
    return description


def _work_item_v2(work_item, status_index):
    return {
        "id": work_item.id,
        "reference_id": work_item.reference_id or "",
        "device_label": _device_label(work_item),
        "stage_label": status_label(work_item.status, status_index),
        "is_closed": is_closed_status(work_item.status, status_index),
        "created_date": work_item.created_date.isoformat() if work_item.created_date else "",
    }


def _lookup_response_v2(tenant, customer, phone_e164):
    """Contract used by the mobile app.

    Always 200: the app has a fraction of a second to decide whether to show
    anything at all, and a 404 is indistinguishable from a network failure or
    a bad token.
    """
    empty = {
        "match": "none",
        "customer": None,
        "lead": None,
        "latest_work_item": None,
        "open_work_item_count": 0,
    }

    if customer is None:
        lead = (
            Lead.objects.filter(tenant=tenant, phone_e164=phone_e164)
            .order_by('-id')
            .first()
        )
        if lead is None:
            return Response(empty)
        return Response({
            **empty,
            "match": "lead",
            "lead": {"id": lead.id, "name": lead.full_name()},
        })

    status_index = workitem_status_index(tenant)

    latest = (
        WorkItem.objects.filter(tenant=tenant, customer=customer)
        .select_related('customer_asset__device__category')
        .order_by('-created_date')
        .first()
    )

    # Closed statuses come from the tenant's picklist, not from a literal in the
    # code. Statuses unknown to the picklist do not appear here, so they count
    # as open - consistent with `is_closed_status`.
    closed_values = [
        value for value, pv in status_index.items()
        if pv.status_role in CLOSED_ROLES
    ]
    open_count = (
        WorkItem.objects.filter(tenant=tenant, customer=customer)
        .exclude(status__in=closed_values)
        .count()
    )

    return Response({
        "match": "customer",
        "customer": {"id": customer.id, "name": customer.full_name()},
        "lead": None,
        "latest_work_item": _work_item_v2(latest, status_index) if latest else None,
        "open_work_item_count": open_count,
    })


@api_view(["GET"])
@throttle_classes([CustomerLookupThrottle])
def customer_lookup(request):
    """
    Lookup customer by phone number.
    Returns customer info, active work items (status != 'Resolved'),
    and latest closed work item (status == 'Resolved') as fallback.
    """
    phone_param = request.GET.get('phone', '').strip()

    if not phone_param:
        return Response(
            {"error": "Phone number parameter is required"},
            status=400
        )

    tenant = getattr(request, 'tenant', None)
    if not tenant:
        return Response(
            {"error": "Tenant not resolved"},
            status=400
        )

    # A single query on an indexed field. The same normalisation runs in
    # `incoming_call`, so the two endpoints cannot drift apart.
    phone_e164 = to_e164(phone_param, region_for_tenant(tenant))
    if not phone_e164:
        return Response(
            {"error": "Invalid phone number format"},
            status=400
        )

    customer = (
        Customer.objects.filter(tenant=tenant, phone_e164=phone_e164)
        .select_related('address')
        .order_by('-id')
        .first()
    )

    # Audit trail for every query: who, when, which number and whether it hit.
    # Meant for spotting unusual volume - someone walking a range of numbers
    # leaves a run of "found=False" entries under a single account.
    lookup_audit_log.info(
        "lookup tenant=%s user=%s phone=%s found=%s",
        getattr(tenant, 'subdomain', '?'),
        getattr(request.user, 'email', None) or request.user,
        _mask_phone(phone_e164),
        bool(customer),
    )

    # The mobile app asks for ?v=2: a different contract, because it has to tell
    # "not a customer" apart from "the request failed". Without the parameter we
    # keep the original behaviour, 404 included - the frontend and existing
    # tests rely on it.
    if request.GET.get('v') == '2':
        return _lookup_response_v2(tenant, customer, phone_e164)

    if not customer:
        return Response(
            {"error": "Customer not found"},
            status=404
        )

    customer_data = {
        "id": customer.id,
        "first_name": customer.first_name,
        "last_name": customer.last_name or "",
    }

    def _work_item_dict(wi):
        device_model = ""
        if wi.customer_asset and wi.customer_asset.device:
            device_model = wi.customer_asset.device.model or ""
        return {
            "id": wi.id,
            "reference_id": wi.reference_id or "",
            "status": wi.status,
            "device_model": device_model,
            "created_date": wi.created_date.isoformat() if wi.created_date else "",
        }

    active_qs = WorkItem.objects.filter(
        tenant=tenant,
        customer=customer,
    ).exclude(status='Resolved').select_related(
        'customer_asset__device'
    ).order_by('-created_date')[:3]

    active_work_items = [_work_item_dict(wi) for wi in active_qs]

    latest_closed_wi = WorkItem.objects.filter(
        tenant=tenant,
        customer=customer,
        status='Resolved'
    ).select_related('customer_asset__device').order_by('-created_date').first()

    latest_closed_work_item = _work_item_dict(latest_closed_wi) if latest_closed_wi else None

    return Response({
        "customer": customer_data,
        "active_work_items": active_work_items,
        "latest_closed_work_item": latest_closed_work_item,
    })


class LeadViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    queryset = Lead.objects.all()
    serializer_class = LeadSerializer
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    @action(detail=True, methods=['post'], url_path='convert')
    @transaction.atomic
    def convert(self, request, pk=None):
        lead = self.get_object()
        if lead.status == 'converted':
            return Response({'detail': 'Lead już skonwertowany.'}, status=400)
        tenant = request.tenant
        customer = None
        if lead.email:
            customer = Customer.objects.filter(tenant=tenant, email=lead.email).first()
        if not customer and lead.phone_number:
            customer = Customer.objects.filter(
                tenant=tenant, prefix=lead.prefix, phone_number=lead.phone_number
            ).first()
        if not customer:
            customer = Customer.objects.create(
                tenant=tenant,
                first_name=lead.first_name,
                last_name=lead.last_name or '',
                email=lead.email,
                prefix=lead.prefix,
                phone_number=lead.phone_number,
            )
        lead.status = 'converted'
        lead.save(update_fields=['status'])
        return Response(CustomerSerializer(customer, context={'request': request}).data)
