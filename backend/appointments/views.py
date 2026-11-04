import logging
from datetime import date as date_cls
from decimal import Decimal, InvalidOperation

import requests
from django.db.models import Prefetch, Q
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from core.geocoding import GeocoderUnavailable, geocode
from core.mixins import TenantScopedMixin
from core.models import Address
from customers.services import find_matching_customers
from service.models import Employee

from . import services
from .models import OPEN_STATUSES, Appointment, AppointmentStatus, Route
from .routing import haversine_km
from .serializers import ADDRESS_FIELDS, AppointmentSerializer, DriverSerializer, RouteSerializer

logger = logging.getLogger(__name__)


def _parse_date(value, field):
    try:
        return date_cls.fromisoformat(value)
    except (TypeError, ValueError):
        raise ValidationError({field: "Use the YYYY-MM-DD format."})


def _parse_coordinate(value, field, limit):
    try:
        number = Decimal(str(value))
    except (InvalidOperation, TypeError):
        raise ValidationError({field: "Must be a number."})
    if not -limit <= number <= limit:
        raise ValidationError({field: f"Must be between -{limit} and {limit}."})
    return number.quantize(Decimal("0.000001"))


class _PermissionCheckMixin:
    permission_model = None

    def _require(self, action_name):
        tenant = self._require_tenant()
        codename = f"appointments.{action_name}_{self.permission_model}"
        if not self.request.user.has_permission(codename, tenant):
            raise PermissionDenied("You do not have permission to do that.")
        return tenant


