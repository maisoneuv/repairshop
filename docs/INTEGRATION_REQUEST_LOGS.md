# Integration Request Logging

Complete audit trail for all integration HTTP requests - both inbound (external systems calling your API) and outbound (webhooks you send to external systems).

## Overview

The `IntegrationRequestLog` model provides:

- **Full request/response capture**: Headers, body, status code
- **Timing data**: Response time in milliseconds
- **Direction tracking**: Inbound vs outbound requests
- **Relationship tracking**: Links to API keys, integrations, and sync records
- **Automatic logging**: No code changes needed for existing integrations

## Viewing Logs

### Django Admin

1. Go to `http://localhost:8000/admin/`
2. Navigate to **Integrations → Integration Request Logs**
3. Use filters to narrow down:
   - **Direction**: Inbound or Outbound
   - **Success**: Successful or failed requests
   - **Method**: GET, POST, etc.
   - **Tenant**: Filter by tenant
   - **Date**: Filter by timestamp

### Log Entry Details

Each log entry contains:

| Field | Description |
|-------|-------------|
| `timestamp` | When the request occurred |
| `direction` | `inbound` (API calls to us) or `outbound` (webhooks we send) |
| `method` | HTTP method (GET, POST, PUT, DELETE) |
| `url` | Full URL for outbound, endpoint path for inbound |
| `response_status_code` | HTTP status code (200, 404, 500, etc.) |
| `response_time_ms` | How long the request took in milliseconds |
| `success` | Whether the request succeeded |
| `request_headers` | HTTP headers (sensitive values redacted) |
| `request_body` | Request payload (truncated if >64KB) |
| `response_body` | Response payload (truncated if >64KB) |
| `error_message` | Error details if request failed |

### Relationships

**For outbound requests:**
- `integration` - Which TenantIntegration triggered this
- `integration_sync` - The IntegrationSync record for this webhook
- `retry_number` - Which retry attempt (0 = first attempt)

**For inbound requests:**
- `api_key` - Which API key was used for authentication
- `client_ip` - IP address of the caller
- `user_agent` - User-Agent header from the request

## How It Works

### Outbound Logging (Webhooks)

When webhooks are sent via Celery tasks, every HTTP request is automatically logged:

```
WorkItem Created
    ↓
Django Signal triggers Celery task
    ↓
send_integration_webhook task runs
    ↓
HTTP request to external system
    ↓
IntegrationRequestLog created with:
  - Request payload
  - Response data
  - Status code
  - Timing
  - Retry number
```

Both successful and failed requests are logged, including:
- Connection timeouts
- HTTP errors (4xx, 5xx)
- Network failures

### Inbound Logging (API Calls)

All requests authenticated with API keys are automatically logged via middleware:

```
External System
    ↓
API call with Bearer token
    ↓
APIKeyRequestLoggingMiddleware
    ↓
Request processed by Django REST Framework
    ↓
IntegrationRequestLog created with:
  - Endpoint called
  - Request/response bodies
  - Status code
  - Client IP
  - API key used
```

**Note:** Only API key-authenticated requests are logged. Session-based requests from the frontend are not logged.

## Data Retention

### Manual Cleanup

Use the management command to clean up old logs:

```bash
# Preview what would be deleted (dry run)
cd backend
python manage.py cleanup_integration_logs --dry-run

# Delete logs with default retention (30 days success, 90 days failed)
python manage.py cleanup_integration_logs

# Custom retention periods
python manage.py cleanup_integration_logs --success-days=14 --failed-days=60
```

### Automatic Cleanup (Celery Beat)

Schedule the cleanup task to run automatically. Add to your Celery Beat schedule:

```python
# In your celery.py or settings.py
CELERY_BEAT_SCHEDULE = {
    'cleanup-integration-logs-daily': {
        'task': 'integrations.tasks.cleanup_old_integration_logs',
        'schedule': crontab(hour=3, minute=0),  # Run daily at 3 AM
        'kwargs': {'success_days': 30, 'failed_days': 90},
    },
}
```

Then run Celery Beat:

```bash
celery -A app beat --loglevel=info
```

## Payload Handling

### Large Payloads

Payloads larger than 64KB are automatically truncated to prevent database bloat:

```json
{
  "_truncated": true,
  "_original_size": 128000
}
```

The `request_body_truncated` and `response_body_truncated` boolean fields indicate when truncation occurred.

### Sensitive Data

The following headers are automatically redacted:
- `Authorization`
- `X-API-Key`
- `API-Key`
- `X-Auth-Token`
- `Cookie`
- `X-CSRFToken`

These appear as `[REDACTED]` in the logs.

## Querying Logs Programmatically

### Django ORM Examples

```python
from integrations.models import IntegrationRequestLog
from django.utils import timezone
from datetime import timedelta

# Get all failed outbound requests in the last 24 hours
failed_webhooks = IntegrationRequestLog.objects.filter(
    direction='outbound',
    success=False,
    timestamp__gte=timezone.now() - timedelta(hours=24)
)

# Get all requests for a specific API key
api_key_requests = IntegrationRequestLog.objects.filter(
    api_key_id=123
).order_by('-timestamp')

# Get slow requests (>5 seconds)
slow_requests = IntegrationRequestLog.objects.filter(
    response_time_ms__gt=5000
)

# Get requests for a specific integration
integration_logs = IntegrationRequestLog.objects.filter(
    integration__name='n8n - New WorkItems'
)

# Count requests by status code
from django.db.models import Count
status_counts = IntegrationRequestLog.objects.values(
    'response_status_code'
).annotate(count=Count('id'))
```

### Finding Related Logs

```python
# From an IntegrationSync, find all HTTP attempts
sync = IntegrationSync.objects.get(id=123)
http_logs = sync.request_logs.all()

# From an API key, see all requests made with it
from core.models import APIKey
api_key = APIKey.objects.get(id=456)
requests = api_key.request_logs.order_by('-timestamp')[:100]
```

## Troubleshooting

### Logs Not Appearing for Inbound Requests

1. Verify the middleware is registered in `settings.py`:
   ```python
   MIDDLEWARE = [
       # ... other middleware ...
       'django.contrib.auth.middleware.AuthenticationMiddleware',
       'integrations.middleware.APIKeyRequestLoggingMiddleware',  # Must be after AuthenticationMiddleware
       # ...
   ]
   ```

2. Ensure requests use API key authentication (Bearer token), not session auth

3. Check for errors in the Django logs

### Logs Not Appearing for Outbound Requests

1. Verify Celery worker is running:
   ```bash
   celery -A app worker --loglevel=info
   ```

2. Check that integrations are active in Django admin

3. Look for errors in the Celery worker output

### Payload Shows as Truncated

This is expected for large payloads (>64KB). The original size is recorded in `_original_size`. If you need full payloads, you can increase `MAX_PAYLOAD_SIZE` in:
- `backend/integrations/tasks.py` (for outbound)
- `backend/integrations/middleware.py` (for inbound)

## Performance Considerations

- Logs are stored in PostgreSQL with indexes on commonly queried fields
- Large payloads are truncated to prevent database bloat
- Cleanup tasks prevent unbounded growth
- Consider running cleanup more frequently for high-volume systems

## Related Documentation

- [Integration Setup](INTEGRATION_SETUP.md) - Setting up integrations
- [API Keys](API_KEYS.md) - API key authentication
- [Monitoring Integrations](MONITORING_INTEGRATIONS.md) - Monitoring and debugging
