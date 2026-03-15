from rest_framework import serializers
from django.db.models import Sum
from .models import (
    Device, Category, InventoryItem, InventoryList,
    InventoryBalance, InventoryTransaction,
)


class DeviceSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = Device
        fields = ['id', 'manufacturer', 'model', 'category', 'category_name']

    def validate(self, data):
        # On updates, skip create-only validation
        if self.instance is not None:
            return data

        request = self.context.get('request')
        unknown_manufacturer = request.data.get('unknown_manufacturer')
        unknown_model = request.data.get('unknown_model')

        if not unknown_model and not data.get('model'):
            raise serializers.ValidationError({"model": "This field is required unless marked as unknown."})

        if not unknown_manufacturer and not data.get('manufacturer'):
            raise serializers.ValidationError({"manufacturer": "This field is required unless marked as unknown."})

        return data


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name']


class InventoryListSerializer(serializers.ModelSerializer):
    location_name = serializers.CharField(source='location.name', read_only=True, default=None)

    class Meta:
        model = InventoryList
        fields = ['id', 'name', 'location', 'location_name']
        read_only_fields = ['id']


class InventoryItemSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True, default=None)
    total_quantity = serializers.SerializerMethodField()

    class Meta:
        model = InventoryItem
        fields = [
            'id', 'name', 'sku', 'description', 'quantity_unit',
            'type', 'category', 'category_name', 'total_quantity',
        ]
        read_only_fields = ['id']

    def get_total_quantity(self, obj):
        result = obj.inventory_balances.aggregate(total=Sum('current_quantity'))
        return result['total'] or 0


class InventoryBalanceSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='inventory_item.name', read_only=True)
    item_sku = serializers.CharField(source='inventory_item.sku', read_only=True)
    location_name = serializers.CharField(source='inventory_list.name', read_only=True)

    class Meta:
        model = InventoryBalance
        fields = [
            'id', 'inventory_item', 'item_name', 'item_sku',
            'inventory_list', 'location_name',
            'current_quantity', 'quantity_unit', 'average_cost',
            'rack', 'shelf_slot',
        ]
        read_only_fields = ['id', 'current_quantity', 'average_cost']


class InventoryTransactionSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='inventory_item.name', read_only=True)
    location_name = serializers.CharField(source='inventory_list.name', read_only=True)

    class Meta:
        model = InventoryTransaction
        fields = [
            'id', 'inventory_item', 'item_name',
            'inventory_list', 'location_name',
            'transaction_type', 'transaction_date',
            'quantity', 'quantity_unit', 'unit_cost',
            'purchase_order', 'work_item',
        ]
        read_only_fields = ['id', 'transaction_date']


class ConsumePartSerializer(serializers.Serializer):
    inventory_item = serializers.IntegerField()
    inventory_list = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1)

    def validate(self, data):
        request = self.context.get('request')
        tenant = getattr(request, 'tenant', None)

        try:
            item = InventoryItem.objects.get(id=data['inventory_item'], tenant=tenant)
        except InventoryItem.DoesNotExist:
            raise serializers.ValidationError({'inventory_item': 'Item not found.'})

        try:
            inv_list = InventoryList.objects.get(id=data['inventory_list'], tenant=tenant)
        except InventoryList.DoesNotExist:
            raise serializers.ValidationError({'inventory_list': 'Location not found.'})

        try:
            balance = InventoryBalance.objects.get(
                inventory_item=item,
                inventory_list=inv_list,
                tenant=tenant,
            )
            if balance.current_quantity < data['quantity']:
                raise serializers.ValidationError({
                    'quantity': f'Insufficient stock. Available: {balance.current_quantity}'
                })
        except InventoryBalance.DoesNotExist:
            raise serializers.ValidationError({
                'inventory_item': 'No stock found for this item at this location.'
            })

        data['_item'] = item
        data['_inv_list'] = inv_list
        return data
