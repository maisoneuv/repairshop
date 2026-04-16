from django.db.models.expressions import result
from django.shortcuts import render, reverse, get_object_or_404
from django.template.loader import render_to_string
from rest_framework import generics, viewsets
from rest_framework.decorators import api_view, action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from django.db import transaction

import phonenumbers
from phonenumbers import NumberParseException

from core.mixins import TenantScopedMixin
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


class AssetRetrieveUpdateAPIView(generics.RetrieveUpdateAPIView):
    """API endpoint for retrieving and updating asset information"""
    queryset = Asset.objects.all()
    serializer_class = AssetSerializer


class AssetViewSet(viewsets.ModelViewSet):
    """API endpoint for listing and creating customer assets (devices)"""
    serializer_class = AssetSerializer

    def get_queryset(self):
        user = self.request.user
        tenant = getattr(self.request, "tenant", None)

        if user.is_superuser:
            qs = Asset.objects.select_related("device", "customer").all()
        else:
            if not tenant:
                return Asset.objects.none()
            qs = Asset.objects.select_related("device", "customer").filter(
                customer__tenant=tenant
            )

        # Optional filtering by customer_id
        customer_id = self.request.query_params.get('customer_id')
        if customer_id:
            qs = qs.filter(customer_id=customer_id)

        return qs

    def perform_create(self, serializer):
        user = self.request.user
        tenant = getattr(self.request, "tenant", None)

        if not user.is_superuser and not tenant:
            raise PermissionDenied("Tenant not resolved")

        serializer.save()

    def perform_update(self, serializer):
        user = self.request.user
        tenant = getattr(self.request, "tenant", None)

        if not user.is_superuser:
            instance = self.get_object()
            if instance.customer.tenant_id != tenant.id:
                raise PermissionDenied("Cannot modify assets from another tenant")

        serializer.save()

    def perform_destroy(self, instance):
        user = self.request.user
        tenant = getattr(self.request, "tenant", None)

        if not user.is_superuser:
            if instance.customer.tenant_id != tenant.id:
                raise PermissionDenied("Cannot delete assets from another tenant")

        instance.delete()


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
    print(f"query: {query}")
    if not query:
        customers = Customer.objects.none()
    else:
        customers = Customer.objects.filter(
            Q(first_name__icontains=query) | Q(email__icontains=query) | Q(phone_number__icontains=query)
        )
    print(f"customers: {customers}")
    if customers.exists():
        return render(request, 'partials/customer_search_results.html', {'customers': customers})
    else:
        return render(request, 'partials/no_customer_found.html')

def select_customer(request, customer_id):
    customer = get_object_or_404(Customer, id=customer_id)
    print(f"customer selected: {customer}")
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
        else:
            print("Form is NOT valid")
            print(form.errors)
        return render(request, 'partials/device_form_inline.html', {'form': form})
    else:
        form = CustomerAssetInlineForm()
        return render(request, 'partials/device_form_inline.html', {'form': form})

def get_customer_assets(request, pk):
    print(pk)
    customer = get_object_or_404(Customer, pk=pk)
    print('customer', customer)
    assets = customer.asset_set.select_related('device').all()
    print('assets:', assets)
    html = render_to_string("partials/customer_assets_table.html", {"assets": assets})
    return HttpResponse(html)

class CustomerAPISearchView(generics.ListAPIView):
    serializer_class = CustomerSerializer

    def get_queryset(self):
        user = self.request.user

        if user.is_superuser:
            qs = Customer.objects.select_related("address").all()
        else:
            if not self.request.tenant:
                return Customer.objects.none()

            if not user.has_permission('view_all_customers', self.request.tenant):
                return Customer.objects.none()

            qs = Customer.objects.select_related("address").filter(tenant=self.request.tenant)

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
    serializer_class = CustomerSerializer

    def get_queryset(self):
        user = self.request.user

        if user.is_superuser:
            return Customer.objects.select_related("address").all()

        if not self.request.tenant:
            return Customer.objects.none()

        qs = Customer.objects.select_related("address").filter(tenant=self.request.tenant)

        if user.has_permission('view_all_customers', self.request.tenant):
            return qs

        return Customer.objects.none()

    def perform_create(self, serializer):
        user = self.request.user
        print(f'customer requests: {self.request.data}')
        print("resolved tenant:", getattr(self.request, "tenant", None))
        if user.is_superuser:
            serializer.save()
            return

        if not user.has_permission('customers.add_customer', self.request.tenant):
            raise PermissionDenied("You don't have permission to add customers.")

        serializer.save(tenant=self.request.tenant)

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
    customer = get_object_or_404(Customer, pk=pk)
    assets = customer.asset_set.select_related("device").all()
    serializer = AssetSerializer(assets, many=True)
    return Response(serializer.data)


@api_view(["GET"])
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

    prefix = None
    phone_number = None

    try:
        parsed = phonenumbers.parse(phone_param, None)
        prefix = f"+{parsed.country_code}"
        phone_number = str(parsed.national_number)
    except NumberParseException:
        digits = ''.join(filter(str.isdigit, phone_param))
        if not digits:
            return Response(
                {"error": "Invalid phone number format"},
                status=400
            )

        if phone_param.strip().startswith('+'):
            for i in range(1, min(5, len(digits) + 1)):
                prefix_candidate = f"+{digits[:i]}"
                phone_candidate = digits[i:]
                customer = Customer.objects.filter(
                    tenant=tenant,
                    prefix=prefix_candidate,
                    phone_number=phone_candidate
                ).first()
                if customer:
                    prefix = prefix_candidate
                    phone_number = phone_candidate
                    break
            else:
                prefix = None
                phone_number = digits
        else:
            prefix = None
            phone_number = digits

    customer = None

    if prefix:
        customer = Customer.objects.filter(
            tenant=tenant,
            prefix=prefix,
            phone_number=phone_number
        ).select_related('address').first()

    if not customer:
        customer = Customer.objects.filter(
            tenant=tenant,
            phone_number=phone_number
        ).select_related('address').first()

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
    serializer_class = LeadSerializer
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        if self.request.user.is_superuser:
            return Lead.objects.all()
        if getattr(self.request, 'tenant', None):
            return Lead.objects.filter(tenant=self.request.tenant)
        return Lead.objects.none()

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant)

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
