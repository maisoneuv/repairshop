"""JWT authentication for the mobile app, binding the tenant to the account.

`TenantMiddleware` runs before DRF authentication, so with a JWT the user is
still anonymous at that point and the tenant would be taken from the
`X-Tenant` header. A phone holding one shop's token could then read another
shop's records.

We therefore overwrite `request.tenant` with the employee's own tenant right
after authentication - the header carries no weight on this path.
"""

from rest_framework_simplejwt.authentication import JWTAuthentication


class MobileJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None

        user, validated_token = result
        tenant = getattr(user, "tenant", None)
        if tenant is not None:
            # Write to the wrapped HttpRequest, since that is what middleware
            # and views read (DRF proxies attribute access to it).
            request._request.tenant = tenant

        return user, validated_token
