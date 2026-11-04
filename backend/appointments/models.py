from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import IntegrityError, models, transaction
from django.db.models import Max

from core.phone import DEFAULT_REGION, region_for_tenant, to_e164_from_parts
from tenants.models import Tenant


class AppointmentType(models.TextChoices):
    PICKUP = "pickup", "Pickup"
    RETURN_DELIVERY = "return_delivery", "Return delivery"


class AppointmentStatus(models.TextChoices):
    NEW = "new", "New"
    SCHEDULED = "scheduled", "Scheduled"
    COMPLETED = "completed", "Completed"
    FAILED = "failed", "Not home"
    CANCELLED = "cancelled", "Cancelled"


OPEN_STATUSES = (AppointmentStatus.NEW, AppointmentStatus.FAILED)
CLOSED_STATUSES = (AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED)


class AppointmentSource(models.TextChoices):
    MANUAL = "manual", "Entered by hand"
    CALL = "call", "Phone call"
    SMS = "sms", "Text message"


class Route(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    date = models.DateField()
    driver = models.ForeignKey(
        "service.Employee", on_delete=models.PROTECT, null=True, blank=True, related_name="routes",
    )
    start_address = models.ForeignKey(
        "core.Address", on_delete=models.PROTECT, null=True, blank=True, related_name="+",
    )
    end_address = models.ForeignKey(
        "core.Address", on_delete=models.PROTECT, null=True, blank=True, related_name="+",
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["date", "id"]
        constraints = [
            models.UniqueConstraint(fields=["tenant", "date", "driver"], name="unique_route_per_driver_day"),
            # NULL drivers are distinct to the constraint above, so cap the
            # unassigned route separately.
            models.UniqueConstraint(
                fields=["tenant", "date"], condition=models.Q(driver__isnull=True),
                name="unique_unassigned_route_per_day",
            ),
        ]

    def __str__(self):
        return f"{self.date} {self.driver or 'unassigned'}"


class Appointment(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    reference_id = models.CharField(max_length=50, blank=True, null=True)
    type = models.CharField(max_length=20, choices=AppointmentType.choices, default=AppointmentType.PICKUP)
    status = models.CharField(max_length=20, choices=AppointmentStatus.choices, default=AppointmentStatus.NEW)

    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100, blank=True)
    prefix = models.CharField(max_length=5, blank=True, null=True)
    phone_number = models.CharField(max_length=15, blank=True, null=True)
    phone_e164 = models.CharField(max_length=20, blank=True, null=True, db_index=True)
    email = models.EmailField(blank=True, null=True)

    customer = models.ForeignKey(
        "customers.Customer", on_delete=models.SET_NULL, null=True, blank=True, related_name="appointments",
    )
    lead = models.ForeignKey(
        "customers.Lead", on_delete=models.SET_NULL, null=True, blank=True, related_name="appointments",
    )
    work_item = models.ForeignKey(
        "tasks.WorkItem", on_delete=models.SET_NULL, null=True, blank=True, related_name="appointments",
    )
    source = models.CharField(max_length=10, choices=AppointmentSource.choices, default=AppointmentSource.MANUAL)
    source_call = models.ForeignKey(
        "calls.Call", on_delete=models.SET_NULL, null=True, blank=True, related_name="appointments",
    )

    address = models.ForeignKey("core.Address", on_delete=models.PROTECT, related_name="appointments")

    device_description = models.TextField(blank=True)
    issue_description = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    availability_note = models.TextField(blank=True)

    route = models.ForeignKey(
        Route, on_delete=models.SET_NULL, null=True, blank=True, related_name="appointments",
    )
    stop_order = models.PositiveIntegerField(null=True, blank=True)
    arrival_window_start = models.TimeField(null=True, blank=True)
    arrival_window_end = models.TimeField(null=True, blank=True)

    completed_at = models.DateTimeField(null=True, blank=True)
    failure_reason = models.TextField(blank=True)
    attempts = models.PositiveIntegerField(default=0)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["tenant", "reference_id"], name="unique_appointment_reference_per_tenant"),
        ]
        indexes = [
            models.Index(fields=["tenant", "status"], name="appointment_tenant_status_idx"),
        ]

    def __str__(self):
        return self.reference_id or f"Appointment {self.pk}"

    def full_name(self):
        return " ".join(filter(None, [self.first_name, self.last_name])).strip()

    def clean(self):
        super().clean()
        if self.type == AppointmentType.RETURN_DELIVERY and not self.work_item_id:
            raise ValidationError({"work_item": "A return delivery must be linked to a work item."})

    def _next_reference_id(self):
        max_id = Appointment.objects.filter(
            tenant=self.tenant, reference_id__startswith="APT-",
        ).annotate(
            num=models.functions.Cast(
                models.functions.Substr(models.F("reference_id"), 5), models.IntegerField(),
            )
        ).aggregate(max_num=Max("num"))["max_num"] or 0
        return f"APT-{max_id + 1}"

    def save(self, *args, **kwargs):
        self.phone_e164 = to_e164_from_parts(
            self.prefix,
            self.phone_number,
            region_for_tenant(self.tenant) if self.tenant_id else DEFAULT_REGION,
        )
        if self.reference_id:
            super().save(*args, **kwargs)
            return

        # Same Max+1 race as WorkItem.save: retry inside a savepoint.
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


class AvailabilityWindow(models.Model):
    appointment = models.ForeignKey(Appointment, on_delete=models.CASCADE, related_name="availability_windows")
    date = models.DateField(null=True, blank=True)
    # Python's date.weekday(): Monday is 0.
    weekday = models.PositiveSmallIntegerField(null=True, blank=True)
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)

    class Meta:
        ordering = ["date", "weekday", "start_time"]
        constraints = [
            models.CheckConstraint(
                check=(
                    (models.Q(date__isnull=False) & models.Q(weekday__isnull=True))
                    | (models.Q(date__isnull=True) & models.Q(weekday__isnull=False))
                ),
                name="availability_window_date_xor_weekday",
            ),
            models.CheckConstraint(
                check=models.Q(weekday__isnull=True) | models.Q(weekday__lte=6),
                name="availability_window_weekday_range",
            ),
        ]

    def covers(self, day):
        return self.date == day if self.date else self.weekday == day.weekday()
