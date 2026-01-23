# AI-Powered Work Item Summary

This guide explains how to set up the AI summary feature that uses n8n to generate intelligent summaries of work items.

## Overview

The AI Summary feature allows users to generate AI-powered summaries of work items with a single click. The system:

1. Collects all work item data (fields, tasks, notes)
2. Sends it to n8n via webhook
3. n8n processes the data with an AI agent
4. n8n sends the summary back via API callback
5. Summary is saved and displayed on the work item

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend   │────▶│    n8n      │────▶│   AI Agent  │
│ (React App) │     │  (Django)   │     │  (Webhook)  │     │(OpenAI/etc) │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │                   ▲                   │
       │                   │                   │
       │    ┌──────────────┴───────────────────┘
       │    │         API Callback
       │    │      (with summary)
       ▼    │
┌─────────────┐
│   Polling   │
│ (3 seconds) │
└─────────────┘
```

## Prerequisites

- Integration system set up (see [INTEGRATION_SETUP.md](INTEGRATION_SETUP.md))
- Celery worker running
- n8n instance with AI capabilities (OpenAI, Claude, etc.)
- API key for n8n callbacks (see [API_KEYS.md](API_KEYS.md))

## Setup Guide

### Step 1: Create an API Key for n8n Callbacks

n8n needs an API key to authenticate when sending the summary back.

**Using CLI:**
```bash
# Docker
docker-compose exec web python manage.py generate_api_key \
  --tenant=<your-tenant-subdomain> \
  --role=<role-id-with-workitem-permissions> \
  --name="n8n AI Summary Callback"

# Local development
cd backend
python manage.py generate_api_key \
  --tenant=<your-tenant-subdomain> \
  --role=<role-id> \
  --name="n8n AI Summary Callback"
```

**Save the generated key** - it will only be shown once!

Example output:
```
API Key created successfully!
Key: sk_live_abc123def456...
Prefix: sk_live_abc1
```

### Step 2: Create the TenantIntegration

1. Go to Django Admin: `http://your-domain/admin/`
2. Navigate to **Integrations > Tenant Integrations**
3. Click **Add Tenant Integration**
4. Configure:
   - **Tenant**: Select your tenant
   - **Name**: "n8n - AI Summary"
   - **Integration Type**: "n8n Webhook"
   - **Event Type**: "WorkItem Summary Requested"
   - **Webhook URL**: Your n8n webhook URL
   - **Is Active**: Checked
5. Click **Save**

### Step 3: Create the n8n Workflow

Create a new workflow in n8n with the following nodes:

#### Node 1: Webhook Trigger

- **HTTP Method**: POST
- **Path**: `/ai-summary` (or your preferred path)
- **Authentication**: None (or Header Auth if desired)

The webhook will receive a payload like:
```json
{
  "event_type": "workitem_summary_requested",
  "timestamp": "2024-01-21T10:30:00Z",
  "request_id": "uuid-for-correlation",
  "tenant": {
    "id": 1,
    "name": "Your Company"
  },
  "workitem": {
    "id": 123,
    "reference_id": "RMA-456",
    "description": "Device not turning on...",
    "status": "In Progress",
    "type": "Chargeable Repair",
    "customer": {
      "id": 1,
      "name": "John Doe",
      "email": "john@example.com"
    },
    "customer_asset": {
      "serial_number": "SN123",
      "device": {
        "manufacturer": "Apple",
        "model": "iPhone 14"
      }
    },
    "comments": "Customer mentioned water damage...",
    "device_condition": "Screen cracked, water indicators triggered"
  },
  "tasks": [
    {
      "id": 1,
      "summary": "Initial diagnosis",
      "description": "Checked for water damage...",
      "status": "Done",
      "task_type": "Diagnosis"
    }
  ],
  "notes": [
    {
      "id": 1,
      "content": "Called customer to confirm...",
      "author": "Jane Smith",
      "created_at": "2024-01-20T14:00:00Z",
      "source": "workitem"
    }
  ]
}
```

#### Node 2: AI Agent (OpenAI, Claude, etc.)

Configure your AI node with a prompt like:

```
You are a repair service assistant. Summarize the following work item in 2-3 concise sentences. Include:
- What device/issue is being addressed
- Current status and key actions taken
- Any important customer communication

Work Item: {{$json.workitem.reference_id}}
Device: {{$json.workitem.customer_asset.device.manufacturer}} {{$json.workitem.customer_asset.device.model}}
Description: {{$json.workitem.description}}
Status: {{$json.workitem.status}}
Device Condition: {{$json.workitem.device_condition}}
Comments: {{$json.workitem.comments}}

Tasks completed:
{{$json.tasks.map(t => `- [${t.status}] ${t.task_type}: ${t.summary || t.description}`).join('\n')}}

Notes:
{{$json.notes.map(n => `- ${n.author}: ${n.content}`).join('\n')}}

Provide a professional, concise summary.
```

#### Node 3: HTTP Request (Callback)

- **Method**: POST
- **URL**: `https://your-domain.com/api/integrations/summary-callback/`
- **Authentication**: Header Auth
  - **Name**: `Authorization`
  - **Value**: `Bearer sk_live_your_api_key_here`
