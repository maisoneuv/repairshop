# Integration System Documentation

## Overview

This integration system provides an event-driven architecture for automatically triggering external integrations (n8n, Notion, Slack, etc.) when certain events occur in the system, such as WorkItem creation or status changes.

### Key Features

- **Event-Driven**: Uses Django signals to listen for model events
- **Transaction Safety**: Uses `transaction.on_commit()` to ensure external systems are only called after successful database commits
- **Background Processing**: All API calls are handled asynchronously via Celery tasks
- **Idempotency**: Prevents duplicate syncs using the IntegrationSync model
- **Audit Trail**: System notes are automatically created for successful/failed syncs
- **Retry Logic**: Automatic retries with exponential backoff for failed integrations
- **Multi-Tenant**: Each tenant can have their own integration configurations

## Architecture

### Components

1. **Models** ([integrations/models.py](integrations/models.py))
   - `TenantIntegration`: Stores per-tenant integration configurations
   - `IntegrationSync`: Tracks sync status and provides audit trail

2. **Signals** ([integrations/signals/workitem.py](integrations/signals/workitem.py))
   - Listen for WorkItem events (creation, status changes)
   - Organized per model (similar to Salesforce TriggerHandler pattern)

3. **Celery Tasks** ([integrations/tasks.py](integrations/tasks.py))
   - `send_integration_webhook`: Sends data to external webhooks
   - `retry_failed_syncs`: Periodic task to retry failed syncs

4. **Admin Interface** ([integrations/admin.py](integrations/admin.py))
   - Manage integrations and view sync history

## Setup Instructions

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

This will install:
- `celery==5.4.0`
- `redis==5.2.0`

### 2. Install and Start Redis

**macOS (using Homebrew):**
```bash
brew install redis
brew services start redis
```

**Linux:**
```bash
sudo apt-get install redis-server
sudo systemctl start redis
```

**Docker:**
```bash
docker run -d -p 6379:6379 redis:7-alpine
```

Verify Redis is running:
```bash
redis-cli ping
# Should return: PONG
```

### 3. Run Database Migrations

```bash
cd backend
python manage.py migrate
```

This creates the `TenantIntegration` and `IntegrationSync` tables.

### 4. Start the Celery Worker

In a separate terminal window:

```bash
cd backend
celery -A app worker --loglevel=info
```

You should see output like:
```
[tasks]
  . integrations.tasks.retry_failed_syncs
  . integrations.tasks.send_integration_webhook
```

### 5. (Optional) Start Celery Beat for Periodic Tasks

For automatic retry of failed syncs:

```bash
cd backend
celery -A app beat --loglevel=info
```

## Usage

### Configure an Integration

