"""Uwierzytelnianie JWT dla aplikacji mobilnej, wiazace tenanta z kontem.

`TenantMiddleware` dziala jako middleware Django, czyli **przed** tym, jak DRF
uwierzytelni zadanie. Przy logowaniu sesja jest juz rozwiazana, wiec middleware
widzi uzytkownika i przypina jego serwis. Przy tokenie JWT jest inaczej:
w momencie dzialania middleware uzytkownik jest jeszcze anonimowy, wiec serwis
zostalby wziety z naglowka `X-Tenant`.

To bylby problem: telefon z tokenem serwisu A moglby podac `X-Tenant: B`
i czytac kartoteki klientow serwisu B. Dlatego zaraz po uwierzytelnieniu
nadpisujemy `request.tenant` wartoscia z konta pracownika - naglowek przestaje
mieć w tej sciezce jakiekolwiek znaczenie.
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
