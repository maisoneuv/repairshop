from _decimal import Decimal

from django.conf import settings
from django.core.exceptions import FieldDoesNotExist, ValidationError
from django.db import models, transaction, IntegrityError
from customers.models import Customer, Asset
from service.models import Employee, Location
from core.models import Address
from django.core.validators import MinValueValidator
from django.contrib.contenttypes.fields import GenericRelation
from core.models import Note, Photo
from core.utils import as_bool
from django.db.models import Max

from tenants.models import Tenant

# Picklist values for work items and tasks are now stored in the PicklistValue model
# and managed via Django admin instead of hardcoded lists.

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
    status = models.CharField(max_length=100, default='New')
    customer = models.ForeignKey(Customer, blank=False, null=False, on_delete=models.PROTECT)
    created_date = models.DateTimeField(auto_now_add=True)
    # Does not move when a note, email or photo is attached — only on save().
    updated_date = models.DateTimeField(auto_now=True)
    closed_date = models.DateTimeField(blank=True, null=True)
    # Cursor for incremental sync of the on-device cache. The migration seeds
    # existing rows with created_date.
    updated_at = models.DateTimeField(auto_now=True, db_index=True, null=True)
    owner = models.ForeignKey(Employee, on_delete=models.PROTECT, related_name="owner") #todo
    due_date = models.DateField(null=True, blank=True)
    type = models.CharField(max_length=100, default='Chargeable Repair')
    estimated_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True,
                                          validators=[MinValueValidator(Decimal('0.01'))])
    final_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True,
                                      validators=[MinValueValidator(Decimal('0.01'))])
    repair_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True,
                                      validators=[MinValueValidator(Decimal('0.01'))])
    dropoff_point = models.ForeignKey(Location, on_delete=models.PROTECT, related_name="dropoff_items")
    pickup_point = models.ForeignKey(Location, on_delete=models.PROTECT, null=True, blank=True, related_name="pickup_items")
    customer_asset = models.ForeignKey(Asset, on_delete=models.PROTECT, blank=True, null=True)
    priority = models.CharField(max_length=100, default='Standard')
    comments = models.TextField(blank=True, null=True)
    device_condition = models.TextField(blank=True, null=True)
    accessories = models.TextField(blank=True, null=True)
    technician = models.ForeignKey(Employee, on_delete=models.PROTECT, null=True, blank=True, related_name="technician")
    prepaid_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True,
                                         validators=[MinValueValidator(Decimal('0.01'))])
    intake_method = models.CharField(max_length=20, default=MoveMethod.WALK_IN)
    dropoff_method = models.CharField(max_length=20, default=MoveMethod.WALK_IN)
    payment_method = models.CharField(max_length=100, blank=True, null=True)
    fulfillment_shop = models.ForeignKey("service.RepairShop", null=True, blank=True,
                                         on_delete=models.PROTECT,
                                         help_text="Who actually performs the repair (internal or partner).")
    currency = models.CharField(max_length=10, blank=True, null=True, default='PLN', help_text="Currency for pricing (e.g., PLN, USD, EUR, GBP)")
    payment_register = models.ForeignKey(
        "service.CashRegister", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="work_item_payments",
    )
    summary = models.TextField(blank=True, null=True)
    issue_diagnosis = models.TextField(blank=True, null=True)
    required_parts = models.TextField(blank=True, null=True)
    estimated_effort = models.CharField(max_length=50, blank=True, null=True)
    summary_status = models.CharField(
        max_length=20,
        choices=[
            ('none', 'None'),
            ('pending', 'Pending'),
            ('completed', 'Completed'),
            ('failed', 'Failed'),
        ],
        default='none',
        help_text="Status of AI summary generation"
    )
    summary_generated_at = models.DateTimeField(null=True, blank=True)
    summary_request_id = models.UUIDField(null=True, blank=True, help_text="UUID to correlate summary request/callback")
    # paid

    notes = GenericRelation(Note)
    photos = GenericRelation(Photo)
    custom_fields = models.JSONField(default=dict, blank=True)

    # Guided process (additive; behind `workitem.guided_process` flag).
    # Null current_stage = this work item is not on the guided flow — old code
    # and the legacy `status` field keep working untouched.
    current_stage = models.ForeignKey(
        'StageDefinition', on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    progress = models.CharField(
        max_length=20, null=True, blank=True,
        choices=[('pending', 'Pending'), ('in_progress', 'In progress')],
    )

    def __str__(self):
        return self.reference_id

    def _next_reference_id(self):
        max_id = WorkItem.objects.filter(
            tenant=self.tenant,
            reference_id__startswith="RMA-"
        ).annotate(
            # Extract numeric suffix from reference_id and cast to int for max computation
            num=models.functions.Cast(
                models.functions.Substr(models.F('reference_id'), 5),
                models.IntegerField(),
            )
        ).aggregate(
            max_num=Max('num')
        )['max_num'] or 0
        return f"RMA-{max_id + 1}"

    def save(self, *args, **kwargs):
        if self.reference_id:
            super().save(*args, **kwargs)
            return

        if not self.tenant:
            raise ValueError("Cannot generate reference_id without tenant.")

        # Computing Max(existing)+1 races under concurrent creates: two intakes
        # can pick the same RMA-n and hit the unique constraint. Retry on the
        # resulting IntegrityError with a freshly computed number. Each attempt
        # runs in a savepoint so a failure doesn't poison an outer transaction.
        for attempt in range(5):
            self.reference_id = self._next_reference_id()
            try:
                with transaction.atomic():
                    super().save(*args, **kwargs)
                return
            except IntegrityError:
                if attempt == 4:
                    raise
                self.reference_id = None

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['tenant', 'reference_id'], name='unique_reference_per_tenant')
        ]
        indexes = [
            # List views filter by (tenant, status) and sort by created_date.
            models.Index(fields=['tenant', 'status', 'created_date'], name='workitem_tenant_status_idx'),
            # Overdue / due-soon queries filter by (tenant, due_date).
            models.Index(fields=['tenant', 'due_date'], name='workitem_tenant_due_idx'),
        ]

        permissions = [
            ("view_all_workitems", "Can view all work items in tenant"),
            ("view_own_workitems", "Can view own assigned work items"),
        ]


