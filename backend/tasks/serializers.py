from rest_framework import serializers
from .models import WorkItem, Task
from service.serializers import EmployeeSerializer, LocationSerializer, ShopSerializer
from service.models import Employee, RepairShop
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

    def create(self, validated_data):
        req = self.context["request"]
        tenant = getattr(req, "tenant", None)
        if not tenant: raise serializers.ValidationError({"detail": "Tenant not resolved"})

        pe_data = validated_data.pop("pickup_point")
        de_data = validated_data.pop("dropoff_point")

        pe = LocationSerializer(data=pe_data, context={"request": req})
        pe.is_valid(raise_exception=True)
        pe = pe.save()
        de = LocationSerializer(data=de_data, context={"request": req})
        de.is_valid(raise_exception=True)
        de = de.save()

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

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["assigned_employee_id"] = serializers.PrimaryKeyRelatedField(
            queryset=Employee.objects.all(),
            source="assigned_employee",
            write_only=True,
        )