import logging
from django.db.models import ProtectedError
from rest_framework.views import exception_handler as drf_exception_handler
from rest_framework.response import Response

logger = logging.getLogger(__name__)


def json_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)

    if response is not None:
        return response

    # Delete blocked by an on_delete=PROTECT relation — return a clean 409
    # instead of a 500 so the client can tell the user to remove/reassign the
    # dependent records first (e.g. deleting an employee who still owns tasks).
    if isinstance(exc, ProtectedError):
        logger.warning("Blocked delete due to protected references: %s", exc)
        return Response(
            {"detail": (
                "This record can't be deleted because other records still "
                "reference it. Reassign or remove those first."
            )},
            status=409,
        )

    # Nieobsłużony wyjątek (500) — loguj, zwróć generyczny JSON
    logger.error("Unhandled exception in API view", exc_info=exc)
    return Response({"detail": "Internal server error."}, status=500)