class Task(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    reference_id = models.CharField(max_length=50, blank=True, null=True)
    summary = models.TextField(blank=True, null=True)
    description = models.TextField(blank=True)
    work_item = models.ForeignKey(WorkItem, blank=True, null=True, on_delete=models.CASCADE, related_name="tasks")
    status = models.CharField(max_length=100, default='To do')
    task_type = models.ForeignKey(TaskType, on_delete=models.PROTECT, null=True, blank=True, related_name='tasks')
    assigned_employee = models.ForeignKey(Employee, on_delete=models.PROTECT)
    due_date = models.DateField(null=True, blank=True)
    created_date = models.DateTimeField(auto_now_add=True)
    completed_date = models.DateTimeField(null=True, blank=True)
    actual_duration = models.DurationField(null=True, blank=True, help_text="Calculated duration from creation to completion")
    custom_fields = models.JSONField(default=dict, blank=True)
    photos = GenericRelation(Photo)

    def __str__(self):
        return self.reference_id or self.summary or (f"Task #{self.pk}" if self.pk else "Task")

    def _next_reference_id(self):
        max_id = Task.objects.filter(
            tenant=self.tenant_id,
            reference_id__startswith="T-"
        ).annotate(
            num=models.functions.Cast(
                models.functions.Substr(models.F('reference_id'), 3),
                models.IntegerField(),
            )
        ).aggregate(max_num=Max('num'))['max_num'] or 0
        return f"T-{max_id + 1}"

    def save(self, *args, **kwargs):
        """
        Override save to auto-generate reference_id and calculate actual_duration when task is completed.
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

        if self.reference_id:
            super().save(*args, **kwargs)
            return

        if not self.tenant_id:
            raise ValueError("Cannot generate reference_id without tenant.")

        # Computing Max(existing)+1 races under concurrent creates; retry on the
        # unique-constraint violation with a freshly computed number. Each attempt
        # runs in a savepoint so a failure doesn't poison an outer transaction.
        for attempt in range(5):
            self.reference_id = self._next_reference_id()
            try:
                with transaction.atomic():
                    super().save(*args, **kwargs)
                return
            except IntegrityError:
                if attempt == 4:
                    raise
                self.reference_id = None

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['tenant', 'reference_id'], name='unique_task_reference_per_tenant')
        ]
        indexes = [
            # List views filter by (tenant, status) and sort by created_date.
            models.Index(fields=['tenant', 'status', 'created_date'], name='task_tenant_status_idx'),
            # Overdue / due-soon queries filter by (tenant, due_date).
            models.Index(fields=['tenant', 'due_date'], name='task_tenant_due_idx'),
        ]
        permissions = [
            ("view_all_tasks", "Can view all tasks in tenant"),
            ("view_own_tasks", "Can view own assigned tasks"),
        ]


# ---------------------------------------------------------------------------
# Guided work-item process (additive; behind the `workitem.guided_process`
# feature flag). See design/work-item-detail-redesign/WORK_ITEM_DETAIL_MODEL.md
# and ROLLOUT_AND_ROLLBACK.md. Nothing here mutates the legacy `status` flow —
# StageDefinition runs in parallel and links to it via `status_value`.
# ---------------------------------------------------------------------------

OWNER_ROLE_CHOICES = [
    ('owner', 'Customer service'),
    ('technician', 'Technician'),
    ('any', 'Anyone'),
]
WAITING_ON_CHOICES = [
    ('customer', 'Customer'),
    ('supplier', 'Supplier'),
]
# Reserved suffix in `StageDefinition.recap_sources`: "repair.note" means the
# note left on the way out of Repair, not a captured field called "note".
RECAP_NOTE_KEY = 'note'
# Reserved *prefix*: "item.description" is a column on the work item itself, not
# a stage key. Intake data (the reported issue, the device's condition) is
# recorded on the work item at creation, so no stage's checkpoint captures it —
# yet it is exactly what the first technician has to base a diagnosis on.
RECAP_ITEM_KEY = 'item'


def split_recap_source(entry):
    """'stage.field' -> ('stage', 'field'), forgiving stray spaces around either part."""
    stage_key, _, field_key = entry.partition('.')
    return stage_key.strip(), field_key.strip()

def _values_match(actual, expected):
    """Compare a work item's value against one a skip condition expects.

    Custom field values are free-form JSON, so a checkbox reaches us as True,
    "true" or 1 depending on which client wrote it. Routing turns on these
    values, so compare booleans as booleans and fall back to string equality
    for everything else (picklist values are stored as strings).
    """
    expected_bool = as_bool(expected)
    if expected_bool is not None:
        actual_bool = as_bool(actual)
        # An unset checkbox is absent from custom_fields entirely.
        if actual is None:
            actual_bool = False
        return actual_bool == expected_bool
    if actual is None:
        return expected is None
    return str(actual) == str(expected)


class ProcessTemplate(models.Model):
    """A tenant's repair process — the ordered set of stages. One default per shop."""
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='process_templates')
    name = models.CharField(max_length=100)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['tenant', 'name'], name='unique_process_template_per_tenant'),
        ]
        permissions = [
            ('manage_process', 'Can configure the guided work item process'),
        ]

    def __str__(self):
        return f"{self.name} ({self.tenant})"