class AppointmentViewSet(_PermissionCheckMixin, TenantScopedMixin, viewsets.ModelViewSet):
    queryset = Appointment.objects.select_related(
        "address", "customer", "work_item__customer_asset__device", "route",
    ).prefetch_related("availability_windows", "work_item__appointments")
    serializer_class = AppointmentSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]
    permission_model = "appointment"

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        if self.action != "list":
            return qs

        if params.get("type"):
            qs = qs.filter(type=params["type"])
        if params.get("status"):
            qs = qs.filter(status__in=params["status"].split(","))
        if params.get("unscheduled") in ("1", "true"):
            qs = qs.filter(status__in=OPEN_STATUSES)
        if params.get("route"):
            qs = qs.filter(route_id=params["route"])
        if params.get("date"):
            qs = qs.filter(route__date=_parse_date(params["date"], "date"))
        if params.get("driver"):
            qs = qs.filter(route__driver_id=params["driver"])
        if params.get("work_item"):
            qs = qs.filter(work_item_id=params["work_item"])
        if params.get("customer"):
            qs = qs.filter(customer_id=params["customer"])
        if params.get("available_on"):
            day = _parse_date(params["available_on"], "available_on")
            matches = Q(availability_windows__date=day) | Q(availability_windows__weekday=day.weekday())
            if params.get("strict") not in ("1", "true"):
                # No windows recorded means "ask them", so keep those in view.
                matches |= Q(availability_windows__isnull=True)
            qs = qs.filter(matches).distinct()
        if params.get("search"):
            term = params["search"].strip()
            qs = qs.filter(
                Q(reference_id__icontains=term) | Q(first_name__icontains=term) | Q(last_name__icontains=term)
                | Q(phone_number__icontains=term) | Q(address__street__icontains=term)
                | Q(address__city__icontains=term)
            )
        return qs

    def perform_create(self, serializer):
        self._require("add")
        super().perform_create(serializer)

    def perform_update(self, serializer):
        self._require("change")
        if serializer.instance.status in (AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED):
            raise ValidationError({"status": "Closed appointments can't be edited."})
        super().perform_update(serializer)

    def _respond(self, appointment, **extra):
        appointment.refresh_from_db()
        data = self.get_serializer(appointment).data
        data.update(extra)
        return Response(data)

    @action(detail=True, methods=["post"])
    def schedule(self, request, pk=None):
        tenant = self._require("change")
        appointment = self.get_object()
        if request.data.get("route"):
            route = Route.objects.filter(tenant=tenant, pk=request.data["route"]).first()
            if route is None:
                raise ValidationError({"route": "Route not found."})
        else:
            day = _parse_date(request.data.get("date"), "date")
            driver = None
            if request.data.get("driver"):
                driver = Employee.objects.filter(tenant=tenant, pk=request.data["driver"]).first()
                if driver is None:
                    raise ValidationError({"driver": "Driver not found."})
            route = services.get_or_create_route(tenant, day, driver)
        position = request.data.get("position")
        services.schedule(appointment, route, int(position) if position is not None else None)
        return self._respond(appointment)

    @action(detail=True, methods=["post"])
    def unschedule(self, request, pk=None):
        self._require("change")
        appointment = services.unschedule(self.get_object())
        return self._respond(appointment)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        self._require("change")
        appointment = self.get_object()
        work_item = services.complete(appointment, request)
        return self._respond(appointment, work_item_id=work_item.pk)

    @action(detail=True, methods=["post"], url_path="mark-failed")
    def mark_failed(self, request, pk=None):
        self._require("change")
        appointment = services.mark_failed(self.get_object(), (request.data.get("reason") or "").strip())
        return self._respond(appointment)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        self._require("change")
        appointment = services.cancel(self.get_object())
        return self._respond(appointment)

    @action(detail=True, methods=["post"], url_path="set-location")
    def set_location(self, request, pk=None):
        self._require("change")
        appointment = self.get_object()
        address = appointment.address
        address.latitude = _parse_coordinate(request.data.get("latitude"), "latitude", 90)
        address.longitude = _parse_coordinate(request.data.get("longitude"), "longitude", 180)
        address.geocode_status = Address.GEOCODE_MANUAL
        address.geocoded_at = timezone.now()
        address.save(update_fields=["latitude", "longitude", "geocode_status", "geocoded_at"])
        return self._respond(appointment)

    @action(detail=True, methods=["get"])
    def nearby(self, request, pk=None):
        appointment = self.get_object()
        origin = appointment.address
        if origin.latitude is None:
            return Response({"detail": "This address has no map location yet."}, status=status.HTTP_409_CONFLICT)
        try:
            radius = float(request.query_params.get("radius_km", 5))
        except ValueError:
            raise ValidationError({"radius_km": "Must be a number."})

        candidates = (
            super().get_queryset()
            .exclude(pk=appointment.pk)
            .filter(status__in=[*OPEN_STATUSES, AppointmentStatus.SCHEDULED], address__latitude__isnull=False)
        )
        results = []
        for other in candidates:
            distance = haversine_km(origin.latitude, origin.longitude, other.address.latitude, other.address.longitude)
            if distance <= radius:
                data = self.get_serializer(other).data
                data["distance_km"] = round(distance, 2)
                results.append(data)
        results.sort(key=lambda item: item["distance_km"])
        return Response(results)

    @action(detail=False, methods=["post"])
    def geocode(self, request):
        self._require_tenant()
        data = request.data
        address = Address(**{field: (data.get(field) or "").strip() for field in ADDRESS_FIELDS})
        if not address.country:
            address.country = "Poland"
        if not (address.street and address.city):
            raise ValidationError({"detail": "Give at least the street and the city."})
        try:
            match = geocode(address.geocode_query())
        except GeocoderUnavailable as exc:
            logger.error("Geocoding disabled: %s", exc)
            return Response(
                {"detail": "Address lookup isn't set up on the server. Click the map to place the pin."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except requests.RequestException as exc:
            logger.warning("Address lookup failed for %r: %s", address.geocode_query(), exc)
            return Response(
                {"detail": "Address lookup didn't respond. Try again, or click the map to place the pin."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        if match is None:
            return Response({"found": False})
        return Response({"found": True, **match})

    @action(detail=False, methods=["get"], url_path="customer-matches")
    def customer_matches(self, request):
        tenant = self._require_tenant()
        params = request.query_params
        matches = find_matching_customers(
            tenant,
            email=params.get("email") or None,
            prefix=params.get("prefix") or None,
            phone_number=params.get("phone_number") or None,
        )
        return Response([
            {"id": c.pk, "name": c.full_name(), "phone_number": c.phone_number, "email": c.email}
            for c in matches
        ])


class RouteViewSet(_PermissionCheckMixin, TenantScopedMixin, viewsets.ModelViewSet):
    queryset = Route.objects.select_related(
        "driver__user", "driver__home_address", "driver__location__address", "driver__location__shop__address",
        "start_address", "end_address",
    ).prefetch_related(
        Prefetch("appointments", queryset=Appointment.objects.select_related("address")),
    )
    serializer_class = RouteSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]
    permission_model = "route"

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        if params.get("date"):
            qs = qs.filter(date=_parse_date(params["date"], "date"))
        if params.get("date_from"):
            qs = qs.filter(date__gte=_parse_date(params["date_from"], "date_from"))
        if params.get("date_to"):
            qs = qs.filter(date__lte=_parse_date(params["date_to"], "date_to"))
        if params.get("driver"):
            qs = qs.filter(driver_id=params["driver"])
        return qs

    def perform_create(self, serializer):
        self._require("add")
        super().perform_create(serializer)

    def perform_update(self, serializer):
        self._require("change")
        super().perform_update(serializer)

    @action(detail=True, methods=["post"])
    def reorder(self, request, pk=None):
        self._require("change")
        route = self.get_object()
        ids = request.data.get("appointment_ids")
        if not isinstance(ids, list):
            raise ValidationError({"appointment_ids": "Send a list of appointment ids."})
        services.reorder(route, ids)
        return Response(self.get_serializer(self.get_queryset().get(pk=route.pk)).data)


class DriverViewSet(TenantScopedMixin, mixins.ListModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    queryset = Employee.objects.select_related("user", "location", "home_address").filter(user__is_active=True)
    serializer_class = DriverSerializer
    http_method_names = ["get", "patch", "head", "options"]

    def get_queryset(self):
        qs = super().get_queryset().order_by("user__first_name", "user__last_name")
        if self.request.query_params.get("is_driver") in ("1", "true"):
            qs = qs.filter(is_driver=True)
        return qs

    def perform_update(self, serializer):
        tenant = self._require_tenant()
        user = self.request.user
        if "is_driver" in serializer.validated_data and not user.has_permission("manage_users", tenant):
            raise PermissionDenied("Only user administrators can choose drivers.")
        if "home_address" in serializer.validated_data and not (
            user.has_permission("appointments.change_route", tenant) or user.has_permission("manage_users", tenant)
        ):
            raise PermissionDenied("You need permission to plan routes to set a driver's home address.")
        super().perform_update(serializer)
        services.adopt_unassigned_routes(tenant)
