from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from core.models import Address
from core.serializer_fields import TenantScopedPrimaryKeyRelatedField
from customers.models import Customer, Lead
from service.models import Employee
from tasks.models import WorkItem

from .models import (
    Appointment, AppointmentStatus, AppointmentType, AvailabilityWindow, Route,
)

ADDRESS_FIELDS = ["street", "building_number", "apartment_number", "postal_code", "city", "country"]


class AppointmentAddressSerializer(serializers.ModelSerializer):
    latitude = serializers.DecimalField(
        max_digits=9, decimal_places=6, min_value=-90, max_value=90, required=False, allow_null=True,
    )
    longitude = serializers.DecimalField(
        max_digits=9, decimal_places=6, min_value=-180, max_value=180, required=False, allow_null=True,
    )
    geocode_status = serializers.ChoiceField(
        choices=[Address.GEOCODE_OK, Address.GEOCODE_MANUAL], required=False,
    )
    # Callers rarely know it, and it isn't needed to find the place on the map.
    postal_code = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")

    class Meta:
        model = Address
        fields = ["id", *ADDRESS_FIELDS, "latitude", "longitude", "geocode_status"]
        read_only_fields = ["id"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["geocode_status"] = instance.geocode_status
        return data

    def validate(self, attrs):
        if (attrs.get("latitude") is None) != (attrs.get("longitude") is None):
            raise serializers.ValidationError("Send both latitude and longitude, or neither.")
        return attrs


class AvailabilityWindowSerializer(serializers.ModelSerializer):
    class Meta:
        model = AvailabilityWindow
        fields = ["id", "date", "weekday", "start_time", "end_time"]

    def validate(self, attrs):
        if bool(attrs.get("date")) == (attrs.get("weekday") is not None):
            raise serializers.ValidationError("Give either a date or a weekday.")
        weekday = attrs.get("weekday")
        if weekday is not None and not 0 <= weekday <= 6:
            raise serializers.ValidationError({"weekday": "Use 0 (Monday) to 6 (Sunday)."})
        start, end = attrs.get("start_time"), attrs.get("end_time")
        if start and end and end <= start:
            raise serializers.ValidationError({"end_time": "End time must be after start time."})
        return attrs


def save_address(address, data):
    """Save address fields onto `address`. Coordinates sent along (the form
    already looked the address up, and the user may have dragged the pin) are
    kept; without them, Address.save queues a lookup when the address changed."""
    data = dict(data)
    latitude, longitude = data.pop("latitude", None), data.pop("longitude", None)
    pin_status = data.pop("geocode_status", Address.GEOCODE_OK)
    for field, value in data.items():
        setattr(address, field, value)
    if latitude is not None:
        address.latitude, address.longitude = latitude, longitude
        address.geocode_status = pin_status
        address.geocoded_at = timezone.now()
    address.save()
    return address


class DriverSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    location_name = serializers.CharField(source="location.name", read_only=True)
    home_address = AppointmentAddressSerializer(required=False, allow_null=True)

    class Meta:
        model = Employee
        fields = ["id", "name", "is_driver", "location_id", "location_name", "home_address"]
        read_only_fields = ["id", "name", "location_id", "location_name"]

    def get_name(self, obj):
        user = obj.user
        return f"{user.first_name} {user.last_name}".strip() or user.name or user.email

    @transaction.atomic
    def update(self, instance, validated_data):
        if "home_address" in validated_data:
            data = validated_data.pop("home_address")
            # Always a new row: past routes that started at the old home keep it.
            instance.home_address = save_address(Address(), data) if data else None
        return super().update(instance, validated_data)


ENDPOINT_SHOP, ENDPOINT_HOME, ENDPOINT_OTHER = "shop", "home", "other"


class RouteEndpointSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=[ENDPOINT_SHOP, ENDPOINT_HOME, ENDPOINT_OTHER])
    address = AppointmentAddressSerializer(required=False)

    def validate(self, attrs):
        if attrs["kind"] == ENDPOINT_OTHER and not attrs.get("address"):
            raise serializers.ValidationError({"address": "Give the address to start or end at."})
        return attrs


