from rest_framework import serializers

from core.serializers import AddressSerializer
from .models import Employee, Location, LocationType, RepairShop
from core.models import User, Address


class EmployeeSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    email = serializers.EmailField(source='user.email')

    class Meta:
        model = Employee
        fields = ['id', 'name', 'email', 'role', 'tenant']

    def get_name(self, obj):
        user = obj.user
        # Use first_name and last_name from AbstractUser
        full_name = f"{user.first_name} {user.last_name}".strip()
        # Fallback to the name field if first_name/last_name are empty
        return full_name if full_name else user.name or user.email

class UserMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'first_name', 'last_name', 'name', 'email']

class CurrentEmployeeSerializer(serializers.ModelSerializer):
    user = UserMiniSerializer(read_only=True)
    location_name = serializers.CharField(source='location.name', read_only=True)

    class Meta:
        model = Employee
        fields = ['id', 'user', 'location_id', 'location_name', 'role']

class LocationSerializer(serializers.ModelSerializer):
    address = AddressSerializer(required=False, allow_null=True)
    shop_id = serializers.IntegerField(required=False)
    customer_id = serializers.IntegerField(required=False)
    address_id = serializers.IntegerField(required=False)

    class Meta:
        model = Location
        fields = ["id", "type", "name", "shop_id", "customer_id", "address_id", "address"]

    def to_internal_value(self, data):
        # Handle integer IDs (for existing locations) by returning the location instance
        if isinstance(data, int):
            try:
                location = Location.objects.get(id=data)
                return {"id": location.id}
            except Location.DoesNotExist:
                raise serializers.ValidationError(f"Location with id {data} does not exist")

        # Handle dictionary data (for new locations or detailed data)
        d = dict(data or {})
        if isinstance(d.get("address"), dict) and all(not (v or "").strip() for v in d["address"].values()):
            d["address"] = None
        return super().to_internal_value(d)

    def create(self, validated):
        # If caller passed an existing location id, just return that instance
        if set(validated.keys()) == {"id"}:
            try:
                return Location.objects.get(id=validated["id"])
            except Location.DoesNotExist:
                raise serializers.ValidationError({"id": "Location not found"})

        req = self.context["request"];
        tenant = getattr(req, "tenant", None)
        if not tenant: raise serializers.ValidationError({"detail": "Tenant not resolved"})
        t = validated["type"];
        label = validated.get("label", "")

        if t == LocationType.SHOP:
            sid = validated.get("shop_id")
            if not sid: raise serializers.ValidationError({"shop_id": "required for type=shop"})
            # Optionally ensure the shop belongs to the tenant:
            if not RepairShop.objects.filter(id=sid, tenant=tenant).exists():
                raise serializers.ValidationError({"shop_id": "unknown"})
            return Location.objects.create(tenant=tenant, type=t, shop_id=sid, label=label)

        if t == LocationType.CUSTOMER_ADDRESS:
            cid = validated.get("customer_id");
            aid = validated.get("address_id")
            if not (cid and aid):
                raise serializers.ValidationError({"customer_id": "required", "address_id": "required"})
            return Location.objects.create(tenant=tenant, type=t, customer_id=cid, address_id=aid, label=label)

        if t == LocationType.FREEFORM:
            addr = validated.get("address")
            if not addr: raise serializers.ValidationError({"address": "required for type=freeform"})
            addr_ser = AddressSerializer(data=addr, context=self.context)
            addr_ser.is_valid(raise_exception=True)
            address = addr_ser.save()
            return Location.objects.create(tenant=tenant, type=t, address=address, label=label)

        raise serializers.ValidationError({"type": "invalid"})

class ShopSerializer(serializers.ModelSerializer):
    address = AddressSerializer(read_only=True)
    address_id = serializers.PrimaryKeyRelatedField(
        source="address",
        queryset=Address.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
    )

    class Meta:
        model = RepairShop
        fields = [
            "id",
            "name",
            "type",
            "active",
            "contact_email",
            "contact_phone",
            "address",  # read-only
            "address_id",  # write-only
        ]
        read_only_fields = ["id"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Have tenant handy for validation
        self._tenant = self.context.get("tenant") or getattr(self.context.get("request"), "tenant", None)

    def validate_name(self, value):
        tenant = self._tenant
        if not tenant:
            raise serializers.ValidationError("Tenant not resolved")
        qs = RepairShop.objects.filter(tenant=tenant, name=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A shop with this name already exists for this tenant.")
        return value

    # def create(self, validated_data):
    #     tenant = self._tenant
    #     if not tenant:
    #         raise serializers.ValidationError({"detail": "Tenant not resolved"})
    #     # If caller sent an address object in initial_data (not recommended here),
    #     # you could create it:
    #     addr_payload = self.initial_data.get("address")
    #     if addr_payload and "address" not in validated_data:
    #         addr_ser = AddressSerializer(data=addr_payload, context=self.context)
    #         addr_ser.is_valid(raise_exception=True)
    #         validated_data["address"] = addr_ser.save()
    #     return RepairShop.objects.create(tenant=tenant, **validated_data)
