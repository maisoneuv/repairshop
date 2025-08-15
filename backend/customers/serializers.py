from inventory.serializers import DeviceSerializer
from .models import Customer, Asset
from rest_framework import serializers
from core.serializers import AddressSerializer
from core.models import Address

class CustomerSerializer(serializers.ModelSerializer):
    address = AddressSerializer(required=False)

    class Meta:
        model = Customer
        fields = ['id', 'first_name', 'last_name', 'email', 'phone_number', 'referral_source', 'tax_code', 'address']

    def create(self, validated_data):
        address_data = validated_data.pop("address", None)
        address = Address.objects.create(**address_data) if address_data else None
        return Customer.objects.create(address=address, **validated_data)


class AssetSerializer(serializers.ModelSerializer):
    device = DeviceSerializer(read_only=True)

    class Meta:
        model = Asset
        fields = ["id", "serial_number", "device"]