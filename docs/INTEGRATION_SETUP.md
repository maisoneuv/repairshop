# Quick Start: Integration System Setup

This guide will help you set up the event-driven integration system for automatic n8n webhook triggers.

## Prerequisites

- Python environment with Django installed
- PostgreSQL database running
- Redis installed (for Celery)

## 5-Minute Setup

### 1. Install Redis

**macOS:**
```bash
brew install redis
brew services start redis
```

**Linux:**
```bash
sudo apt-get install redis-server
sudo systemctl start redis
```

**Verify Redis is running:**
```bash
redis-cli ping
# Should return: PONG
```

### 2. Install Python Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 3. Run Database Migrations

```bash
cd backend
python manage.py migrate
```

You should see:
```
Running migrations:
  Applying integrations.0001_initial... OK
```

### 4. Start the Celery Worker

**Open a new terminal window** and run:

```bash
cd backend
celery -A app worker --loglevel=info
```

Keep this terminal running. You should see:
```
[tasks]
  . integrations.tasks.send_integration_webhook
  . integrations.tasks.retry_failed_syncs

celery@hostname ready.
```

### 5. Start the Django Development Server

In another terminal:

```bash
cd backend
python manage.py runserver localhost:8000
```

## Configure Your First Integration

### Step 1: Create an n8n Webhook

1. Open your n8n instance
2. Create a new workflow
3. Add a **Webhook** node
4. Configure it:
   - **HTTP Method**: POST
   - **Path**: `/workitem-created` (or any path you want)
5. **Copy the webhook URL** (e.g., `https://your-n8n.com/webhook/workitem-created`)

### Step 2: Configure Integration in Django Admin

1. Go to `http://localhost:8000/admin/`
2. Navigate to **Integrations → Tenant Integrations**
3. Click **Add Tenant Integration**
4. Fill in:
   - **Tenant**: Select your tenant
   - **Name**: "n8n - New WorkItems"
   - **Integration Type**: "n8n Webhook"
   - **Event Type**: "WorkItem Created"
   - **Webhook URL**: Paste your n8n webhook URL
   - **Is Active**: ✓ Checked
5. Click **Save**

### Step 3: Test It!

1. Create a new WorkItem (via the frontend or Django admin)
2. Check your Celery worker terminal - you should see:
   ```
   [INFO] Sending webhook to n8n - New WorkItems for WorkItem:123
   [INFO] Successfully synced WorkItem:123 to n8n - New WorkItems
   ```
3. Check your n8n workflow - it should have been triggered!
4. In Django admin, go to **Integrations → Integration Syncs** to see the sync history

## What Happens Automatically?

When you create or update a WorkItem:

1. ✅ **Django Signal** detects the change
2. ✅ **Transaction Safety**: Waits for database commit
3. ✅ **Celery Task** is queued
4. ✅ **Worker** sends webhook to n8n
5. ✅ **System Note** is added to the WorkItem
6. ✅ **IntegrationSync** record is created for audit trail

If the webhook fails:
- ✅ Automatic retry (up to 3 times)
- ✅ Error logged in IntegrationSync
- ✅ System note added with error details

## Supported Events

Currently configured events:
- **workitem_created**: Triggered when a new WorkItem is created
- **workitem_status_changed**: Triggered when WorkItem status changes

To add more events, see the full documentation in [`backend/integrations/README.md`](backend/integrations/README.md).

## Example n8n Workflow

Here's a simple n8n workflow to get started:

1. **Webhook** node (trigger)
2. **Function** node to format data:
   ```javascript
   const workitem = $json.workitem;
   return {
     text: `🆕 New WorkItem: ${workitem.reference_id}`,
     description: workitem.description,
     customer: workitem.customer.name,
     status: workitem.status
   };
   ```
3. **Slack/Discord/Email** node to send notification

## Environment Variables (Optional)

Add to your `.env` file:

```bash
# Redis/Celery Configuration
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
```

## Production Deployment

For production, you'll want to:

1. **Run Celery as a daemon** (use systemd, supervisord, or Docker)
2. **Use Redis with persistence** configured
3. **Enable Celery Beat** for automatic retry of failed syncs:
   ```bash
   celery -A app beat --loglevel=info
   ```
4. **Monitor Celery** with Flower:
   ```bash
   pip install flower
   celery -A app flower
   ```
   Then visit `http://localhost:5555`

## Troubleshooting

### "Connection refused" to Redis
- Make sure Redis is running: `redis-cli ping`
- Check Redis is on port 6379: `ps aux | grep redis`

### Webhooks not triggering
- Verify integration is **Active** in admin
- Check Celery worker is running
- Look at Integration Syncs in admin for error messages

### Need Help?

See the full documentation: [`backend/integrations/README.md`](backend/integrations/README.md)

## Next Steps

- Add more integrations for different events
- Set up Notion integration
- Configure Slack notifications
- Customize webhook payloads
- Add integrations for Task model

Happy integrating! 🚀
