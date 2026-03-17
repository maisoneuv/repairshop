from decimal import Decimal
from datetime import timedelta

from django.http import JsonResponse
from django.shortcuts import render, redirect, reverse, get_object_or_404
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone

from customers.serializers import CustomerSerializer
from service.models import CashRegister, CashTransaction, CashTransactionType, Employee
from service.serializers import EmployeeSerializer
from .models import WorkItem, Task, TaskType
from .forms import WorkItemForm, TaskForm
from django.views.generic import TemplateView, ListView, DetailView, CreateView, UpdateView
from django.db.models import Q, Sum, Count
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
import django_filters
import uuid
from django.db import transaction
from .serializers import WorkItemSerializer, TaskSerializer, TaskTypeSerializer
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated  # or AllowAny for dev
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.exceptions import PermissionDenied
from core.models import Note, PicklistValue

from core.utils import get_model_schema


# def work_item_list(request):
#     items = WorkItem.objects.all()
#     context = {
#         "items": items
#     }
#     return render(request, "tasks/work_item_list.html", context)


class WorkItemListView(ListView):
    template_name = "tasks/work_item_list.html"
    queryset = WorkItem.objects.all()
    context_object_name = "items"


class WorkItemDetailView(DetailView):
    template_name = "tasks/work_item_detail.html"
    model = WorkItem

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        context["tasks"] = self.object.tasks.all()

        return context


# def work_item_detail(request, pk):
#     print(pk)
#     item = WorkItem.objects.get(id=pk)
#     context = {
#         "item": item
#     }
#     return render(request, "tasks/work_item_detail.html", context)

class WorkItemCreateView(CreateView):
    # template_name = "tasks/work_item_create.html"
    template_name = "tasks/work_item_form.html"
    form_class = WorkItemForm
    model = WorkItem

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['user'] = self.request.user
        return kwargs

    def get_initial(self):
        initial = super().get_initial()
        print(initial)
        user = self.request.user
        if hasattr(user, 'employee'):
            initial['owner'] = user.employee
            initial['customer_dropoff_point'] = user.employee.location.id

        print(initial)
        return initial

    def get_form(self, form_class=None):
        form = super().get_form(form_class)
        print("🧪 Form is bound:", form.is_bound)
        return form

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        context['device_search'] = reverse('tasks:device_search')
        print('context',context)
        return context


def work_item_create(request):
    from customers.models import Customer, Asset
    form = WorkItemForm()
    if request.method == "POST":
        form = WorkItemForm(request.POST)
        print('valid: ', form.is_valid())
        if form.is_valid():
            print('request: ', request.POST)
            work_item = form.save(commit=False)
            if hasattr(request, "tenant") and request.tenant:
                work_item.tenant = request.tenant
            else:
                raise ValueError("Tenant is required to create a work item.")
            print(work_item)
            customer_id = request.POST.get("customer_id")
            print(customer_id)
            if customer_id:

                work_item.customer = get_object_or_404(Customer, pk=customer_id)

            device_id = request.POST.get("device_id")
            print(device_id)
            if device_id:
                work_item.customer_asset = get_object_or_404(Asset, pk=device_id)

            if request.user.is_authenticated and hasattr(request.user, 'employee'):
                if not work_item.owner:
                    work_item.owner = request.user.employee
                if not work_item.customer_dropoff_point:
                    work_item.customer_dropoff_point = request.user.employee.location

            work_item.save()
            return redirect("tasks:work_item_detail", pk=work_item.pk)  # ✅ Use your real redirect URL name
        else:
            print("Form is NOT valid")
            print(form.errors)

    context = {
        "form": form
    }
    return render(request, "tasks/work_item_form.html", context)


class WorkItemUpdateView(UpdateView):
    template_name = "tasks/work_item_update.html"
    queryset = WorkItem.objects.all()
    form_class = WorkItemForm

    def get_success_url(self):
        return reverse("tasks:work_item_list")


# def work_item_update(request, pk):
#     item = WorkItem.objects.get(id=pk)
#     form = WorkItemForm(instance=item)
#     if request.method == "POST":
#         form = WorkItemForm(request.POST, instance=item)
#         if form.is_valid():
#             print(form.cleaned_data)
#             form.save()
#             return redirect("/tasks/item/" + pk)
#     context = {
#         "form": form,
#         "item": item
#     }
#
#     return render(request, "tasks/work_item_update.html", context)


class TaskListView(ListView):
    template_name = "tasks/task_list.html"
    queryset = Task.objects.all()
    context_object_name = "tasks"


class TaskDetailView(DetailView):
    template_name = "tasks/task_detail.html"
    queryset = Task.objects.all()
    context_object_name = "task"


