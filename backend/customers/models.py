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
    tax_code = models.CharField(max_length=10, null=True, blank=True, validators=[tax_code_regex])

    def full_name(self):
        parts = [self.first_name, self.last_name]
        return " ".join(filter(None, parts)).strip()

    def __str__(self):
        return self.full_name() or self.email or self.phone_number or f"Customer {self.pk}"

    def clean(self):
        super().clean()
        if not self.email and not self.phone_number:
            raise ValidationError("Please provide at least an email address or phone number.")

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
                fields=['tenant', 'phone_number'],
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
    first_name = models.CharField(max_length=255)
    last_name = models.CharField(max_length=255, blank=False, null=False)
    email = models.EmailField(unique=True, blank=True, null=True)

    phone_regex = RegexValidator(
        regex=r'\d{7,9}$',
        message='Phone number must be entered without any special characters. Up to 9 digits allowed'
    )

    phone_number = models.CharField(max_length=9, null=True, blank=True, validators=[phone_regex])

    def full_name(self):
        return f"{self.first_name} {self.last_name}"


class Opportunity(models.Model):
    lead = models.ForeignKey(Lead, on_delete=models.SET_NULL, blank=True, null=True)
    customer = models.ForeignKey(Customer, on_delete=models.SET_NULL, blank=True, null=True)
    description = models.TextField(blank=False)


class Asset(models.Model):
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, null=False, blank=False)
    serial_number = models.CharField(max_length=255, null=False, blank=False)
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name='assets', null=True)

    class Meta:
        unique_together = ('customer', 'serial_number')

    def __str__(self):
        return self.device.model