class StageDefinition(models.Model):
    """One stage in a process (New, Diagnosis, Quote…). Parallel to the legacy
    `WorkItem.status`; `status_value` links to the PicklistValue/status string
    so advancing a stage can dual-write the legacy status."""
    process = models.ForeignKey(ProcessTemplate, on_delete=models.CASCADE, related_name='stages')
    key = models.SlugField(max_length=50)
    name = models.CharField(max_length=100)
    status_value = models.CharField(
        max_length=100, blank=True,
        help_text="Legacy WorkItem.status value this stage maps to (for dual-write during rollout).",
    )
    owner_role = models.CharField(max_length=20, choices=OWNER_ROLE_CHOICES, default='any', blank=True)
    guidance = models.TextField(blank=True)
    recap_sources = models.JSONField(
        default=list, blank=True,
        help_text=(
            'Earlier output to show read-only at the top of this checkpoint, as a '
            'list of strings. "diagnosis" = everything that stage captured; '
            '"diagnosis.issue_diagnosis" = one of its checkpoint fields; '
            '"repair.note" = the note left on the way out of that stage; '
            '"item.description" = a field on the work item itself, for intake '
            'data no stage captures. E.g. ["diagnosis"] on Quote.'
        ),
    )
    skip_when = models.JSONField(
        default=list, blank=True,
        help_text=(
            'Conditions under which this stage does not apply, as a list of '
            'objects — any one matching passes straight over the stage. Each '
            'names a `field` (a work item column or a custom field key) and '
            'either `equals` (one value) or `in` (a list), plus an optional '
            '`label` shown on the stepper. E.g. on Quote: '
            '[{"field": "type", "in": ["Warranty Repair"], "label": "Warranty '
            'job"}] — there is nothing to quote on a warranty job.'
        ),
    )
    order = models.IntegerField(default=0)

    class Meta:
        ordering = ['order']
        constraints = [
            models.UniqueConstraint(fields=['process', 'key'], name='unique_stage_key_per_process'),
        ]

    def __str__(self):
        return f"{self.name} ({self.process.name})"

    def applies_to(self, work_item):
        """False when this stage is declared not to apply to this repair."""
        return self.skip_reason(work_item) is None

    def skip_reason(self, work_item):
        """Why this stage is passed over for this repair, or None if it applies.

        Returns the matching condition's `label` so the stepper can say what
        happened ("Repaired during diagnosis") rather than only that something
        did. Falls back to a generic string when a condition carries no label.

        Conditions are OR'd: the first one that matches wins.
        """
        for condition in self.skip_when or []:
            if not isinstance(condition, dict):
                continue
            actual = self._field_value(work_item, condition.get('field'))
            if 'in' in condition:
                expected = condition['in']
                matched = isinstance(expected, list) and any(
                    _values_match(actual, e) for e in expected)
            elif 'equals' in condition:
                matched = _values_match(actual, condition['equals'])
            else:
                continue
            if matched:
                return condition.get('label') or 'Does not apply to this repair'
        return None

    @staticmethod
    def _field_value(work_item, field_key):
        """A condition's field is either a work item column or a custom field
        key; custom fields live in the `custom_fields` JSON, not as attributes."""
        if not field_key:
            return None
        try:
            WorkItem._meta.get_field(field_key)
        except FieldDoesNotExist:
            return (work_item.custom_fields or {}).get(field_key)
        return getattr(work_item, field_key, None)

    def _clean_skip_when(self):
        """A rule that silently never fires is indistinguishable from "this
        repair doesn't match it", so everything a condition names is checked at
        edit time: the field must exist, and a picklist-backed field's values
        must be ones the tenant actually uses (as recap_sources does).
        """
        from core.models import CustomField, PicklistValue
        from core.utils import PICKLIST_FIELDS

        if not self.skip_when:
            return
        if not isinstance(self.skip_when, list):
            raise ValidationError({'skip_when': 'Must be a list of conditions.'})
        if not self.process_id:
            return

        tenant = self.process.tenant
        custom_keys = set(
            CustomField.objects
            .filter(tenant=tenant, model_name='workitem', is_active=True)
            .values_list('field_key', flat=True)
        )
        errors = []
        for condition in self.skip_when:
            if not isinstance(condition, dict):
                errors.append(f'{condition!r} is not a condition object.')
                continue
            field_key = condition.get('field')
            if not isinstance(field_key, str) or not field_key.strip():
                errors.append(f'{condition!r}: name a "field".')
                continue

            try:
                WorkItem._meta.get_field(field_key)
                is_column = True
            except FieldDoesNotExist:
                is_column = False
            if not is_column and field_key not in custom_keys:
                available = ', '.join(sorted(custom_keys)) or 'none'
                errors.append(
                    f'"{field_key}" is not a work item field, nor a custom '
                    f'field for this tenant (custom fields: {available}).')
                continue

            operators = [op for op in ('equals', 'in') if op in condition]
            if len(operators) != 1:
                errors.append(
                    f'"{field_key}": give exactly one of "equals" or "in" '
                    f'(got {", ".join(operators) or "neither"}).')
                continue
            if 'in' in condition and not isinstance(condition['in'], list):
                errors.append(f'"{field_key}": "in" must be a list.')
                continue

            category = PICKLIST_FIELDS['WorkItem'].get(field_key) if is_column else None
            if category is None:
                continue
            known = set(
                PicklistValue.objects
                .filter(tenant=tenant, category=category)
                .values_list('value', flat=True)
            )
            expected = condition['in'] if 'in' in condition else [condition['equals']]
            errors += [
                f'"{field_key}": "{value}" is not a value this tenant uses'
                f'{" (known: " + ", ".join(sorted(known)) + ")" if known else ""}.'
                for value in expected
                if not isinstance(value, str) or value not in known
            ]
        if errors:
            raise ValidationError({'skip_when': errors})

    def clean(self):
        """Catch a mistyped recap source at edit time.

        Without this a bad reference just renders nothing, and an admin has no
        way to tell a typo from "this repair hasn't got there yet".
        """
        super().clean()
        self._clean_skip_when()
        if not self.recap_sources:
            return
        if not isinstance(self.recap_sources, list):
            raise ValidationError({'recap_sources': 'Must be a list of strings.'})

        siblings = {
            s.key: s for s in
            StageDefinition.objects.filter(process_id=self.process_id).exclude(pk=self.pk)
        }
        self.recap_sources = [
            '.'.join(filter(None, split_recap_source(e))) if isinstance(e, str) else e
            for e in self.recap_sources
        ]
        errors = []
        for entry in self.recap_sources:
            if not isinstance(entry, str) or not entry.strip():
                errors.append(f'{entry!r} is not a stage key.')
                continue
            stage_key, field_key = split_recap_source(entry)
            if stage_key == RECAP_ITEM_KEY:
                if not field_key:
                    errors.append(
                        f'"{entry}": name a work item field, e.g. "item.description".')
                    continue
                try:
                    field = WorkItem._meta.get_field(field_key)
                except FieldDoesNotExist:
                    field = None
                if field is None or not field.concrete:
                    errors.append(f'"{entry}": WorkItem has no field "{field_key}".')
                continue
            source = siblings.get(stage_key)
            if source is None:
                errors.append(
                    f'"{entry}": no earlier stage "{stage_key}" in this process.')
                continue
            # A recap is of work already done; a later stage has nothing to show.
            if source.order >= self.order:
                errors.append(
                    f'"{entry}": "{stage_key}" does not come before this stage.')
                continue
            if not field_key or field_key == RECAP_NOTE_KEY:
                continue
            captured = {
                f.custom_field.field_key if f.custom_field_id else f.standard_key
                for f in source.checkpoint_fields.select_related('custom_field')
            }
            if field_key not in captured:
                available = ', '.join(sorted(captured)) or 'nothing'
                errors.append(
                    f'"{entry}": "{stage_key}" does not capture "{field_key}" '
                    f'(it captures: {available}).')
        if errors:
            raise ValidationError({'recap_sources': errors})


