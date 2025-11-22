# Quick Summary: How to Monitor Your Integration

## 🎯 Your Issue

You configured an integration with event type **"WorkItem Updated"** but didn't see any logs or webhook activity.

## ✅ Solution

I've made two changes:

### 1. **Implemented `workitem_updated` Event**
Updated [backend/integrations/signals/workitem.py](backend/integrations/signals/workitem.py#L68-L74) to trigger on ANY field change.

### 2. **Created Monitoring Guide**
See [MONITORING_INTEGRATIONS.md](MONITORING_INTEGRATIONS.md) for comprehensive debugging steps.

## 🚀 Steps to Fix & Test

### Step 1: Rebuild Docker with Updated Code

```bash
cd /Users/magda/Documents/fixed-service

# Rebuild the Docker images with the new signal handler
docker-compose up -d --build
```

This will:
- Pick up the updated signal handler code
- Restart all services with the new changes

### Step 2: Monitor Celery Logs

Open a terminal and watch Celery worker logs in real-time:

```bash
docker-compose logs -f celery_worker
```

Keep this running!

### Step 3: Test Your Integration

1. Go to Django admin: `http://localhost:8008/admin/`
2. Open any existing **WorkItem**
3. Change ANY field (description, comments, due date, customer, etc.)
4. Click **Save**

### Step 4: Watch the Logs

In the Celery logs terminal, you should immediately see:

```
[INFO] WorkItem RMA-XXX updated, will trigger integration
[INFO] Triggering 1 integration(s) for WorkItem RMA-XXX (workitem_updated)
[INFO] Enqueued webhook task for integration work-items-n8n
[INFO] Task integrations.tasks.send_integration_webhook[...] received
[INFO] Sending webhook to work-items-n8n for WorkItem:XXX (attempt 1)
[INFO] Successfully synced WorkItem:XXX to work-items-n8n
```

## 🔍 How to Check if It Worked

### Option 1: Check Integration Syncs (Easiest)

1. Go to `http://localhost:8008/admin/`
2. Navigate to **Integrations → Integration Syncs**
3. Look for the newest record
4. Status should be 🟢 **Synced**
5. Click on it to see:
   - **Request payload** - What was sent to n8n
   - **Response data** - What n8n returned
   - **Last error** - (should be empty if successful)

### Option 2: Check WorkItem Notes

1. Open the WorkItem you just edited
2. Scroll to the **Notes** section at the bottom
3. Look for a system note (author = None):
   - ✅ Success: `✓ Integration sync successful: work-items-n8n (workitem_updated)`
   - ❌ Failed: `✗ Integration sync failed: work-items-n8n - [error message]`

### Option 3: Check n8n Executions

1. Open your n8n instance
2. Go to **Executions**
3. You should see a new execution for your webhook workflow
4. Check if it received the WorkItem data

## 🐛 Still Not Working?

### Quick Diagnostics

```bash
# 1. Check all services are running
docker-compose ps
# All should show "Up"

# 2. Check Redis is working
docker-compose exec redis redis-cli ping
# Should return: PONG

# 3. Check Celery worker is alive
docker-compose logs celery_worker | tail -20
# Should see "celery@xxx ready"

# 4. Check integration is active
docker-compose exec web python manage.py shell
```

Then in the shell:
```python
from integrations.models import TenantIntegration
integrations = TenantIntegration.objects.filter(is_active=True)
for i in integrations:
    print(f"{i.name}: {i.event_type} -> {i.webhook_url}")
```

### Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| No logs at all | Celery not running | `docker-compose restart celery_worker` |
| "No active integrations" | Event type mismatch | Verify event type is `workitem_updated` |
| Connection refused | n8n URL unreachable | Test URL with `curl` (see below) |
| Task queued but not processed | Celery crashed | `docker-compose logs celery_worker` |

### Test n8n Webhook Manually

```bash
curl -X POST "https://n8n.serwisfixed.pl/webhook-test/6f02502e-021d-405d-9563-f43e4ad7df86" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "workitem_updated",
    "workitem": {
      "reference_id": "RMA-123",
      "description": "Test webhook",
      "status": "New"
    }
  }'
```

If this fails, the problem is with n8n, not the integration system.

## 📊 Understanding the Event Types

Your integration uses **"WorkItem Updated"** which triggers on ANY field change:

| Event Type | Triggers When | Use Case |
|------------|--------------|----------|
| **WorkItem Created** | New WorkItem is created | Get notified of all new repair jobs |
| **WorkItem Status Changed** | Status field changes | Track workflow progress (New → In Progress → Resolved) |
| **WorkItem Updated** | ANY field changes | Monitor all changes (description, price, customer, etc.) |

**Note:** If you change the status field, BOTH events will fire:
- `workitem_status_changed` (specific to status)
- `workitem_updated` (generic update)

So if you have integrations for both, you'll get 2 webhooks!

## 📝 Monitoring Workflow

```
┌─────────────────────────────────────────────────────────┐
│  1. Edit WorkItem in Django Admin                       │
│     ↓                                                    │
│  2. Django Signal Fires (workitem.py)                   │
│     ↓                                                    │
│  3. Celery Task Queued (via Redis)                      │
│     ↓                                                    │
│  4. Celery Worker Picks Up Task                         │
│     ↓                                                    │
│  5. HTTP POST to n8n Webhook                            │
│     ↓                                                    │
│  6. IntegrationSync Record Created (DB)                 │
│     ↓                                                    │
│  7. System Note Added to WorkItem                       │
└─────────────────────────────────────────────────────────┘

Monitor at each step:
- Step 2: Django logs (docker-compose logs web)
- Step 3-5: Celery logs (docker-compose logs celery_worker)
- Step 6: Admin → Integration Syncs
- Step 7: WorkItem → Notes section
```

## 🎓 Next Steps

1. **Rebuild Docker** with the new code: `docker-compose up -d --build`
2. **Test** by updating a WorkItem
3. **Check Celery logs** for activity
4. **Verify** in Integration Syncs admin

## 📚 Full Documentation

- **[MONITORING_INTEGRATIONS.md](MONITORING_INTEGRATIONS.md)** - Complete monitoring guide with all debug commands
- **[DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md)** - Docker-specific deployment guide
- **[backend/integrations/README.md](backend/integrations/README.md)** - Full integration system documentation

---

**Need more help?** Check the detailed monitoring guide: [MONITORING_INTEGRATIONS.md](MONITORING_INTEGRATIONS.md)