1. Access the Django admin at `http://localhost:8000/admin/`
2. Navigate to **Integrations → Tenant Integrations**
3. Click **Add Tenant Integration**
4. Fill in the form:
   - **Tenant**: Select the tenant
   - **Name**: Friendly name (e.g., "Production n8n Workflow")
   - **Integration Type**: Choose "n8n Webhook"
   - **Event Type**: Choose "workitem_created", "workitem_status_changed", or "workitem_updated"
   - **Webhook URL**: Your n8n webhook URL (e.g., `https://your-n8n.com/webhook/xyz`)
   - **Is Active**: Check to enable
   - **Headers**: Add authentication headers (see [Authentication](#authentication) below)

### Authentication

**⚠️ Always secure your webhooks with authentication!**

Without authentication, anyone who discovers your webhook URL can send fake data to your integrations.

#### Recommended: Header Authentication

Add a custom header with a secret token:

**Step 1: Generate a secret token**
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

**Step 2: Configure in n8n**
1. Create "Header Auth" credential
2. Header Name: `X-API-Key`
3. Header Value: `your-generated-token`
4. Assign to Webhook node

**Step 3: Configure in Django (TenantIntegration → Headers)**
```json
{
  "X-API-Key": "your-generated-token"
}
```

#### Alternative: Basic Authentication

**Step 1: Choose username and password**

**Step 2: Configure in n8n**
1. Create "Basic Auth" credential
2. Username: `django-integration`
3. Password: `your-secure-password`
4. Assign to Webhook node

**Step 3: Encode credentials**
```bash
echo -n "django-integration:your-secure-password" | base64
```

**Step 4: Configure in Django (TenantIntegration → Headers)**
```json
{
  "Authorization": "Basic ZGphbmdvLWludGVncmF0aW9uOnlvdXItc2VjdXJlLXBhc3N3b3Jk"
}
```

#### Other Authentication Methods

See the complete authentication guide: [N8N_AUTHENTICATION.md](../../docs/N8N_AUTHENTICATION.md)

Options include:
- Header Authentication (recommended) ⭐
- Basic Authentication
- HMAC Signature Verification (most secure)

**Security Best Practices:**
- ✅ Always use HTTPS for webhook URLs
- ✅ Use strong, randomly generated secrets
- ✅ Rotate credentials every 90 days
- ✅ Never commit secrets to version control
- ✅ Use different credentials for dev/staging/production

### Test the Integration

1. Create a new WorkItem (or update an existing one's status)
2. Check the Celery worker logs to see the webhook being sent
3. In Django admin, navigate to **Integrations → Integration Syncs** to view the sync history
4. Check the WorkItem's notes for sync status messages

### Monitor Integration Syncs

The **Integration Syncs** admin page shows:
- ✓ **Synced**: Successfully sent to external system
- ⚠ **Pending**: Queued but not yet processed
- ✗ **Failed**: Failed after retries

Failed syncs include error messages for troubleshooting.

## Webhook Payload Structure

When a WorkItem event occurs, the following JSON payload is sent to the configured webhook:

```json
{
  "event_type": "workitem_created",
  "timestamp": "2025-11-05T20:30:00Z",
  "tenant": {
    "id": 1,
    "name": "Acme Corp"
  },
  "workitem": {
    "id": 123,
    "reference_id": "RMA-123",
    "description": "iPhone screen repair",
    "status": "New",
    "type": "Chargeable Repair",
    "priority": "Standard",
    "created_date": "2025-11-05T20:30:00Z",
    "due_date": "2025-11-08T20:30:00Z",
    "customer": {
      "id": 45,
      "name": "John Doe",
      "email": "john@example.com"
    },
    "owner": {
      "id": 10,
      "name": "Jane Smith"
    },
    "technician": {
      "id": 12,
      "name": "Bob Tech"
    },
    "customer_asset": {
      "id": 67,
      "name": "iPhone 13 Pro"
    },
    "estimated_price": "150.00",
    "final_price": null,
    "dropoff_point": {
      "id": 5,
      "name": "Main Store"
    },
    "intake_method": "walk_in",
    "comments": "Customer reported cracked screen"
  }
}
```

For `workitem_status_changed` events, an additional `changes` field is included:

```json
{
  "changes": {
    "status": {
      "old": "New",
      "new": "In Progress"
    }
  }
}
```

## n8n Configuration

For detailed n8n webhook setup instructions, see:
- **[N8N_WEBHOOK_SETUP.md](../../docs/N8N_WEBHOOK_SETUP.md)** - Complete n8n configuration guide
- **[N8N_AUTHENTICATION.md](../../docs/N8N_AUTHENTICATION.md)** - Authentication methods and security

### Quick n8n Setup

1. Create a new workflow in n8n
2. Add a **Webhook** node
3. Configure:
   - HTTP Method: `POST`
   - Path: `workitem-webhook` (or custom)
   - Authentication: Header Auth or Basic Auth
4. Copy the webhook URL
5. Configure in Django admin (see above)

### Example n8n Workflow

1. In n8n, create a new workflow
2. Add a **Webhook** trigger node
   - Set **HTTP Method**: POST
   - Set **Path**: Something like `/workitem-webhook`
   - Copy the webhook URL
3. Add processing nodes (e.g., send Slack message, create Notion page, etc.)
4. Add the webhook URL to your TenantIntegration in Django admin

### Example n8n Processing

```javascript
// In an n8n Function node, you can access the webhook data:
const eventType = $json.event_type;
const workitem = $json.workitem;
const tenant = $json.tenant;

// Build a Slack message
return {
  text: `New WorkItem Created: ${workitem.reference_id}`,
  blocks: [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${workitem.reference_id}* - ${workitem.description}`
      }
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Status:*\n${workitem.status}` },
        { type: "mrkdwn", text: `*Customer:*\n${workitem.customer.name}` }
      ]
    }
  ]
};
```

## Advanced Features

### Adding New Event Types

1. Add the event type to `TenantIntegration.EVENT_TYPES` in [models.py](integrations/models.py:24-29)
2. Create or update the signal handler to trigger the new event
3. Update the payload builder to include relevant data

### Adding Integration for Other Models

To add integrations for other models (e.g., Task, Customer):

1. Create a new signal file: `integrations/signals/task.py`
2. Follow the same pattern as [workitem.py](integrations/signals/workitem.py)
3. Import the new signals in `integrations/signals/__init__.py`

Example for Task model:

```python
# integrations/signals/task.py
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.db import transaction
from tasks.models import Task

@receiver(post_save, sender=Task)
def task_post_save(sender, instance, created, **kwargs):
    if created:
        event_type = 'task_created'
        transaction.on_commit(
            lambda: trigger_task_integrations(instance, event_type)
        )
```

### Customizing Retry Behavior

Edit [tasks.py:20-26](integrations/tasks.py:20-26):

```python
@shared_task(
    bind=True,
    autoretry_for=(requests.RequestException,),
    retry_kwargs={'max_retries': 5, 'countdown': 120},  # 5 retries, 2 min wait
    retry_backoff=True,
    retry_jitter=True,
)
```

### Environment Variables

You can customize Celery/Redis configuration via environment variables:

```bash
# .env file
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
```

## Troubleshooting

### Issue: Celery worker not processing tasks

**Solution:**
- Ensure Redis is running: `redis-cli ping`
- Check Celery worker is running: `celery -A app worker --loglevel=info`
- Check for errors in Celery logs

### Issue: Webhooks not being sent

**Solution:**
- Verify the integration is **Active** in Django admin
- Check the WorkItem's tenant matches the integration's tenant
- Look for errors in IntegrationSync records in admin
- Check Celery worker logs for error messages

### Issue: "Connection refused" errors

**Solution:**
- Verify the webhook URL is correct and accessible
- Test the URL manually with `curl`:
  ```bash
  curl -X POST https://your-webhook-url \
    -H "Content-Type: application/json" \
    -d '{"test": "data"}'
  ```

### Issue: Duplicate syncs

**Solution:**
- The system prevents duplicates using the unique constraint on IntegrationSync
- If you see duplicates, check that the `unique_together` constraint is in place

### Issue: Failed syncs not retrying

**Solution:**
- Ensure Celery Beat is running for periodic retries
- Manually trigger retry: Admin → Integration Syncs → Select failed syncs → (add action if needed)
- Or run: `python manage.py shell` then:
  ```python
  from integrations.tasks import retry_failed_syncs
  retry_failed_syncs.delay()
  ```

## Development Commands

### View Celery Task Status

```bash
# List active tasks
celery -A app inspect active

# List scheduled tasks
celery -A app inspect scheduled

# List registered tasks
celery -A app inspect registered
```

### Purge All Celery Tasks

```bash
celery -A app purge
```

### Django Shell Examples

```python
# Get all active integrations for a tenant
from integrations.models import TenantIntegration
from tenants.models import Tenant

tenant = Tenant.objects.get(name="MyTenant")
integrations = TenantIntegration.objects.filter(tenant=tenant, is_active=True)

# View recent sync history
from integrations.models import IntegrationSync
recent_syncs = IntegrationSync.objects.all()[:10]
for sync in recent_syncs:
    print(f"{sync.integration.name}: {sync.status} - {sync.last_error or 'No errors'}")

# Manually trigger a sync for testing
from integrations.tasks import send_integration_webhook
from django.contrib.contenttypes.models import ContentType
from tasks.models import WorkItem

workitem = WorkItem.objects.first()
ct = ContentType.objects.get_for_model(WorkItem)
integration = TenantIntegration.objects.filter(event_type='workitem_created').first()

send_integration_webhook.delay(
    integration_id=integration.id,
    content_type_id=ct.id,
    object_id=workitem.id,
    event_type='workitem_created',
    payload={'test': 'data'}
)
```

## Security Considerations

1. **Webhook URLs**: Keep webhook URLs secret (they often contain authentication tokens)
2. **Headers**: Store sensitive tokens in the `headers` JSON field, not in the URL
3. **HTTPS**: Always use HTTPS for webhook URLs in production
4. **Validation**: Consider adding webhook signature validation if supported by the external service
5. **Rate Limiting**: Monitor external API rate limits and adjust retry behavior accordingly

## Performance Optimization

1. **Redis Connection Pooling**: Already configured in settings
2. **Task Timeout**: Set appropriate `task_time_limit` in settings (default: 30 minutes)
3. **Concurrency**: Scale Celery workers as needed:
   ```bash
   celery -A app worker --concurrency=10
   ```
4. **Database Indexes**: Already added to models for optimal query performance

## License

This integration system is part of the Fixed Service application.
