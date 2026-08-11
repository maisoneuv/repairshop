"""Walidacja danych logowania z aplikacji mobilnej."""

from rest_framework import serializers


class MobileLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    tenant = serializers.CharField(
        help_text="Subdomena serwisu, do ktorego loguje sie pracownik."
    )
    device_label = serializers.CharField(
        max_length=120,
        help_text="Nazwa telefonu widoczna pozniej w panelu, np. 'Pixel - przyjecie'.",
    )


class MobileRefreshSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class MobileLogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()
