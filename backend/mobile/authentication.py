"""Uwierzytelnianie JWT dla aplikacji mobilnej, wiazace tenanta z kontem.

`TenantMiddleware` dziala przed uwierzytelnieniem DRF, wiec przy tokenie JWT
uzytkownik jest w tym momencie jeszcze anonimowy i serwis zostalby ustalony
z naglowka `X-Tenant`. Telefon z tokenem jednego serwisu moglby wtedy czytac
kartoteki drugiego.

Dlatego zaraz po uwierzytelnieniu nadpisujemy `request.tenant` wartoscia
z konta pracownika - naglowek nie ma w tej sciezce znaczenia.
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
            # Piszemy do opakowanego HttpRequest, bo to jego czyta middleware
            # i widoki (DRF proxuje dostep do atrybutow).
            request._request.tenant = tenant

        return user, validated_token
