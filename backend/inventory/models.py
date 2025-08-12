from datetime import timezone

from django.db import models
from django.apps import apps
from mptt.models import MPTTModel, TreeForeignKey
from service.models import Location
# from tasks.models import WorkItem

UNIT_CHOICES = [
    ('pcs', 'Pieces'),
    ('g', 'Grams'),
    ('m', 'Meters'),
    ('l', 'Liters'),
]

class Category(MPTTModel):
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

    def __str__(self):
        return self.name


class Device(models.Model):
    model = models.CharField(max_length=255, blank=True, null=True)  # Model name
    manufacturer = models.CharField(max_length=255, blank=True, null=True)
    # categories = models.ManyToManyField(Category, related_name='devices', blank=True)
    category = models.ForeignKey(Category, blank=True, null=True, on_delete=models.SET_NULL)

    def assign_to_category(self, category):
        self.categories.add(category)

        ancestors = category.get_ancestors(include_self=False)
        for ancestor in ancestors:
            self.categories.add(ancestor)

    def __str__(self):
        display_model = self.model or "Unknown model"
        display_manufacturer = self.manufacturer or "Unknown manufacturer"
        return f"{display_model} ({display_manufacturer})"


class InventoryList(models.Model):
    name = models.CharField(max_length=255, null=False, blank=False)
    location = models.OneToOneField(Location, on_delete=models.CASCADE, null=True)

    def __str__(self):
        return self.name


class InventoryItem(models.Model):
    name = models.CharField(max_length=255, null=False, blank=False)
    parent_inventory_item = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='childrenItems'
    )

    sku = models.CharField(max_length=100, unique=True, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    quantity_unit = models.CharField(max_length=10, choices=UNIT_CHOICES, default='pcs')
    inventory_list = models.ForeignKey(InventoryList, null=False, blank=False, on_delete=models.CASCADE)
    type = models.CharField(max_length=100)

    def __str__(self):
        return self.name

    def get_attribute_value(self, attribute_name):
        try:
            pav = self.partattributevalue_set.select_related('attribute').get(attribute__name=attribute_name)
            data_type = pav.attribute.data_type
            if data_type == 'string':
                return pav.value_text
            elif data_type == 'int':
                return pav.value_int
            elif data_type == 'decimal':
                return pav.value_decimal
            elif data_type == 'bool':
                return pav.value_bool
            return None
        except PartAttributeValue.DoesNotExist:
            return None

    def set_attribute_value(self, attribute_name, data_type, value):
        attr_def, created = AttributeDefinition.objects.get_or_create(
            name=attribute_name,
            defaults={'data_type': data_type}
        )

        pav, pav_created = PartAttributeValue.objects.get_or_create(
            part=self,
            attribute=attr_def
        )
        # 3. Set the correct field
        if data_type == 'string':
            pav.value_text = str(value) if value else None
        elif data_type == 'int':
            pav.value_int = int(value) if value else None
        elif data_type == 'decimal':
            pav.value_decimal = value  # ideally a Decimal instance
        elif data_type == 'bool':
            pav.value_bool = bool(value)
        else:
            # default to text or handle error
            pav.value_text = str(value)

        pav.save()

class Supplier(models.Model):
    name = models.CharField(max_length=100, unique=True)

    def __str__(self):
        return self.name

class PurchaseOrder(models.Model):

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
        return self.order_number

class PurchaseOrderItem(models.Model):
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name='line_items')
    inventory_item = models.ForeignKey(InventoryItem, on_delete=models.CASCADE, related_name='purchase_line_items')
    quantity = models.PositiveIntegerField()
    quantity_unit = models.CharField(max_length=10, choices=UNIT_CHOICES, default='pcs')
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2)

    @property
    def get_quantity_with_unit(self):
        return f"{self.quantity} {self.quantity_unit}"

