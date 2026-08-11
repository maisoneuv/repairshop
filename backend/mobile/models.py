"""Rejestr telefonow sluzbowych korzystajacych z aplikacji Caller ID.

Odpowiada na pytanie "kto i z jakiego urzadzenia", pozwala zdalnie wylogowac
pojedynczy telefon bez ruszania pozostalych i stanowi slad audytowy dostepu
do danych klientow.
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
        help_text="Nazwa urzadzenia widoczna w panelu, np. 'Pixel 10 Pro - przyjecie'.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(null=True, blank=True, db_index=True)
    revoked_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Ustawione przy zdalnym wylogowaniu. Urzadzenie z ta data "
                  "nie odswiezy juz tokenu.",
    )

    class Meta:
        ordering = ["-last_seen_at", "-created_at"]
        indexes = [
            models.Index(fields=["tenant", "employee"]),
        ]

    def __str__(self):
        state = "odwolane" if self.revoked_at else "aktywne"
        return f"{self.label} ({self.employee}) - {state}"

    @property
    def is_active(self):
        return self.revoked_at is None
