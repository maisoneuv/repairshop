from rest_framework import serializers
from .models import WorkItem, Task
from service.serializers import EmployeeSerializer, LocationSerializer, ShopSerializer
from service.models import Employee, RepairShop, Location
from inventory.models import Device
from customers.models import Asset

class WorkItemSerializer(serializers.ModelSerializer):
    device = serializers.PrimaryKeyRelatedField(
        queryset=Device.objects.all(), write_only=True, required=False
    )
    serial_number = serializers.CharField(write_only=True, required=False)
    pickup_point = LocationSerializer()
    dropoff_point = LocationSerializer()
    fulfillment_shop = ShopSerializer(read_only=True)
    fulfillment_shop_id = serializers.PrimaryKeyRelatedField(
        source="fulfillment_shop",
        queryset=RepairShop.objects.all(),
        write_only=True, required=False, allow_null=True
    )
    device_name = serializers.SerializerMethodField()

    class Meta:
        model = WorkItem
        fields = "__all__"
        extra_kwargs = {
            "customer_asset": {"required": False, "allow_null": True},
            "tenant": {"read_only": True},
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Get tenant from context (preferred) or from request on context
        tenant = self.context.get("tenant")
        if tenant is None:
            req = self.context.get("request")
            tenant = getattr(req, "tenant", None) if req else None

        qs = RepairShop.objects.none()
        if tenant is not None:
            qs = RepairShop.objects.filter(tenant=tenant, active=True)
        self.fields["fulfillment_shop_id"].queryset = qs

    def validate(self, attrs):
        tenant = self.context.get("tenant") or getattr(self.context.get("request"), "tenant", None)
        shop = attrs.get("fulfillment_shop")
        if tenant and shop and shop.tenant_id != tenant.id:
            raise serializers.ValidationError({"fulfillment_shop_id": "Unknown for this tenant."})
        return attrs

    def get_device_name(self, obj):
        asset = getattr(obj, "customer_asset", None)
        device = getattr(asset, "device", None)
        if not device:
            return None
        manufacturer = getattr(device, "manufacturer", "") or ""
        model = getattr(device, "model", "") or ""
        if manufacturer and model:
            return f"{manufacturer} {model}".strip()
        return model or manufacturer or None

    def create(self, validated_data):
        req = self.context["request"]
        tenant = getattr(req, "tenant", None)
        if not tenant: raise serializers.ValidationError({"detail": "Tenant not resolved"})

        def resolve_location(payload, allow_null=False):
            if payload is None:
                if allow_null:
                    return None
                raise serializers.ValidationError({"detail": "Location required"})

            if isinstance(payload, int):
                try:
                    return Location.objects.get(id=payload)
                except Location.DoesNotExist:
                    raise serializers.ValidationError({"detail": "Location not found"})

            if isinstance(payload, dict) and "id" in payload:
                remaining = {
                    key for key, value in payload.items()
                    if key != "id" and value not in (None, "")
                }

                if not remaining:
                    try:
                        return Location.objects.get(id=payload["id"])
                    except Location.DoesNotExist:
                        raise serializers.ValidationError({"detail": "Location not found"})

            serializer = LocationSerializer(data=payload, context={"request": req})
            serializer.is_valid(raise_exception=True)
            return serializer.save()

        pe_data = validated_data.pop("pickup_point")
        de_data = validated_data.pop("dropoff_point")

        pe = resolve_location(pe_data, allow_null=True)
        de = resolve_location(de_data)

        fs_id = validated_data.pop("fulfillment_shop_id", None)
        if fs_id is not None:
            # Optional: verify it’s either internal or partner of this tenant
            if not RepairShop.objects.filter(id=fs_id, tenant=tenant, active=True).exists():
                raise serializers.ValidationError({"fulfillment_shop_id": "unknown"})

        device = validated_data.pop("device", None)
        serial_number = validated_data.pop("serial_number", None)
        customer = validated_data.get("customer")

        # Create or get CustomerAsset if all required info is present
        asset = None
        if device and serial_number and customer:
            asset, _ = Asset.objects.get_or_create(
                customer=customer,
                serial_number=serial_number,
                defaults={"device": device}
            )
        if asset:
            validated_data["customer_asset"] = asset

        validated_data["pickup_point"] = pe
        validated_data["dropoff_point"] = de

        return super().create(validated_data)

class TaskSerializer(serializers.ModelSerializer):
    assigned_employee = EmployeeSerializer(read_only=True)

    assigned_employee_id = serializers.PrimaryKeyRelatedField(
        queryset=Employee.objects.all(),
        source="assigned_employee",
        write_only=True,
    )

    class Meta:
        model = Task
        fields = "__all__"
        extra_kwargs = {
            "tenant": {"read_only": True},
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["assigned_employee_id"] = serializers.PrimaryKeyRelatedField(
            queryset=Employee.objects.all(),
            source="assigned_employee",
            write_only=True,
        )
