from rest_framework import serializers
from .models import WorkItem, Task, TaskType, TaskTypeValidationRule
from core.models import PicklistValue
from service.serializers import EmployeeSerializer, LocationSerializer, ShopSerializer
from service.models import Employee, RepairShop, Location
from inventory.models import Device
from customers.models import Asset


def validate_picklist_value(tenant, category, value):
    """
    Validate that a value exists in the active picklist for a given tenant and category.

    Args:
        tenant: The tenant instance
        category: The picklist category (e.g., 'workitem_status', 'task_status', 'currency')
        value: The value to validate

    Raises:
        serializers.ValidationError: If the value is not in the active picklist
    """
    if not value:
        return  # Allow empty if field is not required

    exists = PicklistValue.objects.filter(
        tenant=tenant,
        category=category,
        value=value,
        is_active=True
    ).exists()

    if not exists:
        # Fetch available options for helpful error message
        available = PicklistValue.objects.filter(
            tenant=tenant,
            category=category,
            is_active=True
        ).order_by('sort_order').values_list('value', flat=True)

        available_str = ', '.join(available) if available else 'None'
        raise serializers.ValidationError(
            f"Invalid value '{value}'. Available options: {available_str}"
        )


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
    owner = EmployeeSerializer(read_only=True)
    owner_id = serializers.PrimaryKeyRelatedField(
        source="owner",
        queryset=Employee.objects.all(),
        write_only=True, required=False, allow_null=True
    )
    technician = EmployeeSerializer(read_only=True)
    technician_id = serializers.PrimaryKeyRelatedField(
        source="technician",
        queryset=Employee.objects.all(),
        write_only=True, required=False, allow_null=True
    )
    device_name = serializers.SerializerMethodField()
    device_category_name = serializers.SerializerMethodField()

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

    def validate_status(self, value):
        """Validate status against active picklist values"""
        tenant = self.context.get('tenant') or getattr(
            self.context.get('request'), 'tenant', None
        )
        if tenant:
            validate_picklist_value(tenant, 'workitem_status', value)
        return value

    def validate_currency(self, value):
        """Validate currency against active picklist values"""
        if not value:
            return value
        tenant = self.context.get('tenant') or getattr(
            self.context.get('request'), 'tenant', None
        )
        if tenant:
            validate_picklist_value(tenant, 'currency', value)
        return value

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

    def get_device_category_name(self, obj):
        asset = getattr(obj, "customer_asset", None)
        device = getattr(asset, "device", None)
        category = getattr(device, "category", None)
        if not category:
            return None
        return getattr(category, "name", None)

    def create(self, validated_data):
        req = self.context["request"]
        tenant = getattr(req, "tenant", None)
        if not tenant: raise serializers.ValidationError({"detail": "Tenant not resolved"})

        # Set owner to current user's employee if not provided
        if "owner" not in validated_data or validated_data["owner"] is None:
            if hasattr(req.user, "employee") and req.user.employee:
                validated_data["owner"] = req.user.employee
            else:
                raise serializers.ValidationError({"owner_id": "Owner is required and current user has no associated employee"})

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


class TaskTypeSerializer(serializers.ModelSerializer):
    """Serializer for TaskType model"""

    class Meta:
        model = TaskType
        fields = ['id', 'name', 'estimated_duration', 'is_active', 'created_date']
        extra_kwargs = {
            "tenant": {"read_only": True},
        }


class TaskSerializer(serializers.ModelSerializer):
    assigned_employee = EmployeeSerializer(read_only=True)
    task_type = TaskTypeSerializer(read_only=True)

    assigned_employee_id = serializers.PrimaryKeyRelatedField(
        queryset=Employee.objects.all(),
        source="assigned_employee",
        write_only=True,
    )

    task_type_id = serializers.PrimaryKeyRelatedField(
        queryset=TaskType.objects.all(),
        source="task_type",
        write_only=True,
        required=False,
        allow_null=True
    )

    # Allow creating a new task type by name
    task_type_name = serializers.CharField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = Task
        fields = "__all__"
        extra_kwargs = {
            "tenant": {"read_only": True},
            "actual_duration": {"read_only": True},
            "completed_date": {"read_only": True},
            "summary": {"required": False, "allow_blank": True},
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["assigned_employee_id"] = serializers.PrimaryKeyRelatedField(
            queryset=Employee.objects.all(),
            source="assigned_employee",
            write_only=True,
        )

    def validate(self, attrs):
        """
        Validate task data, including task type validation rules when completing a task.
        """
        status = attrs.get('status', getattr(self.instance, 'status', None) if self.instance else None)
        task_type = attrs.get('task_type', getattr(self.instance, 'task_type', None) if self.instance else None)

        # If status is being changed to 'Done', validate required fields based on task type
        if status == 'Done' and task_type:
            validation_rules = TaskTypeValidationRule.objects.filter(
                task_type=task_type,
                is_required=True
            )

            errors = {}
            for rule in validation_rules:
                field_name = rule.field_name
                # Check if field is in attrs (being updated) or in the instance (existing value)
                field_value = attrs.get(field_name)
                if field_value is None and self.instance:
                    field_value = getattr(self.instance, field_name, None)

                # Check if the field is empty
                if not field_value or (isinstance(field_value, str) and not field_value.strip()):
                    errors[field_name] = f"This field is required for task type '{task_type.name}' before completion."

            if errors:
                raise serializers.ValidationError(errors)

        return attrs

    def validate_status(self, value):
        """Validate status against active picklist values"""
        tenant = self.context.get('tenant') or getattr(
            self.context.get('request'), 'tenant', None
        )
        if tenant:
            validate_picklist_value(tenant, 'task_status', value)
        return value

    def create(self, validated_data):
        """
        Handle creation of task, including creating new task type if task_type_name is provided.
        """
        task_type_name = validated_data.pop('task_type_name', None)
        tenant = self.context.get('tenant') or getattr(self.context.get('request'), 'tenant', None)

        # If task_type_name is provided, create or get the task type
        if task_type_name and tenant:
            task_type, created = TaskType.objects.get_or_create(
                tenant=tenant,
                name=task_type_name,
                defaults={'is_active': True}
            )
            validated_data['task_type'] = task_type

        return super().create(validated_data)

    def update(self, instance, validated_data):
        """
        Handle updating task, including creating new task type if task_type_name is provided.
        """
        task_type_name = validated_data.pop('task_type_name', None)
        tenant = self.context.get('tenant') or getattr(self.context.get('request'), 'tenant', None)

        # If task_type_name is provided, create or get the task type
        if task_type_name and tenant:
            task_type, created = TaskType.objects.get_or_create(
                tenant=tenant,
                name=task_type_name,
                defaults={'is_active': True}
            )
            validated_data['task_type'] = task_type

        return super().update(instance, validated_data)
