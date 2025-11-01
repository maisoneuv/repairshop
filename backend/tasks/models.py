from _decimal import Decimal

from django.db import models
from customers.models import Customer, Asset
from service.models import Employee, Location
from core.models import Address
from django.core.validators import MinValueValidator
from django.contrib.contenttypes.fields import GenericRelation
from core.models import Note
from django.db.models import Max

from tenants.models import Tenant

work_item_statuses = [
    ('New', 'New'),
    ('In Progress', 'In Progress'),
    ('Resolved', 'Resolved')
]

task_statuses = [
    ('To do', 'To do'),
    ('In progress', 'In progress'),
    ('Done', 'Done'),
    ('Reopened', 'Reopened')
]

work_item_types = [
    ('Chargeable Repair', 'Chargeable Repair'),
    ('Warranty Repair', 'Warranty Repair')
]

priority_choices = [
    ('Standard', 'Standard'),
    ('Express', 'Express'),
]

intake_methods = [
    ('Customer drop-off in person', 'Customer drop-off in person'),
    ('Shipped by customer', 'Shipped by customer'),
    ('Courier pickup from customer', 'Courier pickup from customer')
]

class MoveMethod(models.TextChoices):
    WALK_IN = "walk_in", "Customer drop-off in person"
    COURIER = "courier", "Courier"
    DRIVER  = "driver",  "Courier pickup from customer"

payment_methods = [
    ('Card', 'Card'),
    ('Cash', 'Cash')
]


class TaskType(models.Model):
    """
    Represents a type/category of task (e.g., Diagnosis, Repair, Testing, Customer Contact).
    Can be tenant-specific or system-wide.
    """
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    name = models.CharField(max_length=100)
    estimated_duration = models.DurationField(null=True, blank=True, help_text="Estimated time to complete this type of task")
    is_active = models.BooleanField(default=True)
    created_date = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['tenant', 'name'], name='unique_task_type_per_tenant')
        ]
        ordering = ['name']

    def __str__(self):
        return self.name


class TaskTypeValidationRule(models.Model):
    """
    Defines required fields for a specific task type.
    These rules are checked when a task is marked as 'Done'.
    """
    task_type = models.ForeignKey(TaskType, on_delete=models.CASCADE, related_name='validation_rules')
    field_name = models.CharField(max_length=100, help_text="Name of the field that should be validated (e.g., 'description')")
    is_required = models.BooleanField(default=True, help_text="Whether this field must be filled before task completion")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['task_type', 'field_name'], name='unique_validation_rule_per_field')
        ]

    def __str__(self):
        return f"{self.task_type.name} - {self.field_name} ({'required' if self.is_required else 'optional'})"


class WorkItem(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    reference_id = models.CharField(max_length=50, blank=True, null=True)
    description = models.TextField()
    status = models.CharField(choices=work_item_statuses, default='New')
    customer = models.ForeignKey(Customer, blank=False, null=False, on_delete=models.PROTECT)
    created_date = models.DateTimeField(auto_now_add=True)
    closed_date = models.DateTimeField(blank=True, null=True)
    owner = models.ForeignKey(Employee, on_delete=models.PROTECT, related_name="owner") #todo
    due_date = models.DateField(null=True, blank=True)
    type = models.CharField(choices=work_item_types,default='Chargeable Repair')
    estimated_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True,
                                          validators=[MinValueValidator(Decimal('0.01'))])
    final_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True,
                                      validators=[MinValueValidator(Decimal('0.01'))])
    repair_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True,
                                      validators=[MinValueValidator(Decimal('0.01'))])
    dropoff_point = models.ForeignKey(Location, on_delete=models.PROTECT, related_name="dropoff_items")
    pickup_point = models.ForeignKey(Location, on_delete=models.PROTECT, null=True, blank=True, related_name="pickup_items")
    customer_asset = models.ForeignKey(Asset, on_delete=models.PROTECT, blank=True, null=True)
    priority = models.CharField(choices=priority_choices, default='Standard')
    comments = models.TextField(blank=True, null=True)
    device_condition = models.TextField(blank=True, null=True)
    accessories = models.TextField(blank=True, null=True)
    technician = models.ForeignKey(Employee, on_delete=models.PROTECT, null=True, blank=True, related_name="technician")
    prepaid_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True,
                                         validators=[MinValueValidator(Decimal('0.01'))])
    intake_method = models.CharField(choices=MoveMethod.choices, default=MoveMethod.WALK_IN)
    dropoff_method = models.CharField(max_length=20, choices=MoveMethod.choices, default=MoveMethod.WALK_IN)
    payment_method = models.CharField(choices=payment_methods, blank=True, null=True)
    fulfillment_shop = models.ForeignKey("service.RepairShop", null=True, blank=True,
                                         on_delete=models.PROTECT,
                                         help_text="Who actually performs the repair (internal or partner).")
    # paid
    #currency todo
    notes = GenericRelation(Note)


    def __str__(self):
        return self.reference_id

    def save(self, *args, **kwargs):
        if not self.reference_id:
            if not self.tenant:
                raise ValueError("Cannot generate reference_id without tenant.")

            max_id = WorkItem.objects.filter(
                tenant=self.tenant,
                reference_id__startswith="RMA-"
            ).annotate(
                num=models.functions.Cast(models.F('reference_id')[4:], models.IntegerField())
            ).aggregate(
                max_num=Max('num')
            )['max_num'] or 0

            self.reference_id = f"RMA-{max_id + 1}"

        super().save(*args, **kwargs)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['tenant', 'reference_id'], name='unique_reference_per_tenant')
        ]

        permissions = [
            ("view_all_workitems", "Can view all work items in tenant"),
            ("view_own_workitems", "Can view own assigned work items"),
        ]


class Task(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    summary = models.CharField(max_length=255, blank=True, null=False)
    description = models.TextField(blank=True)
    work_item = models.ForeignKey(WorkItem, blank=True, null=True, on_delete=models.CASCADE, related_name="tasks")
    status = models.CharField(choices=task_statuses, default='To do')
    task_type = models.ForeignKey(TaskType, on_delete=models.PROTECT, null=True, blank=True, related_name='tasks')
    assigned_employee = models.ForeignKey(Employee, on_delete=models.CASCADE)
    due_date = models.DateField(null=True, blank=True)
    created_date = models.DateTimeField(auto_now_add=True)
    completed_date = models.DateTimeField(null=True, blank=True)
    actual_duration = models.DurationField(null=True, blank=True, help_text="Calculated duration from creation to completion")

    def __str__(self):
        return self.summary or (f"Task #{self.pk}" if self.pk else "Task")

    def save(self, *args, **kwargs):
        """
        Override save to calculate actual_duration when task is completed.
        """
        # If status is being changed to 'Done' and completed_date is not set
        if self.status == 'Done' and not self.completed_date:
            from django.utils import timezone
            self.completed_date = timezone.now()
            self.actual_duration = self.completed_date - self.created_date

        # If status is being changed from 'Done' to something else, clear completion info
        if self.pk:  # Only for existing tasks
            try:
                old_task = Task.objects.get(pk=self.pk)
                if old_task.status == 'Done' and self.status != 'Done':
                    self.completed_date = None
                    self.actual_duration = None
            except Task.DoesNotExist:
                pass

        super().save(*args, **kwargs)

    class Meta:
        permissions = [
            ("view_all_tasks", "Can view all tasks in tenant"),
            ("view_own_tasks", "Can view own assigned tasks"),
        ]
