from inventory.serializers import DeviceSerializer
from .models import Customer, Asset
from rest_framework import serializers
from core.serializers import AddressSerializer
from core.models import Address

class CustomerSerializer(serializers.ModelSerializer):
    address = AddressSerializer(required=False, allow_null=True)

    class Meta:
        model = Customer
        fields = ['id', 'first_name', 'last_name', 'email', 'phone_number', 'referral_source', 'tax_code', 'address']
        read_only_fields = ['id', 'tenant']

    def validate_address(self, value):
        if isinstance(value, dict) and all(not (v or '').strip() for v in value.values()):
            return None
        return value

    def create(self, validated_data):
        request = self.context.get("request")
        tenant = getattr(request, "tenant", None) if request else None
        if tenant is None:
            raise serializers.ValidationError({"detail": "Tenant not resolved"})

        address_data = validated_data.pop("address", None)
        address = Address.objects.create(**address_data) if address_data else None
        return Customer.objects.create(address=address, tenant=tenant, **validated_data)


class AssetSerializer(serializers.ModelSerializer):
    device = DeviceSerializer(read_only=True)

    class Meta:
        model = Asset
        fields = ["id", "serial_number", "device"]