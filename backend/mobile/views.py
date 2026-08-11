"""Logowanie aplikacji mobilnej (par. 5.5 planu Caller ID).

Pracownik loguje sie raz przy wdrozeniu telefonu i wiecej nie wraca do tego
ekranu: token dostepu zyje kilkanascie minut, a token odswiezajacy pol roku
i rotuje sie przy kazdym uzyciu. Zuzyty token trafia na blackliste, wiec
przechwycenie starego nic nie daje.

Czego to pilnuje poza samym logowaniem:
- kazde zapytanie ma konkretnego autora, wiec wpisy w CRM maja autora,
  a zadania kontrolne w ogole daja sie utworzyc (v1 tego nie mial),
- da sie wylogowac pojedynczy telefon, nie unieważniajac dostepu calej zalodze,
- kazde urzadzenie zostawia slad: kto, jaki telefon, kiedy ostatnio widziany.
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

# Nazwa dodatkowego pola w tokenie. Dzieki niemu odswiezenie tokenu potrafi
# sprawdzic, czy telefon nie zostal w miedzyczasie zdalnie wylogowany.
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

        # Ta sama odpowiedz dla zlego hasla, nieznanego serwisu i konta z innego
        # serwisu - inaczej endpoint pozwalalby sprawdzac, ktore adresy istnieja.
        if tenant is None or user is None or not user.is_active:
            return Response({"detail": "Nieprawidlowe dane logowania."}, status=401)

        if user.tenant_id != tenant.id and not user.is_superuser:
            return Response({"detail": "Nieprawidlowe dane logowania."}, status=401)

        # Bez powiazanego pracownika nie da sie przypisac autora wpisom w CRM
        # ani utworzyc zadania kontrolnego po rozmowie. Lepiej zatrzymac sie
        # tutaj, z czytelnym komunikatem, niz pozniej wywrocic sie na zapisie.
        employee = Employee.objects.filter(user=user, tenant=tenant).first()
        if employee is None:
            return Response(
                {"detail": "To konto nie jest powiazane z pracownikiem tego serwisu."},
                status=403,
            )

        device, _created = MobileDevice.objects.get_or_create(
            tenant=tenant,
            employee=employee,
            label=data["device_label"],
        )
        # Ponowne zalogowanie na tym samym telefonie cofa wczesniejsze odwolanie.
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
    """POST /api/mobile/auth/refresh - rotuje token odswiezajacy."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = MobileRefreshSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            refresh = RefreshToken(serializer.validated_data["refresh"])
        except TokenError:
            return Response({"detail": "Token odswiezajacy jest nieważny."}, status=401)

        device_id = refresh.get(DEVICE_CLAIM)
        device = MobileDevice.objects.filter(pk=device_id).first() if device_id else None

        if device is None or not device.is_active:
            return Response(
                {"detail": "To urzadzenie zostalo wylogowane."}, status=401
            )

        new_tokens = {"access": str(refresh.access_token)}

        # Rotacja: stary token laduje na blacklistcie, telefon dostaje nowy.
        # Dzieki temu wykradziony refresh ma sens tylko do najblizszego uzycia
        # przez prawowitego wlasciciela.
        try:
            refresh.blacklist()
        except AttributeError:
            # Blacklista wymaga aplikacji token_blacklist; bez niej rotacja
            # nie ma jak dzialac i wolimy o tym wiedziec z logu.
            logger.warning("Blacklista tokenow nie jest wlaczona - brak rotacji")
        else:
            rotated = RefreshToken.for_user(device.employee.user)
            rotated[DEVICE_CLAIM] = device.id
            new_tokens["refresh"] = str(rotated)

        _touch(device)
        return Response(new_tokens)


class MobileLogoutView(APIView):
    """POST /api/mobile/auth/logout - wylogowuje to urzadzenie."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = MobileLogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            refresh = RefreshToken(serializer.validated_data["refresh"])
        except TokenError:
            return Response({"detail": "Token odswiezajacy jest nieważny."}, status=401)

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
