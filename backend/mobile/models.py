"""Register of company phones running the Caller ID app.

Answers the question "who, and from which device", allows a single phone to be
signed out remotely without touching the others, and provides an audit trail of
access to customer data.
"""

from django.db import models

from service.models import Employee
from tenants.models import Tenant


class MobileDevice(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="mobile_devices")
    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name="mobile_devices"
    )
    label = models.CharField(
        max_length=120,
        help_text="Device name shown in the admin panel, e.g. 'Pixel 10 Pro - front desk'.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(null=True, blank=True, db_index=True)
    revoked_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Set on remote sign-out. A device with this date can no longer "
                  "refresh its token.",
    )

    class Meta:
        ordering = ["-last_seen_at", "-created_at"]
        indexes = [
            models.Index(fields=["tenant", "employee"]),
        ]

    def __str__(self):
        state = "revoked" if self.revoked_at else "active"
        return f"{self.label} ({self.employee}) - {state}"

    @property
    def is_active(self):
        return self.revoked_at is None