class InventoryTransaction(models.Model):

    PURCHASE = 'PUR'
    SALE = 'SAL'
    ADJUSTMENT = 'ADJ'
    RETURN = 'RET'
    TRANSFER_IN = 'TIN'
    TRANSFER_OUT = 'TOUT'

    TRANSACTION_TYPE_CHOICES = [
        (PURCHASE, 'Purchase'),
        (SALE, 'Sale'),
        (ADJUSTMENT, 'Adjustment'),
        (RETURN, 'Return'),
        (TRANSFER_IN, 'Transfer In'),
        (TRANSFER_OUT, 'Transfer Out'),
    ]

    inventory_item = models.ForeignKey(InventoryItem, on_delete=models.CASCADE, related_name='inventory_transactions')
    inventory_list = models.ForeignKey(InventoryList, on_delete=models.CASCADE, related_name='inventory_transactions')
    transaction_type = models.CharField(max_length=4, choices=TRANSACTION_TYPE_CHOICES)
    transaction_date = models.DateTimeField(auto_now_add=True)
    quantity = models.IntegerField(help_text="Positive for incoming stock (purchases, returns), negative for outgoing (sales).")
    quantity_unit = models.CharField(max_length=10, choices=UNIT_CHOICES, default='pcs')
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2)
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.SET_NULL, blank=True, null=True, related_name='inventory_transactions')
    work_item = models.ForeignKey('tasks.WorkItem', on_delete=models.SET_NULL, blank=True, null=True, related_name='inventory_transactions')

class InventoryBalance(models.Model):
    inventory_item = models.ForeignKey(InventoryItem, on_delete=models.CASCADE, related_name='inventory_balances')
    inventory_list = models.ForeignKey(InventoryList, on_delete=models.CASCADE, related_name='inventory_balances')
    current_quantity = models.PositiveIntegerField(default=0)
    quantity_unit = models.CharField(max_length=10, choices=UNIT_CHOICES, default='pcs')
    average_cost = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    rack = models.CharField(max_length=5, null=True, blank=True)
    shelf_slot = models.CharField(max_length=5, null=True, blank=True)

    class Meta:
        unique_together = ('inventory_list', 'inventory_item')

    @property
    def get_quantity_with_unit(self):
        return f"{self.current_quantity} {self.quantity_unit}"

    @property
    def get_location(self):
        return f"Rack: {self.rack} Shelf: {self.shelf_slot}"

class AttributeDefinition(models.Model):
    name = models.CharField(max_length=255)
    data_type = models.CharField(max_length=50)

    def __str__(self):
        return f"{self.name} ({self.data_type})"


class PartAttributeValue(models.Model):
    part = models.ForeignKey(InventoryItem, on_delete=models.CASCADE)
    attribute = models.ForeignKey(AttributeDefinition, on_delete=models.CASCADE)

    value_string = models.TextField(null=True, blank=True)
    value_int = models.IntegerField(null=True, blank=True)
    value_float = models.FloatField(null=True, blank=True)
    value_bool = models.BooleanField(null=True, blank=True)

    def __str__(self):
        return f"{self.part.name} - {self.attribute.name}"

    """

    kategorie 
    parametry
    wymagane parametry w zaleznosci od kategorii
    kod producenta
    """

"""
>>> from myapp.models import Part

# 1. Create a new part
>>> part = Part.objects.create(name="Premium Battery", part_type="Battery")

# 2. Set some attributes using the helper method
>>> part.set_attribute_value(attribute_name="wattage", data_type="int", value=55)
>>> part.set_attribute_value(attribute_name="brand", data_type="string", value="BatteryCo")
>>> part.set_attribute_value(attribute_name="is_rechargeable", data_type="bool", value=True)
>>> part.set_attribute_value(attribute_name="unit_cost", data_type="decimal", value="19.99")

# 3. Retrieve them
>>> part.get_attribute_value("wattage")
55
>>> part.get_attribute_value("brand")
'BatteryCo'
>>> part.get_attribute_value("is_rechargeable")
True
>>> part.get_attribute_value("unit_cost")
Decimal('19.99')
"""