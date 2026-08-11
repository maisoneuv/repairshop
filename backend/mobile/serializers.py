"""Validation of sign-in payloads coming from the mobile app."""

from rest_framework import serializers


class MobileLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    tenant = serializers.CharField(
        help_text="Subdomain of the shop the employee is signing in to."
    )
    device_label = serializers.CharField(
        max_length=120,
        help_text="Phone name shown later in the admin panel, e.g. 'Pixel - front desk'.",
    )


class MobileRefreshSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class MobileLogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()
