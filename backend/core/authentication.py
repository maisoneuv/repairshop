"""
API Key Authentication for Django REST Framework.

Allows external systems to authenticate using Bearer tokens in the format:
    Authorization: Bearer sk_live_abc123...

API keys are tenant-scoped and have role-based permissions.
"""
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from django.contrib.auth import get_user_model
from django.utils.translation import gettext_lazy as _

from core.models import APIKey

User = get_user_model()


class APIKeyAuthentication(BaseAuthentication):
    """
    API Key authentication for external systems.

    Checks for 'Authorization: Bearer <api-key>' header.
    Creates a virtual User object with API key's tenant and permissions.

    Usage in views:
        - request.user - Virtual user with API key's permissions
        - request.auth - The APIKey object
        - request.tenant - Set by middleware from API key's tenant
    """

    keyword = 'Bearer'

    def authenticate(self, request):
        """
        Authenticate the request using API key from Authorization header.

        Args:
            request: Django request object

        Returns:
            tuple: (user, api_key) if authenticated, None if no API key present

        Raises:
            AuthenticationFailed: If API key is invalid or expired
        """
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')

        if not auth_header:
            # No Authorization header - let other auth methods try
            return None

        auth_parts = auth_header.split()

        if len(auth_parts) != 2:
            # Invalid format - let other auth methods try
            return None

        if auth_parts[0] != self.keyword:
            # Not a Bearer token - let other auth methods try
            return None

        api_key_value = auth_parts[1]

        # Validate and authenticate
        return self.authenticate_credentials(api_key_value, request)

    def authenticate_credentials(self, key_value, request):
        """
        Validate the API key and return a virtual user.

        Args:
            key_value: The plaintext API key
            request: Django request object

        Returns:
            tuple: (user, api_key) if valid

        Raises:
            AuthenticationFailed: If key is invalid, expired, or inactive
        """
        # Extract prefix for efficient lookup (first 12 chars: 'sk_live_abcd')
        if len(key_value) < 12:
            raise AuthenticationFailed(_('Invalid API key format'))

        prefix = key_value[:12]

        # Look up API key by prefix first (indexed)
        api_keys = APIKey.objects.filter(
            prefix=prefix,
            is_active=True
        ).select_related('tenant', 'role')

        # Check each matching key (should only be one in practice)
        api_key = None
        for candidate in api_keys:
            if candidate.check_key(key_value):
                api_key = candidate
                break

        if not api_key:
            raise AuthenticationFailed(_('Invalid or inactive API key'))

        # Check if key is valid (not expired)
        if not api_key.is_valid():
            raise AuthenticationFailed(_('API key has expired'))

        # Get client IP for audit tracking
        ip_address = self.get_client_ip(request)

        # Update usage tracking (async-safe)
        api_key.update_usage(ip_address=ip_address)

        # Create virtual user with API key's permissions
        user = self.create_virtual_user(api_key)

        # Set tenant on request for middleware/views to use
        # This happens during DRF's authentication phase, before the view runs
        request.tenant = api_key.tenant

        # Return user and api_key (DRF will set request.user and request.auth)
        return (user, api_key)

    def create_virtual_user(self, api_key):
        """
        Create a virtual User object for the API key.

        This allows existing permission checks to work unchanged.
        The virtual user has the API key's tenant and role permissions.

        Args:
            api_key: APIKey instance

        Returns:
            User: Virtual user object (not saved to database)
        """
        # Create a virtual user (not saved to DB)
        user = User(
            email=f'api_key_{api_key.id}@system.local',
            username=f'api_key_{api_key.id}',
            is_active=True,
            is_staff=False,
            is_superuser=False,
        )

        # Set tenant from API key
        user.tenant = api_key.tenant

        # Mark as API key user for identification
        user.is_api_key_user = True
        user.api_key = api_key

        # Override has_permission to use API key's role
        user.has_permission = lambda perm, tenant: api_key.has_permission(perm, tenant)

        # User is already authenticated by default (is_authenticated is a read-only property)

        return user

    def get_client_ip(self, request):
        """
        Extract client IP address from request.

        Handles X-Forwarded-For header for proxied requests.

        Args:
            request: Django request object

        Returns:
            str: Client IP address or None
        """
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            # Get first IP in chain (client)
            ip = x_forwarded_for.split(',')[0].strip()
        else:
            ip = request.META.get('REMOTE_ADDR')

        return ip

    def authenticate_header(self, request):
        """
        Return a string to be used as the value of the WWW-Authenticate
        header in a 401 Unauthenticated response.
        """
        return self.keyword