class TaskCreateView(CreateView):
    template_name = "tasks/task_create.html"
    form_class = TaskForm

    def get_success_url(self):
        return reverse("tasks:task_list")


class TaskUpdateView(UpdateView):
    template_name = "tasks/task_update.html"
    queryset = Task.objects.all()
    form_class = TaskForm

    def get_success_url(self):
        return reverse("tasks:task_list")

# def work_item_create(request):
#     from customers.models import Customer
#     if request.method == "POST":
#         customer_id = request.POST.get("customer_id")
#         customer = Customer.objects.get(id=customer_id)
#         form = WorkItemForm(request.POST)
#         if form.is_valid():
#             work_item = form.save(commit=False)
#             work_item.customer = customer
#             work_item.save()
#         return render(request, 'work_item/partials/work_item_create.html', {'work_item': work_item})
#     else:
#         form = WorkItemForm()
#         return render(request, 'work_item/work_item_form.html', {'form': form})

def customer_search(request):
    from customers.models import Customer
    query = request.GET.get('customer-search','')
    print(f"query: {query}")
    if not query:
        customers = Customer.objects.none()
    else:
        customers = Customer.objects.filter(
            Q(first_name__startswith=query) |
            Q(email__startswith=query) |
            Q(phone_number__startswith=query)
        )[:5]
    print(customers)
    return render(request, 'partials/customer_search_results.html', {'customers':customers})


def device_search(request):
    from inventory.models import Device
    print(request.GET)
    query = request.GET.get('device-search', '')
    if not query:
        devices = Device.objects.none()
    else:
        devices = Device.objects.filter(
            Q(manufacturer__istartswith=query) |
            Q(model__istartswith=query)
        )[:5]
    print(devices)
    return render(request, 'partials/device_search_results.html', {'devices': devices})


#serializers

class WorkItemFilter(django_filters.FilterSet):
    """Custom filter to support filtering work items by customer (direct or via asset)"""
    customer = django_filters.NumberFilter(method='filter_by_customer')

    # Date range filters
    created_after = django_filters.DateFilter(field_name='created_date', lookup_expr='gte')
    created_before = django_filters.DateFilter(field_name='created_date', lookup_expr='lte')
    closed_after = django_filters.DateFilter(field_name='closed_date', lookup_expr='gte')
    closed_before = django_filters.DateFilter(field_name='closed_date', lookup_expr='lte')
    due_after = django_filters.DateFilter(field_name='due_date', lookup_expr='gte')
    due_before = django_filters.DateFilter(field_name='due_date', lookup_expr='lte')

    def filter_by_customer(self, queryset, name, value):
        """Filter work items by customer ID - includes items where customer is direct or via asset"""
        print(f"[WorkItemFilter] Filtering by customer ID: {value}")
        print(f"[WorkItemFilter] Initial queryset count: {queryset.count()}")
        filtered = queryset.filter(
            Q(customer_id=value) | Q(customer_asset__customer_id=value)
        ).distinct()
        print(f"[WorkItemFilter] Filtered queryset count: {filtered.count()}")
        return filtered

    class Meta:
        model = WorkItem
        fields = ['customer', 'customer_asset', 'status', 'type', 'owner', 'technician']