def _short_address(address):
    street = " ".join(filter(None, [address.street, address.building_number]))
    return ", ".join(filter(None, [street, address.city]))


def describe_endpoint(address, driver):
    if address is None:
        return None
    from .services import driver_shop_address
    shop = driver_shop_address(driver)
    if shop and address.pk == shop.pk:
        kind, label = ENDPOINT_SHOP, driver.location.name
    elif driver and address.pk == driver.home_address_id:
        kind, label = ENDPOINT_HOME, "Home"
    else:
        kind, label = ENDPOINT_OTHER, _short_address(address)
    return {
        "kind": kind,
        "label": label,
        "address": _short_address(address),
        "latitude": address.latitude,
        "longitude": address.longitude,
        "fields": AppointmentAddressSerializer(address).data,
    }


class RouteSerializer(serializers.ModelSerializer):
    driver = TenantScopedPrimaryKeyRelatedField(
        queryset=Employee.objects.all(), required=False, allow_null=True,
    )
    start = RouteEndpointSerializer(write_only=True, required=False)
    end = RouteEndpointSerializer(write_only=True, required=False)
    driver_name = serializers.SerializerMethodField()
    has_home = serializers.SerializerMethodField()
    stop_ids = serializers.SerializerMethodField()
    google_maps_urls = serializers.SerializerMethodField()

    class Meta:
        model = Route
        fields = [
            "id", "date", "driver", "driver_name", "has_home", "start", "end", "notes",
            "stop_ids", "google_maps_urls",
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["start"] = describe_endpoint(instance.start_address, instance.driver)
        data["end"] = describe_endpoint(instance.end_address, instance.driver)
        return data

    def _stops(self, obj):
        return [a for a in obj.appointments.all() if a.status != AppointmentStatus.CANCELLED]

    def get_driver_name(self, obj):
        return DriverSerializer(obj.driver).data["name"] if obj.driver else None

    def get_has_home(self, obj):
        return bool(obj.driver and obj.driver.home_address_id)

    def get_stop_ids(self, obj):
        return [a.id for a in sorted(self._stops(obj), key=_stop_sort_key)]

    def get_google_maps_urls(self, obj):
        from .routing import google_maps_urls
        stops = [a.address for a in sorted(self._stops(obj), key=_stop_sort_key)]
        return google_maps_urls(obj.start_address, stops, obj.end_address)

    def _resolve_endpoint(self, endpoint, driver, field):
        from .services import driver_shop_address
        kind = endpoint["kind"]
        if kind == ENDPOINT_SHOP:
            address = driver_shop_address(driver)
            if address is None:
                raise serializers.ValidationError({field: "Assign a driver first, so the route knows which shop."})
            return address
        if kind == ENDPOINT_HOME:
            if not (driver and driver.home_address_id):
                raise serializers.ValidationError({field: "This driver has no home address yet. Add it under Drivers."})
            return driver.home_address
        return save_address(Address(), endpoint["address"])

    def _apply_endpoints(self, validated_data, driver):
        for field in ("start", "end"):
            endpoint = validated_data.pop(field, None)
            if endpoint is not None:
                validated_data[f"{field}_address"] = self._resolve_endpoint(endpoint, driver, field)

    @transaction.atomic
    def create(self, validated_data):
        from .services import default_endpoints
        driver = validated_data.get("driver")
        start, end = default_endpoints(driver)
        validated_data.setdefault("start_address", start)
        validated_data.setdefault("end_address", end)
        self._apply_endpoints(validated_data, driver)
        return super().create(validated_data)

    @transaction.atomic
    def update(self, instance, validated_data):
        self._apply_endpoints(validated_data, validated_data.get("driver", instance.driver))
        return super().update(instance, validated_data)


def _stop_sort_key(appointment):
    return (appointment.stop_order is None, appointment.stop_order or 0, appointment.id)


class AppointmentSerializer(serializers.ModelSerializer):
    address = AppointmentAddressSerializer()
    availability_windows = AvailabilityWindowSerializer(many=True, required=False)
    customer = TenantScopedPrimaryKeyRelatedField(queryset=Customer.objects.all(), required=False, allow_null=True)
    lead = TenantScopedPrimaryKeyRelatedField(queryset=Lead.objects.all(), required=False, allow_null=True)
    work_item = TenantScopedPrimaryKeyRelatedField(queryset=WorkItem.objects.all(), required=False, allow_null=True)
    customer_name = serializers.SerializerMethodField()
    device_label = serializers.SerializerMethodField()
    work_item_reference = serializers.CharField(source="work_item.reference_id", read_only=True, default=None)
    route_date = serializers.DateField(source="route.date", read_only=True, default=None)
    driver = serializers.IntegerField(source="route.driver_id", read_only=True, default=None)

    class Meta:
        model = Appointment
        fields = [
            "id", "reference_id", "type", "status",
            "first_name", "last_name", "prefix", "phone_number", "phone_e164", "email",
            "customer", "customer_name", "lead", "work_item", "work_item_reference",
            "source", "address",
            "device_description", "device_label", "issue_description", "notes",
            "availability_note", "availability_windows",
            "route", "route_date", "driver", "stop_order", "arrival_window_start", "arrival_window_end",
            "completed_at", "failure_reason", "attempts", "created_at", "updated_at",
        ]
        read_only_fields = [
            "reference_id", "status", "phone_e164", "route", "stop_order",
            "completed_at", "failure_reason", "attempts", "created_at", "updated_at",
        ]

    def get_customer_name(self, obj):
        return obj.customer.full_name() if obj.customer else None

    def get_device_label(self, obj):
        """What the driver collects or brings back. Returns usually have no
        description of their own: use the pickup that brought the device in,
        then the device recorded on the work item."""
        if obj.device_description:
            return obj.device_description
        work_item = obj.work_item
        if work_item is None:
            return None
        for sibling in work_item.appointments.all():
            if sibling.type == AppointmentType.PICKUP and sibling.device_description:
                return sibling.device_description
        device = getattr(work_item.customer_asset, "device", None)
        if device:
            return " ".join(filter(None, [device.manufacturer, device.model])) or None
        return None

    def validate(self, attrs):
        instance = self.instance
        type_ = attrs.get("type", getattr(instance, "type", AppointmentType.PICKUP))
        work_item = attrs.get("work_item", getattr(instance, "work_item", None))
        if type_ == AppointmentType.RETURN_DELIVERY and not work_item:
            raise serializers.ValidationError({"work_item": "A return delivery must be linked to a work item."})

        email = attrs.get("email", getattr(instance, "email", None))
        phone = attrs.get("phone_number", getattr(instance, "phone_number", None))
        if not email and not phone:
            raise serializers.ValidationError({"phone_number": "Give a phone number or an email address."})

        start = attrs.get("arrival_window_start", getattr(instance, "arrival_window_start", None))
        end = attrs.get("arrival_window_end", getattr(instance, "arrival_window_end", None))
        if start and end and end <= start:
            raise serializers.ValidationError({"arrival_window_end": "End time must be after start time."})
        return attrs

    def _replace_windows(self, appointment, windows):
        appointment.availability_windows.all().delete()
        AvailabilityWindow.objects.bulk_create(
            AvailabilityWindow(appointment=appointment, **window) for window in windows
        )

    @transaction.atomic
    def create(self, validated_data):
        address_data = validated_data.pop("address")
        windows = validated_data.pop("availability_windows", [])
        validated_data["address"] = save_address(Address(), address_data)
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data["created_by"] = request.user
        appointment = super().create(validated_data)
        self._replace_windows(appointment, windows)
        return appointment

    @transaction.atomic
    def update(self, instance, validated_data):
        address_data = validated_data.pop("address", None)
        windows = validated_data.pop("availability_windows", None)
        if address_data is not None:
            # Completing a pickup can hand this Address row to the new
            # customer, so after that an edit here moves their address too.
            save_address(instance.address, address_data)
        appointment = super().update(instance, validated_data)
        if windows is not None:
            self._replace_windows(appointment, windows)
        return appointment
