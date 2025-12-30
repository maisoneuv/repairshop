from django.http import JsonResponse
from django.shortcuts import render, redirect, reverse, get_object_or_404

from customers.serializers import CustomerSerializer
from service.serializers import EmployeeSerializer
from .models import WorkItem, Task, TaskType
from .forms import WorkItemForm, TaskForm
from django.views.generic import TemplateView, ListView, DetailView, CreateView, UpdateView
from django.db.models import Q
from rest_framework import viewsets, filters
import django_filters
from .serializers import WorkItemSerializer, TaskSerializer, TaskTypeSerializer
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated  # or AllowAny for dev
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.exceptions import PermissionDenied


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
        "reference_id",
        "customer__first_name",
        "customer__last_name",
        "customer__email",
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

        if user.is_superuser:
            return base_qs.all()

        if not self.request.tenant:
            return WorkItem.objects.none()

        qs = base_qs.filter(tenant=self.request.tenant)

        if user.has_permission('view_all_workitems', self.request.tenant):
            return qs

        if user.has_permission('view_own_workitems', self.request.tenant):
            return qs.filter(technician__user=user)

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

        if user.is_superuser:
            serializer.save()
            return

        if not user.has_permission('tasks.change_workitem', self.request.tenant):
            raise PermissionDenied("You don't have permission to change work items.")

        serializer.save()

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

class TaskViewSet(viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['work_item', 'assigned_employee', 'status']
    ordering_fields = ['created_date', 'summary', 'status', 'assigned_employee', 'task_type__name']
    ordering = ["-created_date"]

    def get_queryset(self):
        user = self.request.user

        if user.is_superuser:
            return Task.objects.all()

        if not self.request.tenant:
            return Task.objects.none()

        qs = Task.objects.filter(tenant=self.request.tenant)

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

        if user.is_superuser:
            serializer.save()
            return

        if not user.has_permission('tasks.change_task', self.request.tenant):
            raise PermissionDenied("You don't have permission to change tasks.")

        serializer.save()

    def perform_destroy(self, instance):
        user = self.request.user

        if user.is_superuser:
            instance.delete()
            return

        if not user.has_permission('tasks.delete_task', self.request.tenant):
            raise PermissionDenied("You don't have permission to delete tasks.")

        instance.delete()

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
