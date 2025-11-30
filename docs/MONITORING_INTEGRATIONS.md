# How to Monitor Integration Events

This guide shows you how to track if integrations are being triggered and debug issues.

## 🔍 Quick Diagnosis Checklist

When you update a WorkItem and don't see webhook activity, check these in order:

### 1. Is the Event Configured Correctly?

Your integration's **Event Type** must match what actually triggers:

**Currently Supported Events:**
- ✅ **WorkItem Created** (`workitem_created`) - Triggers when a **new** WorkItem is created
- ✅ **WorkItem Status Changed** (`workitem_status_changed`) - Triggers when the **status field** changes
- ✅ **WorkItem Updated** (`workitem_updated`) - Triggers when **ANY field** changes (description, customer, prices, etc.)

**Your Screenshot Shows:** Event type = "WorkItem Updated" ✅ **NOW SUPPORTED!**

**How to Test:**
1. Keep your integration as "WorkItem Updated"
2. Open an existing WorkItem
3. Change ANY field (description, customer, due date, etc.)
4. Save
5. Check Celery logs and Integration Syncs

**Note:** If status changes, BOTH events will fire:
- `workitem_status_changed`
- `workitem_updated`

### 2. Check Docker Logs

#### View Celery Worker Logs
```bash
docker-compose logs -f celery_worker
```

**What to look for:**
- ✅ Task received: `Task integrations.tasks.send_integration_webhook[...]`
- ✅ Webhook sending: `Sending webhook to work-items-n8n for WorkItem:XXX`
- ✅ Success: `Successfully synced WorkItem:XXX`
- ❌ Error: Look for Python tracebacks or HTTP errors

#### View Django Web Logs
```bash
docker-compose logs -f web
```

**What to look for:**
- ✅ Signal triggered: `Triggering X integration(s) for WorkItem`
- ❌ No integrations found: `No active integrations found for tenant`

### 3. Check Integration Sync Records (Django Admin)

1. Go to `http://localhost:8008/admin/`
2. Navigate to **Integrations → Integration Syncs**
3. Look for recent records for your WorkItem

**Sync Status Meanings:**
- 🟢 **Synced** - Successfully sent to n8n, response received
- 🟠 **Pending** - Queued but not yet processed
- 🔴 **Failed** - Error occurred (check `last_error` field)

**What to check:**
- **Request payload** - What was sent to n8n
- **Response data** - What n8n returned
- **Last error** - Error message if failed
- **Retry count** - How many times it's been retried

### 4. Check WorkItem Notes

1. Open the WorkItem in Django admin
2. Scroll to the **Notes** section
3. Look for system notes (author = None)

**System notes you should see:**
- ✅ `✓ Integration sync successful: work-items-n8n (workitem_created)`
- ❌ `✗ Integration sync failed after 3 attempts: work-items-n8n - [error]`

### 5. Verify Integration is Active

```bash
docker-compose exec web python manage.py shell
```

```python
from integrations.models import TenantIntegration
from tenants.models import Tenant

# Get your tenant
tenant = Tenant.objects.get(name="repairhero")

# Check active integrations
integrations = TenantIntegration.objects.filter(
    tenant=tenant,
    is_active=True
)

for integration in integrations:
    print(f"Name: {integration.name}")
    print(f"Type: {integration.integration_type}")
    print(f"Event: {integration.event_type}")
    print(f"URL: {integration.webhook_url}")
    print(f"Active: {integration.is_active}")
    print("---")
```

### 6. Check Redis Connection

```bash
docker-compose exec redis redis-cli ping
# Should return: PONG
```

If Redis is down, Celery can't queue tasks.

### 7. Check Celery is Processing Tasks

```bash
docker-compose exec celery_worker celery -A app inspect active
```

**Should show:**
- Empty list if idle: `{}`
- Active tasks if processing: `{"celery@xxx": [...]}`

## 🧪 Testing Step-by-Step

### Test 1: Create a New WorkItem (workitem_created)

1. **Change your integration event type** to "WorkItem Created"
2. **Save** the integration
3. **Create a new WorkItem** via admin or frontend
4. **Immediately check Celery logs:**
   ```bash
   docker-compose logs -f celery_worker
   ```
5. **Check Integration Syncs** in admin
6. **Check WorkItem Notes**

**Expected Celery Log Output:**
```
[INFO] Triggering 1 integration(s) for WorkItem RMA-123 (workitem_created)
[INFO] Enqueued webhook task for integration work-items-n8n
[INFO] Task integrations.tasks.send_integration_webhook[...] received
[INFO] Sending webhook to work-items-n8n for WorkItem:123 (attempt 1)
[INFO] Successfully synced WorkItem:123 to work-items-n8n
```

### Test 2: Change WorkItem Status (workitem_status_changed)

1. **Change your integration event type** to "WorkItem Status Changed"
2. **Save** the integration
3. **Open an existing WorkItem**
4. **Change the status** (e.g., from "New" to "In Progress")
5. **Save** the WorkItem
6. **Check Celery logs, Integration Syncs, and WorkItem Notes**

**Expected Celery Log Output:**
```
[INFO] WorkItem RMA-123 status changed from New to In Progress, will trigger integration
[INFO] Triggering 1 integration(s) for WorkItem RMA-123 (workitem_status_changed)
[INFO] Sending webhook to work-items-n8n for WorkItem:123 (attempt 1)
[INFO] Successfully synced WorkItem:123 to work-items-n8n
```

## 🐛 Common Issues & Solutions

### Issue 1: "No active integrations found"

**Cause:** Event type doesn't match or integration is inactive

**Check:**
```bash
docker-compose exec web python manage.py shell
```
```python
from integrations.models import TenantIntegration
TenantIntegration.objects.filter(
    event_type='workitem_updated',  # Check your event type
    is_active=True
)
# Should return your integration
```

