from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Sum, TextChoices

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
        return f"{self.user.first_name} {self.user.last_name}"

    class Meta:
        permissions = [
            ("view_all_employees", "Can view all employees in tenant"),
        ]


class CashRegister(models.Model):
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE)
    shop = models.ForeignKey(RepairShop, on_delete=models.CASCADE, related_name="cash_registers")
    name = models.CharField(max_length=120)
    default_owner = models.ForeignKey(
        Employee,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="default_registers",
    )
    opening_balance = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("tenant", "shop", "name")]
        ordering = ["shop", "name"]

    def __str__(self):
        return f"{self.shop.name} - {self.name}"

    @property
    def current_balance(self):
        result = self.transactions.aggregate(total=Sum('amount'))
        return (result['total'] or Decimal('0.00')) + self.opening_balance


class CashTransactionType(models.TextChoices):
    DEPOSIT = "deposit", "Deposit"
    WITHDRAWAL = "withdrawal", "Withdrawal"
    TRANSFER_IN = "transfer_in", "Transfer In"
    TRANSFER_OUT = "transfer_out", "Transfer Out"
    ADJUSTMENT = "adjustment", "Adjustment"


class CashTransaction(models.Model):
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE)
    register = models.ForeignKey(
        CashRegister,
        on_delete=models.PROTECT,
        related_name="transactions",
    )
    transaction_type = models.CharField(
        max_length=20,
        choices=CashTransactionType.choices,
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=10, default='PLN')
    work_item = models.ForeignKey(
        "tasks.WorkItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cash_transactions",
    )
    related_transaction = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transfer_pair",
    )
    description = models.CharField(max_length=255, blank=True)
    performed_by = models.ForeignKey(
        Employee,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cash_transactions",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=['tenant', 'register', 'created_at']),
            models.Index(fields=['work_item']),
        ]

    def __str__(self):
        return f"{self.get_transaction_type_display()}: {self.amount} {self.currency}"

    def save(self, *args, **kwargs):
        if self.transaction_type in (CashTransactionType.WITHDRAWAL, CashTransactionType.TRANSFER_OUT):
            self.amount = -abs(self.amount)
        elif self.transaction_type in (CashTransactionType.DEPOSIT, CashTransactionType.TRANSFER_IN):
            self.amount = abs(self.amount)
        super().save(*args, **kwargs)
