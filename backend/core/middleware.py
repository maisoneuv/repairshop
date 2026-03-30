from datetime import timedelta
from django.utils.timezone import now


class UpdateLastActivityMiddleware:
    """Update User.last_activity_at on every authenticated request.
    Throttled to once per 5 minutes to avoid a DB write on every request."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.user.is_authenticated:
            last = request.user.last_activity_at
            if not last or now() - last > timedelta(minutes=5):
                request.user.__class__.objects.filter(
                    pk=request.user.pk
                ).update(last_activity_at=now())
        return response