class WorkItemViewSet(viewsets.ModelViewSet):
    serializer_class = WorkItemSerializer
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    filterset_class = WorkItemFilter
    search_fields = [
        "reference_id",  # Only allow searching by reference/RMA ID for autocomplete linking
    ]

    def get_queryset(self):
        user = self.request.user

        # Optimize queries by selecting related objects
        base_qs = WorkItem.objects.select_related(
            'customer_asset__device__category',
            'customer_asset__device',
            'customer',
            'owner',
            'technician',
            'pickup_point',
            'dropoff_point',
            'fulfillment_shop'
        )

        tenant = getattr(self.request, 'tenant', None)

        if user.is_superuser:
            return base_qs.all()

        if not tenant:
            return WorkItem.objects.none()

        qs = base_qs.filter(tenant=tenant)

        # Allow search requests (used by the task form autocomplete) to skip user-level filtering
        if self.request.query_params.get('search'):
            return qs

        if user.has_permission('view_all_workitems', tenant):
            return qs

        if user.has_permission('view_own_workitems', tenant):
            return qs.filter(
                Q(technician__user=user) |
                Q(owner__user=user)
            )

        return WorkItem.objects.none()

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["tenant"] = getattr(self.request, "tenant", None)
        return ctx

    def perform_create(self, serializer):
        if not self.request.tenant:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"detail": "X-Tenant header required"})
        if not self.request.user.has_permission('tasks.add_workitem', self.request.tenant):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have permission to create a work item")
        serializer.save(tenant=self.request.tenant)

    def perform_update(self, serializer):
        user = self.request.user

        if not user.is_superuser:
            if not user.has_permission('tasks.change_workitem', self.request.tenant):
                raise PermissionDenied("You don't have permission to change work items.")

        # Tag the instance with the user who made the change (used by signals for notes)
        instance = serializer.instance
        instance._changed_by = self.request.user

        # Capture old values before saving
        old_register_id = instance.payment_register_id
        old_prepaid = instance.prepaid_amount or Decimal('0.00')
        old_final = instance.final_price or Decimal('0.00')

        serializer.save()

        # Reload to get new values
        instance.refresh_from_db()
        new_register_id = instance.payment_register_id
        new_prepaid = instance.prepaid_amount or Decimal('0.00')
        new_final = instance.final_price or Decimal('0.00')

        # Resolve the employee performing the action
        performed_by = None
        try:
            performed_by = Employee.objects.get(user=user, tenant=self.request.tenant)
        except Employee.DoesNotExist:
            pass

        self._handle_auto_transactions(
            instance=instance,
            old_register_id=old_register_id,
            new_register_id=new_register_id,
            old_prepaid=old_prepaid,
            new_prepaid=new_prepaid,
            old_final=old_final,
            new_final=new_final,
            performed_by=performed_by,
        )

    def _handle_auto_transactions(
        self, instance, old_register_id, new_register_id,
        old_prepaid, new_prepaid, old_final, new_final, performed_by
    ):
        """Auto-create CashTransaction records when payment_register and amounts change."""
        if not new_register_id:
            return

        register_changed = old_register_id != new_register_id
        prepaid_changed = old_prepaid != new_prepaid
        final_changed = old_final != new_final

        if not register_changed and not prepaid_changed and not final_changed:
            return

        with transaction.atomic():
            # Case 1: Register was just assigned (wasn't set before)
            if register_changed and not old_register_id:
                # Create deposits for any existing amounts
                if new_prepaid > 0:
                    CashTransaction.objects.create(
                        tenant=instance.tenant,
                        register_id=new_register_id,
                        transaction_type=CashTransactionType.DEPOSIT,
                        amount=new_prepaid,
                        currency=instance.currency or 'PLN',
                        work_item=instance,
                        description=f"Prepaid amount for {instance.reference_id}",
                        performed_by=performed_by,
                    )
                if new_final > 0:
                    CashTransaction.objects.create(
                        tenant=instance.tenant,
                        register_id=new_register_id,
                        transaction_type=CashTransactionType.DEPOSIT,
                        amount=new_final,
                        currency=instance.currency or 'PLN',
                        work_item=instance,
                        description=f"Final price payment for {instance.reference_id}",
                        performed_by=performed_by,
                    )
                return

            # Case 2: Register changed from one to another
            if register_changed and old_register_id:
                # Reverse all previous auto-transactions on the old register for this work item
                old_total = CashTransaction.objects.filter(
                    register_id=old_register_id,
                    work_item=instance,
                ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

                if old_total != Decimal('0.00'):
                    CashTransaction.objects.create(
                        tenant=instance.tenant,
                        register_id=old_register_id,
                        transaction_type=CashTransactionType.WITHDRAWAL,
                        amount=abs(old_total),
                        currency=instance.currency or 'PLN',
                        work_item=instance,
                        description=f"Register reassignment - reversed for {instance.reference_id}",
                        performed_by=performed_by,
                    )

                # Create deposits on the new register
                if new_prepaid > 0:
                    CashTransaction.objects.create(
                        tenant=instance.tenant,
                        register_id=new_register_id,
                        transaction_type=CashTransactionType.DEPOSIT,
                        amount=new_prepaid,
                        currency=instance.currency or 'PLN',
                        work_item=instance,
                        description=f"Prepaid amount for {instance.reference_id}",
                        performed_by=performed_by,
                    )
                if new_final > 0:
                    CashTransaction.objects.create(
                        tenant=instance.tenant,
                        register_id=new_register_id,
                        transaction_type=CashTransactionType.DEPOSIT,
                        amount=new_final,
                        currency=instance.currency or 'PLN',
                        work_item=instance,
                        description=f"Final price payment for {instance.reference_id}",
                        performed_by=performed_by,
                    )
                return

            # Case 3: Same register, but amounts changed
            if prepaid_changed:
                diff = new_prepaid - old_prepaid
                if diff != Decimal('0.00'):
                    if diff > 0:
                        CashTransaction.objects.create(
                            tenant=instance.tenant,
                            register_id=new_register_id,
                            transaction_type=CashTransactionType.DEPOSIT,
                            amount=diff,
                            currency=instance.currency or 'PLN',
                            work_item=instance,
                            description=f"Prepaid amount updated for {instance.reference_id}",
                            performed_by=performed_by,
                        )
                    else:
                        CashTransaction.objects.create(
                            tenant=instance.tenant,
                            register_id=new_register_id,
                            transaction_type=CashTransactionType.WITHDRAWAL,
                            amount=abs(diff),
                            currency=instance.currency or 'PLN',
                            work_item=instance,
                            description=f"Prepaid amount reduced for {instance.reference_id}",
                            performed_by=performed_by,
                        )

            if final_changed:
                diff = new_final - old_final
                if diff != Decimal('0.00'):
                    if diff > 0:
                        CashTransaction.objects.create(
                            tenant=instance.tenant,
                            register_id=new_register_id,
                            transaction_type=CashTransactionType.DEPOSIT,
                            amount=diff,
                            currency=instance.currency or 'PLN',
                            work_item=instance,
                            description=f"Final price updated for {instance.reference_id}",
                            performed_by=performed_by,
                        )
                    else:
                        CashTransaction.objects.create(
                            tenant=instance.tenant,
                            register_id=new_register_id,
                            transaction_type=CashTransactionType.WITHDRAWAL,
                            amount=abs(diff),
                            currency=instance.currency or 'PLN',
                            work_item=instance,
                            description=f"Final price reduced for {instance.reference_id}",
                            performed_by=performed_by,
                        )

    def perform_destroy(self, instance):
        user = self.request.user

        if user.is_superuser:
            instance.delete()
            return

        if not user.has_permission('tasks.delete_workitem', self.request.tenant):
            raise PermissionDenied("You don't have permission to delete work items.")

        instance.delete()

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()

        user = request.user
        if not user.is_superuser:
            if not request.tenant:
                raise PermissionDenied("Tenant not specified.")

            if instance.tenant != request.tenant:
                raise PermissionDenied("This item does not belong to your tenant.")

            if not (
                user.has_permission('view_all_workitems', request.tenant) or
                (user.has_permission('view_own_workitems', request.tenant) and instance.technician and instance.technician.user == user)
            ):
                raise PermissionDenied("You don't have permission to view this work item.")

        serializer = self.get_serializer(instance)
        data = serializer.data

        include = request.query_params.get("include", "")
        includes = [part.strip() for part in include.split(",") if part.strip()]

        if "customerDetails" in includes and instance.customer_id:
            data["customerDetails"] = CustomerSerializer(instance.customer).data

        if "deviceDetails" in includes and instance.customer_asset_id:
            from customers.serializers import AssetSerializer
            data["deviceDetails"] = AssetSerializer(instance.customer_asset).data

        if "owner" in includes and instance.owner_id:
            data["owner"] = EmployeeSerializer(instance.owner).data

        return Response(data)

    @action(detail=True, methods=['post'], url_path='request-summary')
    def request_summary(self, request, pk=None):
        """
        Trigger AI summary generation for this work item.

        POST /api/tasks/work-items/{id}/request-summary/

        Returns:
            202 Accepted with request_id for tracking
        """
        workitem = self.get_object()

        # Check permission
        user = request.user
        if not user.is_superuser and not user.has_permission('tasks.change_workitem', request.tenant):
            raise PermissionDenied("You don't have permission to generate summaries for work items.")

        # Check if already pending
        if workitem.summary_status == 'pending':
            return Response(
                {'error': 'Summary generation already in progress'},
                status=status.HTTP_409_CONFLICT
            )

        # Generate unique request ID for callback correlation
        request_id = uuid.uuid4()

        # Update work item status
        workitem.summary_status = 'pending'
        workitem.summary_request_id = request_id
        workitem.save(update_fields=['summary_status', 'summary_request_id'])

        # Import here to avoid circular imports
        from integrations.signals.workitem import trigger_summary_request

        # Use transaction.on_commit to ensure save completes first
        # Bind the values explicitly to avoid late binding issues
        transaction.on_commit(
            lambda wi=workitem, rid=request_id: trigger_summary_request(wi, rid)
        )

        return Response({
            'message': 'Summary generation requested',
            'request_id': str(request_id),
            'status': 'pending'
        }, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=['get'], url_path='summary-status')
    def summary_status(self, request, pk=None):
        """
        Check the status of AI summary generation.

        GET /api/tasks/work-items/{id}/summary-status/
        """
        workitem = self.get_object()

        return Response({
            'status': workitem.summary_status,
            'summary': workitem.summary if workitem.summary_status == 'completed' else None,
            'generated_at': workitem.summary_generated_at.isoformat() if workitem.summary_generated_at else None,
            'request_id': str(workitem.summary_request_id) if workitem.summary_request_id else None
        })


class WorkItemSchemaView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        print("User:", request.user)
        print("Is authenticated:", request.user.is_authenticated)
        tenant = getattr(request, 'tenant', None)
        schema = get_model_schema(WorkItem, tenant=tenant)
        return Response(schema)

class TaskSchemaView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = getattr(request, 'tenant', None)
        schema = get_model_schema(Task, tenant=tenant)
        return Response(schema)

class TaskFilter(django_filters.FilterSet):
    """Custom filter to support filtering tasks by work item reference ID and date ranges"""
    # Custom filter for work item reference ID
    work_item_ref = django_filters.CharFilter(method='filter_by_work_item_reference')

    # Date range filters
    created_after = django_filters.DateFilter(field_name='created_date', lookup_expr='gte')
    created_before = django_filters.DateFilter(field_name='created_date', lookup_expr='lte')
    due_after = django_filters.DateFilter(field_name='due_date', lookup_expr='gte')
    due_before = django_filters.DateFilter(field_name='due_date', lookup_expr='lte')
    completed_after = django_filters.DateFilter(field_name='completed_date', lookup_expr='gte')
    completed_before = django_filters.DateFilter(field_name='completed_date', lookup_expr='lte')

    def filter_by_work_item_reference(self, queryset, name, value):
        """Filter tasks by work item reference_id (e.g., RMA-123)"""
        return queryset.filter(work_item__reference_id=value)

    class Meta:
        model = Task
        fields = ['reference_id', 'work_item', 'assigned_employee', 'status', 'task_type']

class TaskViewSet(viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    filter_backends = [filters.SearchFilter, DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = TaskFilter
    search_fields = [
        'reference_id',
        'summary',
        'description',
        'work_item__reference_id',
    ]
    ordering_fields = ['created_date', 'summary', 'status', 'assigned_employee', 'task_type__name']
    ordering = ["-created_date"]

    def get_queryset(self):
        user = self.request.user

        # Base queryset with common select_related for performance
        base_qs = Task.objects.select_related('assigned_employee', 'task_type')

        # Check for include parameter to optimize queries
        include = self.request.query_params.get("include", "")
        includes = [part.strip() for part in include.split(",") if part.strip()]

        if "workItem" in includes or "deviceName" in includes:
            base_qs = base_qs.select_related('work_item')

        if "deviceName" in includes:
            base_qs = base_qs.select_related('work_item__customer_asset__device')

        if user.is_superuser:
            return base_qs.all()

        if not self.request.tenant:
            return Task.objects.none()

        qs = base_qs.filter(tenant=self.request.tenant)

        if user.has_permission('view_all_tasks', self.request.tenant):
            return qs

        if user.has_permission('view_own_tasks', self.request.tenant):
            return qs.filter(assigned_employee__user=user)

        return Task.objects.none()

    def perform_create(self, serializer):
        user = self.request.user
        tenant = getattr(self.request, "tenant", None)

        if tenant is None:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"detail": "X-Tenant header required"})

        if user.is_superuser:
            serializer.save(tenant=tenant)
            return

        has_perm = hasattr(user, "has_permission") and user.has_permission('tasks.add_task', tenant)
        if not has_perm:
            raise PermissionDenied("You don't have permission to add tasks.")

        serializer.save(tenant=tenant)

    def perform_update(self, serializer):
        user = self.request.user

        if not user.is_superuser:
            if not user.has_permission('tasks.change_task', self.request.tenant):
                raise PermissionDenied("You don't have permission to change tasks.")

        # Tag the instance with the user who made the change (used by signals for notes)
        serializer.instance._changed_by = user
        serializer.save()

    def perform_destroy(self, instance):
        user = self.request.user

        if user.is_superuser:
            instance.delete()
            return

        if not user.has_permission('tasks.delete_task', self.request.tenant):
            raise PermissionDenied("You don't have permission to delete tasks.")

        instance.delete()

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)

        if page is not None:
            serializer = self.get_serializer(page, many=True)
            data = self._add_includes_to_list(serializer.data, page)
            return self.get_paginated_response(data)

        serializer = self.get_serializer(queryset, many=True)
        data = self._add_includes_to_list(serializer.data, queryset)
        return Response(data)

    def _add_includes_to_list(self, data, instances):
        """Add included fields to list response based on include query parameter"""
        include = self.request.query_params.get("include", "")
        includes = [part.strip() for part in include.split(",") if part.strip()]

        if not includes:
            return data

        # Enhance each item in the list with requested includes
        for i, instance in enumerate(instances):
            if "workItem" in includes and instance.work_item_id:
                data[i]["work_item"] = {
                    "id": instance.work_item.id,
                    "reference_id": instance.work_item.reference_id
                }

            if "deviceName" in includes:
                device_name = self._get_device_name(instance)
                data[i]["device_name"] = device_name

        return data

    def _get_device_name(self, task):
        """Extract device name from task's work item"""
        if not task.work_item:
            return None
        work_item = task.work_item
        if not work_item.customer_asset:
            return None
        asset = work_item.customer_asset
        if not asset.device:
            return None
        device = asset.device
        manufacturer = device.manufacturer or ""
        model = device.model or ""
        if manufacturer and model:
            return f"{manufacturer} {model}".strip()
        return model or manufacturer or None

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        user = request.user

        if not user.is_superuser:
            if not request.tenant:
                raise PermissionDenied("Tenant not specified.")

            if instance.tenant != request.tenant:
                raise PermissionDenied("This task does not belong to your tenant.")

            if not (
                user.has_permission('view_all_tasks', request.tenant) or
                (user.has_permission('view_own_tasks', request.tenant) and instance.assigned_employee.user == user)
            ):
                raise PermissionDenied("You don't have permission to view this task.")

        serializer = self.get_serializer(instance)
        data = serializer.data

        include = request.query_params.get("include", "")
        includes = [part.strip() for part in include.split(",") if part.strip()]

        if "workItemDetails" in includes and instance.work_item_id:
            work_item = instance.work_item

            if user.is_superuser:
                work_item_data = WorkItemSerializer(work_item).data

                # Add customerDetails and deviceDetails to work item
                if work_item.customer_id:
                    from customers.serializers import CustomerSerializer
                    work_item_data["customerDetails"] = CustomerSerializer(work_item.customer).data

                if work_item.customer_asset_id:
                    from customers.serializers import AssetSerializer
                    work_item_data["deviceDetails"] = AssetSerializer(work_item.customer_asset).data

                data["workItemDetails"] = work_item_data

            elif (
                    user.has_permission('view_all_workitems', request.tenant) or
                    (user.has_permission('view_own_workitems', request.tenant) and work_item.technician and work_item.technician.user == user)
            ):
                work_item_data = WorkItemSerializer(work_item).data

                # Add customerDetails and deviceDetails to work item
                if work_item.customer_id:
                    from customers.serializers import CustomerSerializer
                    work_item_data["customerDetails"] = CustomerSerializer(work_item.customer).data

                if work_item.customer_asset_id:
                    from customers.serializers import AssetSerializer
                    work_item_data["deviceDetails"] = AssetSerializer(work_item.customer_asset).data

                data["workItemDetails"] = work_item_data

            else:
                data["workItemDetails"] = None

        if "assignedEmployee" in includes and instance.assigned_employee_id:
            data["assignedEmployee"] = EmployeeSerializer(instance.assigned_employee).data

        return Response(data)


class TaskTypeViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing task types.
    Allows listing, creating, updating, and deleting task types.
    """
    serializer_class = TaskTypeSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['name', 'created_date']
    ordering = ['name']

    def get_queryset(self):
        """Filter task types by tenant and active status"""
        user = self.request.user

        if user.is_superuser:
            return TaskType.objects.all()

        if not self.request.tenant:
            return TaskType.objects.none()

        # Return only active task types for the current tenant
        return TaskType.objects.filter(tenant=self.request.tenant, is_active=True)

    def perform_create(self, serializer):
        """Set tenant when creating a new task type"""
        tenant = getattr(self.request, "tenant", None)

        if tenant is None:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"detail": "X-Tenant header required"})

        serializer.save(tenant=tenant)

    def perform_update(self, serializer):
        """Allow updating task types"""
        user = self.request.user

        if user.is_superuser:
            serializer.save()
            return

        # Check if user has permission to change task types
        # For now, allow any authenticated user to update task types
        serializer.save()

    def perform_destroy(self, instance):
        """Soft delete by marking as inactive instead of hard delete"""
        instance.is_active = False
        instance.save()


class DashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return Response({'detail': 'Tenant not resolved'}, status=status.HTTP_400_BAD_REQUEST)

        today = timezone.now().date()
        week_start = today - timedelta(days=today.weekday())  # Monday
        month_start = today.replace(day=1)

        # Resolve current employee and role
        try:
            current_employee = Employee.objects.get(user=request.user, tenant=tenant)
            is_manager = current_employee.role == 'Manager'
        except Employee.DoesNotExist:
            current_employee = None
            is_manager = True

        # Resolve status picklist values (single query)
        status_pv_by_name = {
            pv.name.lower(): pv.value
            for pv in PicklistValue.objects.filter(
                tenant=tenant, category='workitem_status', is_active=True
            )
        }
        resolved_status = status_pv_by_name.get('resolved')
        ready_status = status_pv_by_name.get('naprawione')

        # Base querysets
        wi_qs = WorkItem.objects.filter(tenant=tenant)
        if resolved_status:
            open_qs = wi_qs.exclude(status=resolved_status)
        else:
            open_qs = wi_qs.filter(closed_date__isnull=True)
        closed_qs = wi_qs.filter(closed_date__isnull=False)

        # Role-based scoping: non-managers see only their own work items
        if not is_manager and current_employee:
            wi_qs = wi_qs.filter(technician=current_employee)
            open_qs = open_qs.filter(technician=current_employee)
            closed_qs = closed_qs.filter(technician=current_employee)

        # --- KPIs (single query with conditional aggregation) ---
        kpi_filters = {
            'total_open': Count('id'),
            'overdue': Count('id', filter=Q(due_date__lt=today)),
            'unassigned': Count('id', filter=Q(technician__isnull=True)),
        }
        if ready_status:
            kpi_filters['ready_for_pickup'] = Count('id', filter=Q(status=ready_status))
        kpis = open_qs.aggregate(**kpi_filters)
        if not ready_status:
            kpis['ready_for_pickup'] = 0

        # --- Status Pipeline ---
        status_counts = (
            wi_qs.values('status')
            .annotate(count=Count('id'))
            .order_by('status')
        )
        picklist_map = {
            pv.value: {'name': pv.name, 'color': pv.color, 'sort_order': pv.sort_order}
            for pv in PicklistValue.objects.filter(
                tenant=tenant, category='workitem_status', is_active=True
            )
        }
        pipeline = []
        for entry in status_counts:
            sv = entry['status']
            pv_info = picklist_map.get(sv, {})
            pipeline.append({
                'status': sv,
                'name': pv_info.get('name', sv),
                'color': pv_info.get('color', 'gray'),
                'sort_order': pv_info.get('sort_order', 999),
                'count': entry['count'],
            })
        pipeline.sort(key=lambda x: x['sort_order'])

        # --- Needs Attention ---
        overdue_items = list(
            open_qs
            .filter(due_date__lt=today)
            .select_related('customer', 'technician__user')
            .order_by('due_date')[:10]
            .values(
                'id', 'reference_id', 'status', 'due_date',
                'customer__first_name', 'customer__last_name',
                'technician__user__first_name', 'technician__user__last_name',
            )
        )
        unassigned_items = list(
            open_qs
            .filter(technician__isnull=True)
            .select_related('customer')
            .order_by('-created_date')[:10]
            .values(
                'id', 'reference_id', 'status', 'created_date', 'due_date',
                'customer__first_name', 'customer__last_name',
            )
        )
        overdue_tasks = list(
            Task.objects
            .filter(tenant=tenant, due_date__lt=today)
            .exclude(status='Done')
            .order_by('due_date')[:10]
            .values(
                'id', 'summary', 'status', 'due_date',
                'work_item__id', 'work_item__reference_id',
                'assigned_employee__user__first_name',
                'assigned_employee__user__last_name',
            )
        )

        # --- Recent Notes (batch-fetch work item references) ---
        workitem_ct = ContentType.objects.get_for_model(WorkItem)
        task_ct = ContentType.objects.get_for_model(Task)
        tenant_wi_ids = set(wi_qs.values_list('id', flat=True))
        tenant_task_ids = set(Task.objects.filter(tenant=tenant).values_list('id', flat=True))

        recent_notes_qs = (
            Note.objects
            .filter(
                Q(content_type=workitem_ct, object_id__in=tenant_wi_ids) |
                Q(content_type=task_ct, object_id__in=tenant_task_ids)
            )
            .select_related('author', 'content_type')
            .order_by('-created_at')[:30]
        )

        # Collect IDs for batch lookup
        wi_ids_from_notes = set()
        task_ids_from_notes = set()
        for note in recent_notes_qs:
            if note.content_type_id == workitem_ct.id:
                wi_ids_from_notes.add(note.object_id)
            elif note.content_type_id == task_ct.id:
                task_ids_from_notes.add(note.object_id)

        # Batch fetch work item references
        wi_ref_map = dict(
            WorkItem.objects.filter(id__in=wi_ids_from_notes)
            .values_list('id', 'reference_id')
        )
        # Batch fetch task -> work_item mappings
        task_wi_map = dict(
            Task.objects.filter(id__in=task_ids_from_notes, work_item__isnull=False)
            .values_list('id', 'work_item_id')
        )
        # Fetch references for work items linked via tasks
        extra_wi_ids = set(task_wi_map.values()) - wi_ids_from_notes
        if extra_wi_ids:
            wi_ref_map.update(dict(
                WorkItem.objects.filter(id__in=extra_wi_ids)
                .values_list('id', 'reference_id')
            ))

        recent_notes = []
        for note in recent_notes_qs:
            work_item_id = None
            work_item_ref = None
            if note.content_type_id == workitem_ct.id:
                work_item_id = note.object_id
                work_item_ref = wi_ref_map.get(note.object_id)
            elif note.content_type_id == task_ct.id:
                wi_id = task_wi_map.get(note.object_id)
                if wi_id:
                    work_item_id = wi_id
                    work_item_ref = wi_ref_map.get(wi_id)

            author_name = None
            if note.author:
                full = f"{note.author.first_name} {note.author.last_name}".strip()
                author_name = full if full else note.author.email

            recent_notes.append({
                'id': note.id,
                'content': note.content[:200],
                'author_name': author_name,
                'created_at': note.created_at.isoformat(),
                'work_item_id': work_item_id,
                'work_item_reference_id': work_item_ref,
            })

        # --- My Open Tasks ---
        my_tasks = []
        if current_employee:
            my_tasks_qs = (
                Task.objects
                .filter(tenant=tenant, assigned_employee=current_employee)
                .exclude(status='Done')
                .select_related('work_item', 'task_type')
                .order_by('due_date', '-created_date')[:10]
            )
            for task in my_tasks_qs:
                my_tasks.append({
                    'id': task.id,
                    'summary': task.summary,
                    'status': task.status,
                    'due_date': task.due_date.isoformat() if task.due_date else None,
                    'task_type': task.task_type.name if task.task_type else None,
                    'work_item_id': task.work_item_id,
                    'work_item_reference_id': (
                        task.work_item.reference_id if task.work_item else None
                    ),
                })

        # --- Financial Summary ---
        # Cash register balances (annotated to avoid N+1)
        registers = (
            CashRegister.objects.filter(tenant=tenant, is_active=True)
            .select_related('shop')
            .annotate(transaction_total=Sum('transactions__amount'))
        )
        register_balances = []
        for reg in registers:
            balance = (reg.transaction_total or Decimal('0.00')) + reg.opening_balance
            register_balances.append({
                'id': reg.id,
                'name': reg.name,
                'shop_name': reg.shop.name,
                'current_balance': str(balance),
            })

        # Revenue (single aggregate query)
        revenue = closed_qs.aggregate(
            today=Sum('final_price', filter=Q(closed_date__date__gte=today)),
            week=Sum('final_price', filter=Q(closed_date__date__gte=week_start)),
            month=Sum('final_price', filter=Q(closed_date__date__gte=month_start)),
        )

        financial = {
            'register_balances': register_balances,
            'revenue_today': str(revenue['today'] or Decimal('0.00')),
            'revenue_week': str(revenue['week'] or Decimal('0.00')),
            'revenue_month': str(revenue['month'] or Decimal('0.00')),
        }

        # --- Technician Workload (open tasks per assignee) ---
        tech_workload = list(
            Task.objects
            .filter(tenant=tenant, assigned_employee__isnull=False)
            .exclude(status='Done')
            .values(
                'assigned_employee__id',
                'assigned_employee__user__first_name',
                'assigned_employee__user__last_name',
            )
            .annotate(open_count=Count('id'))
            .order_by('-open_count')
        )
        workload = [
            {
                'technician_id': tw['assigned_employee__id'],
                'name': f"{tw['assigned_employee__user__first_name']} {tw['assigned_employee__user__last_name']}".strip(),
                'open_count': tw['open_count'],
            }
            for tw in tech_workload
        ]

        # --- Tasks Overdue Per Assignee ---
        tasks_overdue_raw = list(
            Task.objects
            .filter(tenant=tenant, assigned_employee__isnull=False, due_date__lt=today)
            .exclude(status='Done')
            .values(
                'assigned_employee__id',
                'assigned_employee__user__first_name',
                'assigned_employee__user__last_name',
            )
            .annotate(overdue_count=Count('id'))
            .order_by('-overdue_count')
        )
        tasks_overdue_by_assignee = [
            {
                'employee_id': t['assigned_employee__id'],
                'name': f"{t['assigned_employee__user__first_name']} {t['assigned_employee__user__last_name']}".strip(),
                'overdue_count': t['overdue_count'],
            }
            for t in tasks_overdue_raw
        ]

        return Response({
            'kpis': kpis,
            'pipeline': pipeline,
            'needs_attention': {
                'overdue': overdue_items,
                'unassigned': unassigned_items,
                'overdue_tasks': overdue_tasks,
            },
            'recent_notes': recent_notes,
            'my_tasks': my_tasks,
            'financial': financial,
            'technician_workload': workload,
            'tasks_overdue_by_assignee': tasks_overdue_by_assignee,
        })
