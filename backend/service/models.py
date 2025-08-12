from django.db import models
from core.models import User, Address
from tenants.models import Tenant

location_types = [
        ('internal', 'Internal'),
        ('external', 'External'),
]


class Location(models.Model):
    name = models.CharField(max_length=255, blank=False, null=False)
    type = models.CharField(choices=location_types, default='internal')
    address = models.OneToOneField(Address, on_delete=models.CASCADE, null=True)

    def __str__(self):
        return self.name


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
