from rest_framework import serializers
from .models import WorkItem, Task
from service.serializers import EmployeeSerializer
from service.models import Employee
from inventory.models import Device
from customers.models import Asset

class WorkItemSerializer(serializers.ModelSerializer):
    device = serializers.PrimaryKeyRelatedField(
        queryset=Device.objects.all(), write_only=True, required=False
    )
    serial_number = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = WorkItem
        fields = "__all__"
        extra_kwargs = {
            "customer_asset": {"required": False, "allow_null": True},
        }

    def create(self, validated_data):
        device = validated_data.pop("device", None)
        serial_number = validated_data.pop("serial_number", None)
        customer = validated_data.get("customer")
        print(serial_number)
        print(device)
        print(customer)
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
        # Manually add the extra field if not automatically included
        self.fields["assigned_employee_id"] = serializers.PrimaryKeyRelatedField(
            queryset=Employee.objects.all(),
            source="assigned_employee",
            write_only=True,
        )