class StageOutcome(models.Model):
    """A way to leave a stage: Advance / Pause / Exit."""
    KIND_CHOICES = [
        ('advance', 'Advance'),
        ('pause', 'Pause'),
        ('exit', 'Exit'),
    ]
    stage = models.ForeignKey(StageDefinition, on_delete=models.CASCADE, related_name='outcomes')
    kind = models.CharField(max_length=10, choices=KIND_CHOICES)
    label = models.CharField(max_length=120)
    # advance / exit → where it goes; null for pause
    target_stage = models.ForeignKey(
        StageDefinition, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    # pause → who we wait on
    waiting_on = models.CharField(max_length=20, choices=WAITING_ON_CHOICES, blank=True)
    reassign_to_owner = models.BooleanField(default=False)
    resume_returns_to = models.CharField(max_length=20, choices=OWNER_ROLE_CHOICES, blank=True)
    resolve_label = models.CharField(max_length=120, blank=True)
    order = models.IntegerField(default=0)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"{self.get_kind_display()}: {self.label}"


class CheckpointField(models.Model):
    """Puts a field on a stage's checkpoint. The field is either a tenant
    `core.CustomField` or a standard WorkItem column referenced by key."""
    stage = models.ForeignKey(StageDefinition, on_delete=models.CASCADE, related_name='checkpoint_fields')
    custom_field = models.ForeignKey(
        'core.CustomField', on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    standard_key = models.CharField(
        max_length=100, blank=True,
        help_text="WorkItem column key when this is a standard (non-custom) field, e.g. 'technician'.",
    )
    required = models.BooleanField(default=False)
    order = models.IntegerField(default=0)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return self.custom_field.label if self.custom_field else self.standard_key


class WorkItemPause(models.Model):
    """A work item's active pause overlay. At most one per work item."""
    HELD_BY_CHOICES = OWNER_ROLE_CHOICES
    work_item = models.OneToOneField(WorkItem, on_delete=models.CASCADE, related_name='pause')
    waiting_on = models.CharField(max_length=20, choices=WAITING_ON_CHOICES)
    reason = models.CharField(max_length=255, blank=True)
    since = models.DateTimeField(auto_now_add=True)
    held_by = models.CharField(max_length=20, choices=HELD_BY_CHOICES, blank=True)
    reassigned = models.BooleanField(default=False)
    resolve_label = models.CharField(max_length=120, blank=True)

    def __str__(self):
        return f"{self.work_item.reference_id} paused on {self.waiting_on}"


class StageTransition(models.Model):
    """Append-only audit of every advance / pause / resolve / exit / start / back.
    Preserves each repair's real history so the template can be edited live."""
    KIND_CHOICES = [
        ('start', 'Start'),
        ('advance', 'Advance'),
        ('pause', 'Pause'),
        ('resolve', 'Resolve'),
        ('exit', 'Exit'),
        # A correction: something was missed, so the repair returns to an
        # earlier stage. Recorded distinctly so the trail doesn't read as if
        # the work legitimately flowed backwards.
        ('back', 'Moved back'),
    ]
    work_item = models.ForeignKey(WorkItem, on_delete=models.CASCADE, related_name='stage_transitions')
    from_stage = models.ForeignKey(StageDefinition, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    to_stage = models.ForeignKey(StageDefinition, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    kind = models.CharField(max_length=10, choices=KIND_CHOICES)
    outcome = models.ForeignKey(
        StageOutcome, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    # Snapshot of the outcome's wording at the time. Outcomes are editable and
    # deletable live, and `note` holds whatever the person typed instead — so
    # without this there is nothing left to say which button was pressed.
    outcome_label = models.CharField(max_length=120, blank=True)
    by_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    at = models.DateTimeField(auto_now_add=True)
    note = models.TextField(blank=True)
    captured_values = models.JSONField(default=dict, blank=True)
    assigned_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-at']
        indexes = [
            models.Index(fields=['work_item', 'at'], name='stagetransition_wi_at_idx'),
        ]

    def __str__(self):
        return f"{self.work_item.reference_id}: {self.kind} → {self.to_stage_id}"


class Notification(models.Model):
    """A queue nudge for one person. Restrained: only handoff / bounce /
    resolved-for-you / due (see §7E)."""
    TYPE_CHOICES = [
        ('handoff', 'Handed to you'),
        ('bounce', 'Needs your call'),
        ('resolved', 'Wait resolved'),
        ('due', 'Due soon'),
    ]
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='workitem_notifications')
    recipient = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='workitem_notifications')
    work_item = models.ForeignKey(WorkItem, on_delete=models.CASCADE, null=True, blank=True, related_name='notifications')
    type = models.CharField(max_length=12, choices=TYPE_CHOICES)
    text = models.CharField(max_length=255)
    read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['recipient', 'read', 'created_at'], name='notification_recipient_idx'),
        ]

    def __str__(self):
        return f"{self.get_type_display()} → {self.recipient} ({self.work_item_id})"
