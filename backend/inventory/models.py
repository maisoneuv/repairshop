from django.db import models
from mptt.models import MPTTModel, TreeForeignKey
from service.models import Location
from tenants.models import TenantModelMixin

UNIT_CHOICES = [
    ('pcs', 'Pieces'),
    ('g', 'Grams'),
    ('m', 'Meters'),
    ('l', 'Liters'),
]

ITEM_TYPE_CHOICES = [
    ('PART', 'Part'),
    ('CONSUMABLE', 'Consumable'),
    ('ACCESSORY', 'Accessory'),
]


class Category(TenantModelMixin, MPTTModel):
    name = models.CharField(max_length=255)
    parent = TreeForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='children'
    )
    description = models.TextField(blank=True, null=True)

    class MPTTMeta:
        order_insertion_by = ['name']

    def save(self, *args, **kwargs):
        if self.name:
            self.name = self.name.lower()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Device(models.Model):
    model = models.CharField(max_length=255, blank=True, null=True)
    manufacturer = models.CharField(max_length=255, blank=True, null=True)
    category = models.ForeignKey(Category, blank=True, null=True, on_delete=models.SET_NULL)

    def __str__(self):
        display_model = self.model or "Unknown model"
        display_manufacturer = self.manufacturer or "Unknown manufacturer"
        return f"{display_model} ({display_manufacturer})"


class InventoryList(TenantModelMixin):
    name = models.CharField(max_length=255, null=False, blank=False)
    location = models.OneToOneField(Location, on_delete=models.CASCADE, null=True)

    def __str__(self):
        return self.name


class InventoryItem(TenantModelMixin):
    name = models.CharField(max_length=255, null=False, blank=False)
    sku = models.CharField(max_length=100, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    quantity_unit = models.CharField(max_length=10, choices=UNIT_CHOICES, default='pcs')
    type = models.CharField(max_length=20, choices=ITEM_TYPE_CHOICES, default='PART')
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True, related_name='inventory_items')

    class Meta:
        unique_together = [('tenant', 'sku')]

    def __str__(self):
        return self.name


class Supplier(TenantModelMixin):
    name = models.CharField(max_length=100)

    class Meta:
        unique_together = [('tenant', 'name')]

    def __str__(self):
        return self.name


class PurchaseOrder(TenantModelMixin):

    DRAFT = 'draft'
    OPEN = 'open'
    CANCELLED = 'cancelled'
    COMPLETED = 'completed'

    STATUS_CHOICES = [
        (DRAFT, 'Draft'),
        (OPEN, 'Open'),
        (CANCELLED, 'Cancelled'),
        (COMPLETED, 'Completed'),
    ]

    order_number = models.CharField(max_length=50, unique=True, null=True, blank=True)
    order_date = models.DateField(auto_now_add=True)
    order_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    tracking_number = models.CharField(max_length=50, null=True, blank=True)
    origin_work_item = models.ForeignKey('tasks.WorkItem', on_delete=models.SET_NULL, blank=True, null=True, related_name='purchase_orders')
    supplier = models.ForeignKey(Supplier, on_delete=models.SET_NULL, null=True, blank=True, related_name='purchase_orders')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=DRAFT)

    def __str__(self):
        return self.order_number or f"PO-{self.pk}"


class PurchaseOrderItem(TenantModelMixin):
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name='line_items')
    inventory_item = models.ForeignKey(InventoryItem, on_delete=models.CASCADE, related_name='purchase_line_items')
    quantity = models.PositiveIntegerField()
    quantity_unit = models.CharField(max_length=10, choices=UNIT_CHOICES, default='pcs')
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2)

    @property
    def get_quantity_with_unit(self):
        return f"{self.quantity} {self.quantity_unit}"


class InventoryTransaction(TenantModelMixin):

    PURCHASE = 'PUR'
    SALE = 'SAL'
    ADJUSTMENT = 'ADJ'
    RETURN = 'RET'
    TRANSFER_IN = 'TIN'
    TRANSFER_OUT = 'TOUT'
    USAGE = 'USE'

    TRANSACTION_TYPE_CHOICES = [
        (PURCHASE, 'Purchase'),
        (SALE, 'Sale'),
        (ADJUSTMENT, 'Adjustment'),
        (RETURN, 'Return'),
        (TRANSFER_IN, 'Transfer In'),
        (TRANSFER_OUT, 'Transfer Out'),
        (USAGE, 'Usage'),
    ]

    inventory_item = models.ForeignKey(InventoryItem, on_delete=models.CASCADE, related_name='inventory_transactions')
    inventory_list = models.ForeignKey(InventoryList, on_delete=models.CASCADE, related_name='inventory_transactions')
    transaction_type = models.CharField(max_length=4, choices=TRANSACTION_TYPE_CHOICES)
    transaction_date = models.DateTimeField(auto_now_add=True)
    quantity = models.IntegerField(help_text="Positive for incoming stock (purchases, returns), negative for outgoing (sales, usage).")
    quantity_unit = models.CharField(max_length=10, choices=UNIT_CHOICES, default='pcs')
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.SET_NULL, blank=True, null=True, related_name='inventory_transactions')
    work_item = models.ForeignKey('tasks.WorkItem', on_delete=models.SET_NULL, blank=True, null=True, related_name='inventory_transactions')


class InventoryBalance(TenantModelMixin):
    inventory_item = models.ForeignKey(InventoryItem, on_delete=models.CASCADE, related_name='inventory_balances')
    inventory_list = models.ForeignKey(InventoryList, on_delete=models.CASCADE, related_name='inventory_balances')
    current_quantity = models.IntegerField(default=0)
    quantity_unit = models.CharField(max_length=10, choices=UNIT_CHOICES, default='pcs')
    average_cost = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    rack = models.CharField(max_length=50, null=True, blank=True)
    shelf_slot = models.CharField(max_length=50, null=True, blank=True)

    class Meta:
        unique_together = ('inventory_list', 'inventory_item')

    @property
    def get_quantity_with_unit(self):
        return f"{self.current_quantity} {self.quantity_unit}"

    @property
    def get_location(self):
        return f"Rack: {self.rack} Shelf: {self.shelf_slot}"