- **Body Content Type**: JSON
- **Body**:
```json
{
  "request_id": "{{ $('Webhook').item.json.request_id }}",
  "workitem_id": {{ $('Webhook').item.json.workitem.id }},
  "summary": "{{ $json.text }}",
  "status": "success"
}
```

#### Node 4: Error Handler (Optional but Recommended)

Add an error handler that calls back with failure status:

```json
{
  "request_id": "{{ $('Webhook').item.json.request_id }}",
  "workitem_id": {{ $('Webhook').item.json.workitem.id }},
  "status": "error",
  "error_message": "{{ $json.error.message }}"
}
```

### Step 4: Test the Integration

1. Go to a Work Item detail page in the frontend
2. Find the **AI Summary** card in the right sidebar
3. Click **Generate Summary**
4. Watch the button show "Generating..." status
5. After n8n processes (typically 5-15 seconds), the summary appears

## API Reference

### Request Summary

**Endpoint**: `POST /api/tasks/work-items/{id}/request-summary/`

**Authentication**: Session (frontend) or API Key (external)

**Response** (202 Accepted):
```json
{
  "message": "Summary generation requested",
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending"
}
```

**Error Response** (409 Conflict):
```json
{
  "error": "Summary generation already in progress"
}
```

### Check Summary Status

**Endpoint**: `GET /api/tasks/work-items/{id}/summary-status/`

**Response**:
```json
{
  "status": "completed",
  "summary": "iPhone 14 repair (RMA-456) for water damage. Diagnosis complete, awaiting customer approval for motherboard replacement. Customer contacted and informed of $350 repair estimate.",
  "generated_at": "2024-01-21T10:35:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Status values**: `none`, `pending`, `completed`, `failed`

### Summary Callback (for n8n)

**Endpoint**: `POST /api/integrations/summary-callback/`

**Authentication**: API Key (Bearer token)

**Request Body**:
```json
{
  "request_id": "uuid-from-original-request",
  "workitem_id": 123,
  "summary": "AI-generated summary text...",
  "status": "success"
}
```

For errors:
```json
{
  "request_id": "uuid-from-original-request",
  "workitem_id": 123,
  "status": "error",
  "error_message": "AI service unavailable"
}
```

**Response** (200 OK):
```json
{
  "message": "Summary saved successfully",
  "workitem_reference": "RMA-456"
}
```

## Troubleshooting

### Summary stays in "Generating..." state

1. **Check Celery worker is running**:
   ```bash
   docker-compose logs celery_worker
   ```

2. **Check TenantIntegration exists and is active**:
   - Django Admin > Integrations > Tenant Integrations
   - Verify "WorkItem Summary Requested" event type is configured

3. **Check IntegrationSync records**:
   - Django Admin > Integrations > Integration Syncs
   - Look for recent records with `workitem_summary_requested` event

4. **Check n8n workflow**:
   - Is the webhook receiving data?
   - Are there execution errors?

### "No active summary_requested integrations found"

This error appears in logs when no TenantIntegration is configured for the `workitem_summary_requested` event. Create one in Django Admin.

### Callback returns 403 Forbidden

1. **request_id mismatch**: The callback must include the exact `request_id` from the original webhook
2. **Tenant mismatch**: The API key's tenant must match the work item's tenant
3. **Invalid API key**: Verify the key is active and not expired

### Summary shows as "failed"

Check n8n execution logs for errors. Common issues:
- AI service rate limiting
- Invalid API key for AI service
- Network timeout

## Security Considerations

1. **API Key Scope**: Create a dedicated API key for n8n with minimal permissions (only needs to update work item summaries)

2. **Request ID Validation**: The callback endpoint validates that the `request_id` matches the one stored on the work item, preventing unauthorized updates

3. **Tenant Isolation**: API keys are tenant-scoped, ensuring n8n can only update work items belonging to its assigned tenant

4. **HTTPS**: Always use HTTPS for the callback URL in production

## Monitoring

### Check Integration Health

```bash
# View recent sync records
docker-compose exec web python manage.py shell -c "
from integrations.models import IntegrationSync
for s in IntegrationSync.objects.filter(event_type='workitem_summary_requested').order_by('-created_at')[:5]:
    print(f'{s.created_at}: {s.status} - WorkItem #{s.object_id}')
"
```

### View Celery Task Queue

```bash
docker-compose exec web celery -A app inspect active
```

## Customization

### Modify the Payload

Edit `backend/integrations/signals/workitem.py`:

```python
def build_summary_request_payload(workitem, request_id):
    # Add custom fields here
    payload['custom_field'] = workitem.some_field
    return payload
```

### Change Polling Interval

Edit `frontend/src/components/WorkItemSummary.jsx`:

```javascript
// Change from 3000ms (3 seconds) to your preferred interval
pollingIntervalRef.current = setInterval(async () => {
    // ...
}, 5000); // 5 seconds
```

## Related Documentation

- [API_KEYS.md](API_KEYS.md) - API key authentication setup
- [INTEGRATION_SETUP.md](INTEGRATION_SETUP.md) - General integration setup
- [N8N_WEBHOOK_SETUP.md](N8N_WEBHOOK_SETUP.md) - n8n webhook configuration
- [N8N_AUTHENTICATION.md](N8N_AUTHENTICATION.md) - n8n authentication methods
