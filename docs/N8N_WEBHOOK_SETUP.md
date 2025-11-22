# n8n Webhook Setup Guide

Complete guide to configuring n8n webhooks to receive WorkItem events from your Django integration system.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start (5 Minutes)](#quick-start-5-minutes)
- [Detailed Setup](#detailed-setup)
- [Webhook Configuration Options](#webhook-configuration-options)
- [Accessing WorkItem Data](#accessing-workitem-data)
- [Example Workflows](#example-workflows)
- [Testing Your Webhook](#testing-your-webhook)
- [Production Deployment](#production-deployment)

---

## Prerequisites

- n8n instance running (cloud or self-hosted)
- Django integration system deployed with Celery worker running
- Basic understanding of n8n workflows

**n8n Versions:**
- This guide works with n8n v1.0+ (cloud and self-hosted)
- Webhook node is a core node (always available)

---

## Quick Start (5 Minutes)

### Step 1: Create a New Workflow

1. Log into your n8n instance
2. Click **"New workflow"** or **"+ Workflow"**
3. Give it a descriptive name: `"WorkItem Notifications"` or `"Django WorkItem Webhook"`

### Step 2: Add a Webhook Node

1. Click the **"+" button** to add a node
2. Search for **"Webhook"**
3. Select **"Webhook"** from the results (it's under "Core Nodes")

### Step 3: Configure the Webhook

**Basic Settings:**

| Setting | Value | Description |
|---------|-------|-------------|
| **HTTP Method** | `POST` | Django sends POST requests |
| **Path** | Custom or auto-generated | e.g., `workitem-webhook` or use the auto-generated path |
| **Response Mode** | `Using 'Respond to Webhook' Node` | If you want to send data back to Django |
| **Authentication** | See [Authentication Guide](N8N_AUTHENTICATION.md) | Choose your security method |

**What your configuration should look like:**

```
┌─────────────────────────────────────┐
│ Webhook                             │
├─────────────────────────────────────┤
│ HTTP Method: POST                   │
│ Path: workitem-webhook              │
│ Authentication: Header Auth         │ ← See authentication guide
│ Response Mode: Using Respond Node   │
│                                     │
│ Webhook URLs:                       │
│ Test URL: https://...webhook-test   │
│ Production URL: https://...webhook  │
└─────────────────────────────────────┘
```

### Step 4: Copy Your Webhook URL

After configuring the webhook, n8n generates two URLs:

1. **Test URL** - Use for development (single-use, shows data live)
2. **Production URL** - Use after activating workflow (persistent)

**For testing, use the Test URL first!**

Copy the Test URL - it looks like:
```
https://n8n.serwisfixed.pl/webhook-test/6f02502e-021d-405d-9563-f43e4ad7df86
```

### Step 5: Configure in Django Admin

1. Go to `http://localhost:8008/admin/`
2. Navigate to **Integrations → Tenant Integrations**
3. Click **Add Tenant Integration**
4. Fill in:
   - **Name**: `"n8n - WorkItem Updates"`
   - **Integration Type**: `"n8n Webhook"`
   - **Event Type**: `"WorkItem Updated"` (or your preferred event)
   - **Webhook URL**: Paste your n8n Test URL
   - **Is Active**: ✓ Checked
   - **Headers**: Leave empty for now (see Authentication guide)
5. Click **Save**

### Step 6: Test It!

1. In n8n, click **"Listen for test event"** button on the Webhook node
2. In Django admin, update any WorkItem (change description, status, etc.)
3. n8n should immediately receive the data and display it!

**Success looks like:**
```json
{
  "event_type": "workitem_updated",
  "timestamp": "2025-11-18T10:30:00Z",
  "tenant": {
    "id": 1,
    "name": "repairhero"
  },
  "workitem": {
    "id": 123,
    "reference_id": "RMA-123",
    "status": "In Progress",
    "description": "iPhone screen repair",
    ...
  }
}
```

### Step 7: Add Processing Nodes

Now add nodes to process the data:

**Example: Send Slack Notification**

1. Add a **Slack** node after the Webhook
2. Configure it to send a message
3. Use expressions to access WorkItem data:
   ```
   Message: New WorkItem: {{ $json.workitem.reference_id }}
   Customer: {{ $json.workitem.customer.name }}
   Status: {{ $json.workitem.status }}
   ```

### Step 8: Activate for Production

1. Click the **"Activate"** toggle in the top-right
2. Switch to the **Production URL** in Django admin
3. Update the TenantIntegration webhook URL to the production URL

**Done!** Your webhook is now live and will receive events automatically.

---

## Detailed Setup

### Understanding n8n Webhook URLs

n8n provides two webhook URLs:

#### Test URL
```
https://n8n.serwisfixed.pl/webhook-test/6f02502e-021d-405d-9563-f43e4ad7df86
```

**Characteristics:**
- ⏱️ **Single-use**: Becomes active when you click "Listen for test event"
- 🔍 **Live data**: Payload displays immediately in the editor
- 🧪 **Development**: Perfect for testing and debugging
- ⚠️ **Temporary**: Deactivates after one request or timeout

**When to use:**
- Initial setup and testing
- Debugging payload structure
- Verifying authentication works
- Development/staging environments

#### Production URL
```
https://n8n.serwisfixed.pl/webhook/6f02502e-021d-405d-9563-f43e4ad7df86
```

**Characteristics:**
- ♾️ **Persistent**: Always active when workflow is activated
- 🚀 **Production-ready**: Handles multiple requests
- 📊 **Logged**: View executions in n8n's execution history
- 🔒 **Reliable**: Doesn't timeout

**When to use:**
- Production deployments
- After testing is complete
- When you activate the workflow

**Important:** Switch from Test URL to Production URL in Django admin after activation!

---

### Webhook Node Configuration Options

#### 1. HTTP Method

**Setting:** `POST`

**Why:** Django's integration system sends POST requests with JSON payload.

**Other options:**
- `GET` - Not used for this integration
- `PUT`/`PATCH` - Could be used for custom implementations
- `DELETE` - Not applicable

**Can accept multiple methods:** Enable "Allow Multiple HTTP Methods" if needed.

---

#### 2. Path

**Options:**
- **Auto-generated** (default): Random UUID like `6f02502e-021d-405d-9563-f43e4ad7df86`
- **Custom path**: `workitem-webhook`, `django/workitems`, etc.

**Examples:**
```
Auto:   /webhook/6f02502e-021d-405d-9563-f43e4ad7df86
Custom: /webhook/workitem-created
Custom: /webhook/v1/workitems
```

**Recommendation:**
- **Production**: Use auto-generated (more secure, harder to guess)
- **Development**: Use custom path (easier to remember)

**Route parameters:**
You can use dynamic paths with parameters:
```
/webhook/:tenant/:event
```
Then access in n8n: `{{ $webhook.params.tenant }}`

---

#### 3. Authentication

See the complete [Authentication Guide (N8N_AUTHENTICATION.md)](N8N_AUTHENTICATION.md) for details.

**Quick summary:**

| Method | Security | Complexity | Recommended For |
|--------|----------|------------|----------------|
| None | ❌ Low | Easy | Testing only |
| Header Auth | ✅ Good | Easy | **Most use cases** ⭐ |
| Basic Auth | ✅ Good | Easy | Traditional systems |
| HMAC | ✅✅ Excellent | Medium | High-security production |

**For your screenshot (Basic Auth selected):**
1. Create credentials in n8n
2. Configure headers in Django (see Authentication guide)

---

#### 4. Response Mode

**Options:**

**A) "Using 'Respond to Webhook' Node"** (Recommended)

Use this when you want to send data back to Django.

```
Webhook → Process Data → Respond to Webhook
```

**Example:**
```
Webhook → Check if valid → Return { "status": "success", "id": 123 }
```

Django will receive this response in `IntegrationSync.response_data`

**B) "When Last Node Finishes"**

n8n automatically responds when workflow completes.

**C) "Immediately"**

Responds with `{ "message": "Workflow was started" }` right away.

**Recommendation:** Use "Using Respond to Webhook Node" for control over the response.

---

#### 5. Options

**Binary Property**
- Enable if receiving files/images
- Not needed for JSON WorkItem data

**Raw Body**
- Enable to receive raw request body
- Not needed (n8n auto-parses JSON)

**Response Code**
- Default: 200 OK
- Customize: Return 201 Created, 202 Accepted, etc.

**Response Headers**
- Add custom headers in response
- Example: `Content-Type: application/json`

---

## Accessing WorkItem Data

Once the webhook receives data, you can access it in subsequent nodes using expressions.

### Understanding the Payload Structure

Django sends this JSON structure:

```json
{
  "event_type": "workitem_updated",
  "timestamp": "2025-11-18T10:30:00Z",
  "tenant": {
    "id": 1,
    "name": "repairhero"
  },
  "workitem": {
    "id": 123,
    "reference_id": "RMA-123",
    "description": "iPhone 13 Pro screen repair",
    "status": "In Progress",
    "type": "Chargeable Repair",
    "priority": "Standard",
    "created_date": "2025-11-18T09:00:00Z",
    "due_date": "2025-11-20T17:00:00Z",
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
      "name": "iPhone 13 Pro - Silver"
    },
    "estimated_price": "150.00",
    "final_price": null,
    "dropoff_point": {
      "id": 5,
      "name": "Main Store"
    },
    "intake_method": "walk_in",
    "comments": "Customer reported screen cracked after drop",
    "device_condition": "Good condition except screen"
  }
}
```

### n8n Expression Syntax

Access data using `{{ $json.path.to.field }}` or `{{ $node["Node Name"].json["field"] }}`

**Examples:**

```javascript
// Event type
{{ $json.event_type }}
// Returns: "workitem_updated"

// WorkItem reference ID
{{ $json.workitem.reference_id }}
// Returns: "RMA-123"

// Customer name
{{ $json.workitem.customer.name }}
// Returns: "John Doe"

// Customer email
{{ $json.workitem.customer.email }}
// Returns: "john@example.com"

// Status
{{ $json.workitem.status }}
// Returns: "In Progress"

// Tenant name
{{ $json.tenant.name }}
// Returns: "repairhero"

// Due date
{{ $json.workitem.due_date }}
// Returns: "2025-11-20T17:00:00Z"
```

### Using Data in Different Node Types

#### Slack Node

```
Channel: #work-items
Message:
📋 New WorkItem: {{ $json.workitem.reference_id }}
👤 Customer: {{ $json.workitem.customer.name }}
📞 Email: {{ $json.workitem.customer.email }}
📝 Description: {{ $json.workitem.description }}
⚡ Status: {{ $json.workitem.status }}
```

#### Email Node (Send Email)

```
To: {{ $json.workitem.customer.email }}
Subject: WorkItem {{ $json.workitem.reference_id }} - {{ $json.workitem.status }}
Body:
Hello {{ $json.workitem.customer.name }},

Your repair request ({{ $json.workitem.reference_id }}) status has been updated to: {{ $json.workitem.status }}

Description: {{ $json.workitem.description }}

Thank you!
```

#### Notion Node (Create Database Item)

```
Database: WorkItems
Properties:
  - Reference: {{ $json.workitem.reference_id }}
  - Customer: {{ $json.workitem.customer.name }}
  - Status: {{ $json.workitem.status }}
  - Description: {{ $json.workitem.description }}
  - Due Date: {{ $json.workitem.due_date }}
```

#### HTTP Request Node (Call another API)

```
Method: POST
URL: https://your-api.com/tickets
Body:
{
  "ticket_id": "{{ $json.workitem.reference_id }}",
  "customer": "{{ $json.workitem.customer.name }}",
  "status": "{{ $json.workitem.status }}"
}
```

### Function Node (Advanced Processing)

For complex logic, use a Function node:

```javascript
// Access the webhook data
const eventType = $json.event_type;
const workitem = $json.workitem;
const customer = workitem.customer;

// Process the data
let priority = '🔵 Normal';
if (workitem.priority === 'Express') {
  priority = '🔴 URGENT';
}

let statusEmoji = '📋';
if (workitem.status === 'In Progress') statusEmoji = '⚙️';
if (workitem.status === 'Resolved') statusEmoji = '✅';

// Return formatted data
return {
  json: {
    message: `${statusEmoji} ${priority} - ${workitem.reference_id}`,
    customer_name: customer.name,
    customer_email: customer.email,
    workitem_url: `https://yourdomain.com/workitems/${workitem.id}`,
    full_description: workitem.description,
    technician: workitem.technician?.name || 'Unassigned'
  }
};
```

---

## Example Workflows

### Example 1: Simple Slack Notification

**Use Case:** Send a Slack message when any WorkItem is updated.

**Workflow:**
```
Webhook → Slack
```

**Webhook Configuration:**
- HTTP Method: POST
- Path: `workitem-updates`
- Authentication: Header Auth

**Slack Configuration:**
- Channel: `#repairs`
- Message:
  ```
  🔔 WorkItem Update

  *{{ $json.workitem.reference_id }}* - {{ $json.workitem.status }}
  Customer: {{ $json.workitem.customer.name }}
  Technician: {{ $json.workitem.technician.name }}

  📝 {{ $json.workitem.description }}
  ```

---

### Example 2: Conditional Notifications (Status-Based)

**Use Case:** Only notify when status changes to "Resolved".

**Workflow:**
```
Webhook → IF (status check) → Slack
                            ↓ (false)
                          Stop
```

**IF Node Configuration:**
```
Condition: {{ $json.event_type }} equals "workitem_status_changed"
AND
Condition: {{ $json.workitem.status }} equals "Resolved"
```

**Slack Message (sent only if true):**
```
✅ WorkItem Completed!

{{ $json.workitem.reference_id }} has been marked as Resolved.

Customer: {{ $json.workitem.customer.name }}
Email: {{ $json.workitem.customer.email }}

Notify the customer!
```

---

### Example 3: Update Notion Database

**Use Case:** Sync WorkItems to a Notion database.

**Workflow:**
```
Webhook → Notion (Search) → IF (exists?) → Notion (Update)
                                         ↓ (no)
                                    Notion (Create)
```

**Step 1: Webhook**
- Receives WorkItem data

**Step 2: Notion (Database → Search)**
- Database: Your WorkItems database
- Search: Filter by `Reference ID = {{ $json.workitem.reference_id }}`

**Step 3: IF Node**
- Condition: `{{ $json.id }}` is not empty

**Step 4a: Notion (Update) - if exists**
- Page ID: `{{ $json.id }}`
- Properties:
  - Status: `{{ $json.workitem.status }}`
  - Customer: `{{ $json.workitem.customer.name }}`
  - Description: `{{ $json.workitem.description }}`

**Step 4b: Notion (Create) - if doesn't exist**
- Database: Your WorkItems database
- Properties:
  - Reference: `{{ $json.workitem.reference_id }}`
  - Status: `{{ $json.workitem.status }}`
  - Customer: `{{ $json.workitem.customer.name }}`
  - Description: `{{ $json.workitem.description }}`

---

### Example 4: Email Customer on Status Change

**Use Case:** Auto-email customers when their repair status changes.

**Workflow:**
```
Webhook → IF (status changed?) → Function (format email) → Send Email → Respond
```

**IF Node:**
```
{{ $json.event_type }} equals "workitem_status_changed"
```

**Function Node:**
```javascript
const workitem = $json.workitem;
const changes = $json.changes;

let emailBody = `Hello ${workitem.customer.name},\n\n`;
emailBody += `Your repair request (${workitem.reference_id}) status has been updated.\n\n`;
emailBody += `Previous Status: ${changes.status.old}\n`;
emailBody += `New Status: ${changes.status.new}\n\n`;
emailBody += `Description: ${workitem.description}\n\n`;
emailBody += `Thank you for choosing our service!`;

return {
  json: {
    to: workitem.customer.email,
    subject: `Repair Update: ${workitem.reference_id}`,
    body: emailBody
  }
};
```

**Send Email Node:**
```
To: {{ $json.to }}
Subject: {{ $json.subject }}
Message: {{ $json.body }}
```

---

## Testing Your Webhook

### Method 1: Using n8n's "Listen for Test Event"

1. Click **"Listen for test event"** button in Webhook node
2. Update a WorkItem in Django admin
3. n8n receives the payload and displays it
4. Verify data looks correct

**Advantages:**
- ✅ Real-time feedback
- ✅ See exact payload structure
- ✅ No need to activate workflow

---

### Method 2: Manual Test with curl

Test the webhook without Django:

```bash
curl -X POST "https://n8n.serwisfixed.pl/webhook-test/YOUR-WEBHOOK-ID" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "workitem_created",
    "timestamp": "2025-11-18T10:00:00Z",
    "tenant": {
      "id": 1,
      "name": "test-tenant"
    },
    "workitem": {
      "id": 999,
      "reference_id": "RMA-999",
      "status": "New",
      "description": "Test webhook",
      "customer": {
        "name": "Test Customer",
        "email": "test@example.com"
      }
    }
  }'
```

**With Authentication (Header Auth):**
```bash
curl -X POST "https://n8n.serwisfixed.pl/webhook-test/YOUR-WEBHOOK-ID" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key-here" \
  -d '{ ... }'
```

**With Authentication (Basic Auth):**
```bash
curl -X POST "https://n8n.serwisfixed.pl/webhook-test/YOUR-WEBHOOK-ID" \
  -H "Content-Type: application/json" \
  -u "username:password" \
  -d '{ ... }'
```

---

### Method 3: Check Execution History

After activating the workflow:

1. Go to **Executions** tab in n8n
2. See all webhook invocations
3. Click on any execution to see:
   - Input data received
   - Output from each node
   - Errors (if any)

---

## Production Deployment

### Checklist Before Going Live

- [ ] **Test URL works** - Verified with "Listen for test event"
- [ ] **Workflow is complete** - All processing nodes configured
- [ ] **Error handling added** - Workflow handles failures gracefully
- [ ] **Authentication configured** - See [Authentication Guide](N8N_AUTHENTICATION.md)
- [ ] **Workflow activated** - Toggle is ON
- [ ] **Production URL copied** - Switched from Test URL to Production URL
- [ ] **Django admin updated** - TenantIntegration uses Production URL
- [ ] **Tested end-to-end** - Created/updated WorkItem successfully triggers workflow
- [ ] **Monitoring setup** - Can view executions in n8n

### Activating the Workflow

1. Click the **"Inactive"** toggle in top-right
2. It changes to **"Active"** (green)
3. Production webhook URL is now live

### Switching to Production URL

1. In n8n, copy the **Production URL** (not Test URL)
2. In Django admin:
   - Go to **Integrations → Tenant Integrations**
   - Edit your integration
   - Replace Test URL with Production URL
   - **Save**

**Before:**
```
https://n8n.serwisfixed.pl/webhook-test/6f02502e-021d-405d-9563-f43e4ad7df86
```

**After:**
```
https://n8n.serwisfixed.pl/webhook/6f02502e-021d-405d-9563-f43e4ad7df86
```

### Monitoring Production Webhooks

#### In n8n:

**View Executions:**
1. Click **"Executions"** tab
2. See all webhook invocations
3. Filter by status: Success, Error, Waiting

**Check for Errors:**
- Red executions = failed
- Click to see error details
- Check which node failed

#### In Django:

**Integration Syncs Admin:**
1. Go to `http://localhost:8008/admin/integrations/integrationsync/`
2. Check status:
   - 🟢 Synced = Success
   - 🔴 Failed = Error (check `last_error` field)
3. View `response_data` to see what n8n returned

**WorkItem Notes:**
- Open any WorkItem
- Check Notes section for system messages
- Look for success/failure messages

---

## Troubleshooting

### Issue: Webhook Doesn't Receive Data

**Symptoms:**
- Click "Listen for test event" but nothing happens
- Update WorkItem but webhook doesn't trigger

**Diagnosis:**
```bash
# Check Django/Celery logs
docker-compose logs -f celery_worker

# Should see:
# [INFO] Sending webhook to n8n...
```

**Solutions:**
1. Verify integration is **Active** in Django admin
2. Check event type matches (workitem_updated, workitem_created, etc.)
3. Ensure Celery worker is running: `docker-compose ps celery_worker`
4. Check Django admin URL is correct (no typos)

---

### Issue: Authentication Errors

**Symptoms:**
- n8n returns 403 Forbidden or 401 Unauthorized
- IntegrationSync shows authentication error

**Solutions:**
See detailed [Authentication Guide](N8N_AUTHENTICATION.md)

Quick check:
1. n8n authentication setting matches Django headers
2. Credentials are correct (no extra spaces)
3. Test with curl (see authentication guide)

---

### Issue: Workflow Executes But Fails

**Symptoms:**
- Webhook receives data
- Subsequent nodes fail (Slack, Email, etc.)

**Diagnosis:**
1. Check **Executions** tab in n8n
2. Find the failed execution
3. Click to see which node failed

**Common causes:**
- Missing credentials (Slack, Email, etc.)
- Invalid expressions (typos in `{{ $json.workitem.name }}`)
- API limits exceeded
- Network issues

**Solutions:**
1. Add error handling with **IF** nodes
2. Use **Error Trigger** node to catch failures
3. Add **Respond to Webhook** to send error back to Django

---

### Issue: Data Not Accessible in Nodes

**Symptoms:**
- Expressions like `{{ $json.workitem.name }}` return empty
- "Cannot read property 'name' of undefined"

**Diagnosis:**
Check the exact data structure in Webhook node output.

**Solution:**
Use n8n's expression editor (click the field and press `=`):
- Browse the data structure
- Copy the exact path
- Handle optional fields:
  ```javascript
  {{ $json.workitem.customer?.name || 'Unknown' }}
  ```

---

## Next Steps

1. ✅ **Set up authentication** - See [N8N_AUTHENTICATION.md](N8N_AUTHENTICATION.md)
2. ✅ **Add error handling** - Use IF nodes and Error Triggers
3. ✅ **Create multiple workflows** - Different events, different actions
4. ✅ **Monitor executions** - Regularly check n8n Executions tab
5. ✅ **Optimize** - Add filters to reduce unnecessary executions

---

## Additional Resources

- **[N8N_AUTHENTICATION.md](N8N_AUTHENTICATION.md)** - Complete authentication guide
- **[MONITORING_INTEGRATIONS.md](MONITORING_INTEGRATIONS.md)** - Debug integration issues
- **[backend/integrations/README.md](backend/integrations/README.md)** - Django integration system docs
- **[n8n Official Docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)** - Webhook node documentation

---

**Happy automating!** 🚀

If you have questions or run into issues, check the troubleshooting section or the monitoring guide.
