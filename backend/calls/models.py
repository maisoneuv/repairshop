from django.db import models
from tenants.models import Tenant


class Call(models.Model):
    TYPE_CHOICES = [('incoming', 'Incoming'), ('outbound', 'Outbound')]

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='calls')
    type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='incoming')
    phone_number = models.CharField(max_length=30)
    customer = models.ForeignKey(
        'customers.Customer', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='calls'
    )
    lead = models.ForeignKey(
        'customers.Lead', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='calls'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    handled_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)
    duration = models.PositiveIntegerField(null=True, blank=True)
    status = models.CharField(max_length=30, blank=True, default='')

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['tenant', 'handled_at', 'created_at'])]

    def __str__(self):
        return f"Call from {self.phone_number} ({self.created_at})"
