import logging
from rest_framework.views import exception_handler as drf_exception_handler
from rest_framework.response import Response

logger = logging.getLogger(__name__)


def json_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)

    if response is not None:
        return response

    # Nieobsłużony wyjątek (500) — loguj, zwróć generyczny JSON
    logger.error("Unhandled exception in API view", exc_info=exc)
    return Response({"detail": "Internal server error."}, status=500)
