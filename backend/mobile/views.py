"""Mobile app sign-in.

An employee signs in once when the phone is set up and never returns to this
screen: the access token lives about fifteen minutes, the refresh token half a
year and rotates on every use. A spent refresh token goes on the blacklist.

Every request therefore has a concrete author, which is what allows CRM entries
to be attributed to an employee and a follow-up task to be created after a call.
"""

import logging

from django.contrib.auth import authenticate
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from service.models import Employee
from tenants.models import Tenant

from .models import MobileDevice
from .serializers import (
    MobileLoginSerializer,
    MobileLogoutSerializer,
    MobileRefreshSerializer,
)

logger = logging.getLogger(__name__)

# Name of the extra token claim. It lets a refresh check whether the phone has
# been signed out remotely in the meantime.
DEVICE_CLAIM = "device_id"


def _issue_tokens(user, device):
    refresh = RefreshToken.for_user(user)
    refresh[DEVICE_CLAIM] = device.id
    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
    }


def _touch(device):
    device.last_seen_at = timezone.now()
    device.save(update_fields=["last_seen_at"])


class MobileLoginView(APIView):
    """POST /api/mobile/auth/login"""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = MobileLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        tenant = Tenant.objects.filter(subdomain=data["tenant"]).first()
        user = authenticate(
            request, username=data["email"], email=data["email"], password=data["password"]
        )

        # The same response for a wrong password, an unknown shop and an account
        # belonging to another shop - otherwise the endpoint would let someone
        # probe which addresses exist.
        if tenant is None or user is None or not user.is_active:
            return Response({"detail": "Invalid credentials."}, status=401)

        if user.tenant_id != tenant.id and not user.is_superuser:
            return Response({"detail": "Invalid credentials."}, status=401)

        # Without a linked employee there is no way to attribute CRM entries or
        # create a follow-up task. Better to stop here, with a clear message,
        # than to fail later on write.
        employee = Employee.objects.filter(user=user, tenant=tenant).first()
        if employee is None:
            return Response(
                {"detail": "This account is not linked to an employee of this shop."},
                status=403,
            )

        device, _created = MobileDevice.objects.get_or_create(
            tenant=tenant,
            employee=employee,
            label=data["device_label"],
        )
        # Signing in again on the same phone lifts an earlier revocation.
        device.revoked_at = None
        device.last_seen_at = timezone.now()
        device.save(update_fields=["revoked_at", "last_seen_at"])

        logger.info(
            "mobile login tenant=%s employee=%s device=%s",
            tenant.subdomain, employee.pk, device.pk,
        )

        return Response(
            {
                **_issue_tokens(user, device),
                "device_id": device.id,
                "tenant": tenant.subdomain,
                "employee_id": employee.id,
            },
            status=status.HTTP_200_OK,
        )


class MobileRefreshView(APIView):
    """POST /api/mobile/auth/refresh - rotates the refresh token."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = MobileRefreshSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            refresh = RefreshToken(serializer.validated_data["refresh"])
        except TokenError:
            return Response({"detail": "Refresh token is not valid."}, status=401)

        device_id = refresh.get(DEVICE_CLAIM)
        device = MobileDevice.objects.filter(pk=device_id).first() if device_id else None

        if device is None or not device.is_active:
            return Response({"detail": "This device has been signed out."}, status=401)

        new_tokens = {"access": str(refresh.access_token)}

        # Rotation: the old token goes on the blacklist and the phone receives a
        # new one, so a stolen refresh token is only useful until its rightful
        # owner next uses theirs.
        try:
            refresh.blacklist()
        except AttributeError:
            # Blacklisting requires the token_blacklist app; without it rotation
            # cannot work and we would rather find out from the log.
            logger.warning("Token blacklist is not enabled - refresh tokens are not rotated")
        else:
            rotated = RefreshToken.for_user(device.employee.user)
            rotated[DEVICE_CLAIM] = device.id
            new_tokens["refresh"] = str(rotated)

        _touch(device)
        return Response(new_tokens)


class MobileLogoutView(APIView):
    """POST /api/mobile/auth/logout - signs this device out."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = MobileLogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            refresh = RefreshToken(serializer.validated_data["refresh"])
        except TokenError:
            return Response({"detail": "Refresh token is not valid."}, status=401)

        device_id = refresh.get(DEVICE_CLAIM)
        device = MobileDevice.objects.filter(pk=device_id).first() if device_id else None
        if device:
            device.revoked_at = timezone.now()
            device.save(update_fields=["revoked_at"])

        try:
            refresh.blacklist()
        except AttributeError:
            pass

        return Response(status=status.HTTP_204_NO_CONTENT)
