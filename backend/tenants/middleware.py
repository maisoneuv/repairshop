# tenants/middleware.py
from django.http import HttpResponseBadRequest
from tenants.models import Tenant

EXEMPT_PATH_PREFIXES = [
    '/admin/',
    '/static/',
    '/media/',
    '/favicon.ico',
]

def get_subdomain(request):
    host = request.get_host().split(':')[0]
    parts = host.split('.')
    if len(parts) >= 3:
        print(parts[0])
        return parts[0]  # tenant.example.com
    return None  # e.g. localhost, IP-based dev

class TenantMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        print(f"TenantMiddleware: X-Tenant={request.headers.get('X-Tenant')}, host={request.get_host()}")

        #todo delete later!
        if request.path == "/core/login/":
            return self.get_response(request)

        if any(request.path.startswith(prefix) for prefix in EXEMPT_PATH_PREFIXES):
            request.tenant = None
            return self.get_response(request)

        tenant_key = (
            request.headers.get("X-Tenant") or
            get_subdomain(request)
        )

        if tenant_key:
            print(f'tenant:{0}',tenant_key)
            try:
                tenant = Tenant.objects.get(subdomain=tenant_key)
                request.tenant = tenant
            except Tenant.DoesNotExist:
                return HttpResponseBadRequest("Invalid tenant.")
        else:
            request.tenant = None  # ← allow superuser usage!

        return self.get_response(request)
