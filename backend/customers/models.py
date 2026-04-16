from django.core.exceptions import ValidationError
from django.db import models
from django.core.validators import RegexValidator
from inventory.models import Device
from core.models import Address
from tenants.models import Tenant

referral_sources = [
    ('Internet Search', 'Internet Search'),
    ('Social Media', 'Social Media'),
    ('Friend/Family Referral', 'Friend/Family Referral'),
    ('Online Advertisement', 'Online Advertisement'),
    ('Offline Advertisement', 'Offline Advertisement'),
    ('Walk-by', 'Walk-by'),
    ('Returning Customer', 'Returning Customer'),
    ('Other', 'Other')
]

class Customer(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    first_name = models.CharField(max_length=255)
    last_name = models.CharField(max_length=255, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    address = models.OneToOneField(Address, on_delete=models.CASCADE, blank=True, null=True)
    referral_source = models.CharField(choices=referral_sources, blank=True, null=True)

    phone_regex = RegexValidator(
        regex=r'\d{7,9}$',
        message='Phone number must be entered without any special characters. Up to 9 digits allowed'
    )

    tax_code_regex = RegexValidator(
        regex=r'^\d{10}$',
        message='Tax code must be entered without any special characters. Must be 10 digits.'
    )

    phone_number = models.CharField(max_length=9, null=True, blank=True, validators=[phone_regex])
    prefix = models.CharField(
        max_length=5,
        blank=True,
        null=True,
        help_text="Country code prefix (e.g., '+48', '+1')"
    )
    tax_code = models.CharField(max_length=10, null=True, blank=True, validators=[tax_code_regex])
    full_phone_number = models.CharField(max_length=20, blank=True, null=True, db_index=True)

    def full_name(self):
        parts = [self.first_name, self.last_name]
        return " ".join(filter(None, parts)).strip()

    def __str__(self):
        return self.full_name() or self.email or self.phone_number or f"Customer {self.pk}"

    def clean(self):
        super().clean()
        if not self.email and not self.phone_number:
            raise ValidationError("Please provide at least an email address or phone number.")

    def save(self, *args, **kwargs):
        if self.prefix and self.phone_number:
            self.full_phone_number = f"{self.prefix}{self.phone_number}"
        elif self.phone_number:
            self.full_phone_number = self.phone_number
        else:
            self.full_phone_number = None
        super().save(*args, **kwargs)

    class Meta:
        permissions = [
            ("view_all_customers", "Can view all customers in tenant"),
        ]

        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'email'],
                condition=models.Q(email__isnull=False) & ~models.Q(email=""),
                name='unique_customer_email_per_tenant'
            ),
            models.UniqueConstraint(
                fields=['tenant', 'prefix', 'phone_number'],
                condition=models.Q(phone_number__isnull=False) & ~models.Q(phone_number=""),
                name='unique_customer_phone_per_tenant'
            ),
            models.CheckConstraint(
                check=(
                    (models.Q(email__isnull=False) & ~models.Q(email=""))
                    | (models.Q(phone_number__isnull=False) & ~models.Q(phone_number=""))
                ),
                name='customer_requires_contact_method',
            ),
        ]


class Lead(models.Model):
    STATUS_CHOICES = [
        ('new', 'New'),
        ('contacted', 'Contacted'),
        ('callback', 'Callback'),
        ('converted', 'Converted'),
    ]

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    prefix = models.CharField(max_length=5, blank=True, null=True)
    phone_number = models.CharField(max_length=15, blank=True, null=True)
    full_phone_number = models.CharField(max_length=20, blank=True, null=True, db_index=True)
    device_description = models.TextField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='new')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'email'],
                condition=models.Q(email__isnull=False),
                name='unique_lead_email_per_tenant'
            )
        ]

    def full_name(self):
        parts = [self.first_name, self.last_name]
        return " ".join(filter(None, parts)).strip()

    def __str__(self):
        return self.full_name() or self.email or self.phone_number or f"Lead {self.pk}"

    def save(self, *args, **kwargs):
        if self.prefix and self.phone_number:
            self.full_phone_number = f"{self.prefix}{self.phone_number}"
        elif self.phone_number:
            self.full_phone_number = self.phone_number
        else:
            self.full_phone_number = None
        super().save(*args, **kwargs)


class Opportunity(models.Model):
    lead = models.ForeignKey(Lead, on_delete=models.SET_NULL, blank=True, null=True)
    customer = models.ForeignKey(Customer, on_delete=models.SET_NULL, blank=True, null=True)
    description = models.TextField(blank=False)


class Asset(models.Model):
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, null=False, blank=False)
    serial_number = models.CharField(max_length=255, null=True, blank=True)
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name='assets', null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['customer', 'device', 'serial_number'],
                condition=models.Q(serial_number__isnull=False) & ~models.Q(serial_number=""),
                name='unique_asset_serial_per_customer_device'
            ),
        ]

    def __str__(self):
        if self.device and self.device.model:
            return self.device.model
        return f"Asset {self.pk}"
