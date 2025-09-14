from django.db import models
from django.db.models import TextChoices

from core.models import User, Address
from tenants.models import Tenant

class RepairShopType(models.TextChoices):
    INTERNAL = "internal", "Internal shop"
    PARTNER  = "partner",  "Partner shop"

class RepairShop(models.Model):
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE)
    name   = models.CharField(max_length=120)
    type   = models.CharField(max_length=20, choices=RepairShopType.choices, default=RepairShopType.INTERNAL)
    address = models.ForeignKey("core.Address", on_delete=models.PROTECT)
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=40, blank=True)
    active = models.BooleanField(default=True)

    class Meta:
        unique_together = [("tenant", "name")]

    def __str__(self):
        return self.name

class LocationType(TextChoices):
    SHOP = "shop", "Shop"
    CUSTOMER_ADDRESS = "customer", "Customer address"
    FREEFORM = "freeform", "Other address"

class Location(models.Model):
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE)
    name = models.CharField(max_length=255, blank=False, null=False)
    type = models.CharField(choices=LocationType.choices, default='shop')
    shop = models.ForeignKey(RepairShop, null=True, blank=True, on_delete=models.PROTECT)
    customer = models.ForeignKey("customers.Customer", null=True, blank=True, on_delete=models.PROTECT)
    address = models.ForeignKey("core.Address", null=True, blank=True, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.type == LocationType.SHOP and not self.shop:
            raise ValidationError({"shop": "required for type=shop"})
        if self.type == LocationType.CUSTOMER_ADDRESS and not (self.customer and self.address):
            raise ValidationError({"customer": "required for type=customer", "address": "required for type=customer"})
        if self.type == LocationType.FREEFORM and not self.address:
            raise ValidationError({"address": "required for type=freeform"})


employee_roles = [
    ("Manager", "Manager"),
    ("Technician", "Technician"),
    ("Customer Service", "Customer Service"),
    ("External Service", "External Service")
]


class Employee(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    role = models.CharField(choices=employee_roles)
    location = models.ForeignKey(Location, on_delete=models.CASCADE)

    def __str__(self):
        return self.user.name

    class Meta:
        permissions = [
            ("view_all_employees", "Can view all employees in tenant"),
        ]