**Solution:**
- Verify event type matches one of: `workitem_created`, `workitem_status_changed`
- Ensure "Is active" checkbox is checked in admin

### Issue 2: Celery logs show nothing

**Cause:** Celery worker not running or signals not firing

**Check:**
```bash
docker-compose ps celery_worker
# Should show "Up"

docker-compose logs celery_worker | grep "celery@"
# Should show "celery@xxx ready"
```

**Solution:**
```bash
docker-compose restart celery_worker
docker-compose logs -f celery_worker
```

### Issue 3: Webhook fails with connection error

**Cause:** n8n URL is unreachable from Docker container

**Check Integration Sync:**
- Look at `last_error` field
- Common errors:
  - `Connection refused` - n8n not running
  - `Name or service not known` - Invalid URL
  - `Timeout` - n8n is slow or down

**Solution:**
- Test the webhook URL manually:
  ```bash
  curl -X POST "https://n8n.serwisfixed.pl/webhook-test/6f02502e-021d-405d-9563-f43e4ad7df86" \
    -H "Content-Type: application/json" \
    -d '{"test": "data"}'
  ```
- If using `localhost` in URL, change to your machine's IP or a public URL
- From inside Docker, `localhost` refers to the container, not your host machine

### Issue 4: Task queued but never processed

**Cause:** Celery worker crashed or stuck

**Check:**
```bash
docker-compose logs celery_worker | tail -50
```

**Solution:**
```bash
docker-compose restart celery_worker
```

### Issue 5: "WorkItem Updated" doesn't trigger

**Cause:** Code not yet deployed to Docker

**Solution:**
```bash
# Rebuild Docker images with the updated signal handler
docker-compose up -d --build

# Restart Celery worker
docker-compose restart celery_worker
```

### Test 3: Update Any WorkItem Field (workitem_updated)

1. **Keep your integration event type** as "WorkItem Updated"
2. **Open an existing WorkItem**
3. **Change ANY field** (description, comments, due date, customer, etc.)
4. **Save** the WorkItem
5. **Check Celery logs, Integration Syncs, and WorkItem Notes**

**Expected Celery Log Output:**
```
[INFO] WorkItem RMA-123 updated, will trigger integration
[INFO] Triggering 1 integration(s) for WorkItem RMA-123 (workitem_updated)
[INFO] Sending webhook to work-items-n8n for WorkItem:123 (attempt 1)
[INFO] Successfully synced WorkItem:123 to work-items-n8n
```

**Note:** If you change the status field, you'll get BOTH events:
- `workitem_status_changed`
- `workitem_updated`

## 📊 Advanced Monitoring

### View All Integration Activity

```bash
docker-compose exec web python manage.py shell
```

```python
from integrations.models import IntegrationSync
from django.db.models import Count

# Count by status
IntegrationSync.objects.values('status').annotate(count=Count('id'))

# Recent syncs
for sync in IntegrationSync.objects.all()[:10]:
    print(f"{sync.created_at} | {sync.integration.name} | {sync.status} | {sync.event_type}")
    if sync.last_error:
        print(f"  Error: {sync.last_error}")

# Failed syncs
failed = IntegrationSync.objects.filter(status='failed')
print(f"\nFailed syncs: {failed.count()}")
for sync in failed:
    print(f"  {sync.integration.name}: {sync.last_error}")
```

### View n8n Response Data

```python
from integrations.models import IntegrationSync

# Get a successful sync
sync = IntegrationSync.objects.filter(status='synced').first()

# View what was sent
print("Request:")
print(sync.request_payload)

# View n8n's response
print("\nResponse:")
print(sync.response_data)
```

### Monitor Celery Tasks in Real-Time

```bash
# Active tasks
docker-compose exec celery_worker celery -A app inspect active

# Scheduled tasks
docker-compose exec celery_worker celery -A app inspect scheduled

# Registered tasks
docker-compose exec celery_worker celery -A app inspect registered

# Worker stats
docker-compose exec celery_worker celery -A app inspect stats
```

### Enable Debug Logging

Temporarily increase log verbosity:

```bash
docker-compose exec celery_worker celery -A app worker --loglevel=debug
```

Or update `docker-compose.yml`:
```yaml
celery_worker:
  command: celery -A app worker --loglevel=debug
```

Then restart:
```bash
docker-compose restart celery_worker
```

## 📝 Monitoring Checklist

When debugging integration issues, check in this order:

- [ ] Event type matches an implemented event (`workitem_created` or `workitem_status_changed`)
- [ ] Integration is active (checkbox in admin)
- [ ] Integration matches the WorkItem's tenant
- [ ] Redis is running (`docker-compose ps redis`)
- [ ] Celery worker is running (`docker-compose ps celery_worker`)
- [ ] Celery logs show task received
- [ ] IntegrationSync record exists in database
- [ ] IntegrationSync status is "synced" (not "failed")
- [ ] WorkItem has system note about sync
- [ ] n8n webhook URL is accessible

## 🎯 Quick Commands Summary

```bash
# Check all services
docker-compose ps

# View Celery logs in real-time
docker-compose logs -f celery_worker

# View Django logs
docker-compose logs -f web

# Test Redis
docker-compose exec redis redis-cli ping

# Check Celery tasks
docker-compose exec celery_worker celery -A app inspect active

# Django shell
docker-compose exec web python manage.py shell

# Restart Celery
docker-compose restart celery_worker

# Test webhook manually
curl -X POST "YOUR_N8N_URL" \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

## Next Steps

1. Try the step-by-step tests above
2. Check Integration Syncs in admin to see what happened
3. If you need `workitem_updated` event, let me know and I'll implement it
4. Review the payload structure in successful syncs to ensure n8n is getting what it needs
