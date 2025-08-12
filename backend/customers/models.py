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
    last_name = models.CharField(max_length=255, blank=False, null=False)
    email = models.EmailField(unique=True, blank=False, null=False)
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
        return f"{self.first_name} {self.last_name}"

    def __str__(self):
        return self.full_name()

    class Meta:
        permissions = [
            ("view_all_customers", "Can view all customers in tenant"),
        ]

        constraints = [
            models.UniqueConstraint(fields=['tenant', 'email'], name='unique_customer_email_per_tenant')
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
