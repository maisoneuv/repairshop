from inventory.serializers import DeviceSerializer
from inventory.models import Device
from .models import Customer, Asset, Lead
from rest_framework import serializers
from core.serializers import AddressSerializer
from core.models import Address
from tasks.models import WorkItem

class CustomerSerializer(serializers.ModelSerializer):
    address = AddressSerializer(required=False, allow_null=True)

    class Meta:
        model = Customer
        fields = ['id', 'first_name', 'last_name', 'email', 'prefix', 'phone_number', 'referral_source', 'tax_code', 'address']
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

    def update(self, instance, validated_data):
        address_data = validated_data.pop("address", serializers.empty)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if address_data is not serializers.empty:
            if address_data is None:
                if instance.address_id:
                    instance.address.delete()
                instance.address = None
            else:
                if instance.address_id:
                    for attr, value in address_data.items():
                        setattr(instance.address, attr, value)
                    instance.address.save()
                else:
                    instance.address = Address.objects.create(**address_data)

        instance.save()
        return instance


class AssetSerializer(serializers.ModelSerializer):
    device = DeviceSerializer(read_only=True)
    device_id = serializers.PrimaryKeyRelatedField(
        queryset=Device.objects.all(),
        source='device',
        write_only=True,
        required=False
    )
    customer_id = serializers.PrimaryKeyRelatedField(
        queryset=Customer.objects.all(),
        source='customer',
        write_only=True,
        required=False
    )

    class Meta:
        model = Asset
        fields = ["id", "serial_number", "device", "device_id", "customer_id", "customer"]
        read_only_fields = ["id", "customer"]

    def create(self, validated_data):
        request = self.context.get("request")
        tenant = getattr(request, "tenant", None) if request else None
        if tenant is None:
            raise serializers.ValidationError({"detail": "Tenant not resolved"})

        customer = validated_data.get('customer')
        if customer and customer.tenant_id != tenant.id:
            raise serializers.ValidationError({"customer_id": "Customer does not belong to this tenant"})

        return Asset.objects.create(**validated_data)


class LeadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Lead
        fields = ['id', 'first_name', 'last_name', 'email', 'prefix', 'phone_number',
                  'device_description', 'notes', 'status', 'created_at']
        read_only_fields = ['id', 'created_at']

    def validate(self, data):
        email = data.get('email') or (self.instance and self.instance.email)
        phone = data.get('phone_number') or (self.instance and self.instance.phone_number)
        if not email and not phone:
            raise serializers.ValidationError("Wymagany email lub numer telefonu.")
        return data


class WorkItemBriefSerializer(serializers.ModelSerializer):
    device = serializers.SerializerMethodField()

    class Meta:
        model = WorkItem
        fields = ['reference_id', 'status', 'device']

    def get_device(self, obj):
        if obj.customer_asset and obj.customer_asset.device:
            d = obj.customer_asset.device
            parts = list(filter(None, [d.manufacturer, d.model]))
            return " ".join(parts) or None
        return None


class CustomerSearchSerializer(serializers.ModelSerializer):
    work_items = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = ['id', 'first_name', 'last_name', 'phone_number', 'work_items']

    def get_work_items(self, obj):
        qs = (
            WorkItem.objects
            .filter(customer=obj)
            .select_related('customer_asset__device')
            .order_by('-created_date')[:5]
        )
        return WorkItemBriefSerializer(qs, many=True).data
