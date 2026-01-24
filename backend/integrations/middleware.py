"""
Middleware for logging inbound API requests authenticated via API keys.
"""
import json
import logging
import time

from django.utils.deprecation import MiddlewareMixin

logger = logging.getLogger(__name__)

MAX_PAYLOAD_SIZE = 65536  # 64KB


def truncate_payload(data, max_size=MAX_PAYLOAD_SIZE):
    """Truncate payload if too large. Returns (data, was_truncated)."""
    if data is None:
        return None, False
    try:
        serialized = json.dumps(data) if not isinstance(data, str) else data
        if len(serialized) > max_size:
            return {'_truncated': True, '_original_size': len(serialized)}, True
    except (TypeError, ValueError):
        pass
    return data, False


def sanitize_headers(headers):
    """Remove sensitive values from headers."""
    sensitive_keys = ['authorization', 'x-api-key', 'cookie', 'x-csrftoken']
    sanitized = {}
    for key, value in headers.items():
        if key.lower() in sensitive_keys:
            sanitized[key] = '[REDACTED]'
        else:
            sanitized[key] = str(value)
    return sanitized


class APIKeyRequestLoggingMiddleware(MiddlewareMixin):
    """
    Logs all inbound requests authenticated via API keys.

    Must be placed AFTER AuthenticationMiddleware in MIDDLEWARE settings
    since it checks request.auth for APIKey instances.
    """

    def process_request(self, request):
        """Store request start time and body."""
        request._api_log_start_time = time.time()
        # Store request body early since it can only be read once
        try:
            request._api_log_body = request.body
        except Exception:
            request._api_log_body = None

    def process_response(self, request, response):
        """Log the request if it was API key authenticated."""
        from core.models import APIKey
        from integrations.models import IntegrationRequestLog

        # Only log API key authenticated requests
        api_key = getattr(request, 'auth', None)
        if not isinstance(api_key, APIKey):
            return response

        # Calculate response time
        start_time = getattr(request, '_api_log_start_time', None)
        response_time_ms = None
        if start_time:
            response_time_ms = int((time.time() - start_time) * 1000)

        try:
            # Get request body
            raw_body = getattr(request, '_api_log_body', None)
            try:
                request_body = json.loads(raw_body) if raw_body else None
            except (json.JSONDecodeError, UnicodeDecodeError, TypeError):
                if raw_body:
                    request_body = {'_raw': raw_body.decode('utf-8', errors='replace')[:1000]}
                else:
                    request_body = None

            # Get response body
            try:
                if hasattr(response, 'data'):
                    response_body = response.data
                elif response.content:
                    response_body = json.loads(response.content)
                else:
                    response_body = None
            except (json.JSONDecodeError, UnicodeDecodeError, AttributeError):
                response_body = None

            # Truncate if needed
            request_body, req_truncated = truncate_payload(request_body)
            response_body, resp_truncated = truncate_payload(response_body)

            # Get headers
            request_headers = {}
            for key, value in request.META.items():
                if key.startswith('HTTP_'):
                    header_name = key[5:].replace('_', '-').title()
                    request_headers[header_name] = value

            # Determine success
            success = 200 <= response.status_code < 400

            IntegrationRequestLog.objects.create(
                tenant=api_key.tenant,
                direction='inbound',
                method=request.method,
                url=request.get_full_path(),
                request_headers=sanitize_headers(request_headers),
                request_body=request_body,
                request_body_truncated=req_truncated,
                response_status_code=response.status_code,
                response_body=response_body,
                response_body_truncated=resp_truncated,
                success=success,
                response_time_ms=response_time_ms,
                api_key=api_key,
                client_ip=self._get_client_ip(request),
                user_agent=request.META.get('HTTP_USER_AGENT', ''),
            )

        except Exception as e:
            logger.exception(f"Failed to log API request: {e}")

        return response

    def _get_client_ip(self, request):
        """Extract client IP from request."""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            return x_forwarded_for.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR')
