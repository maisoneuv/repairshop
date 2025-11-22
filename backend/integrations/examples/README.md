# n8n Workflow Examples

This directory contains example n8n workflows that you can import and customize.

## Available Examples

### 1. Slack Notification ([n8n-slack-notification.json](n8n-slack-notification.json))

**Use Case:** Send formatted Slack notifications when WorkItems are created or updated.

**Features:**
- ✅ Header authentication (secure)
- ✅ Formats WorkItem data into readable Slack message
- ✅ Includes emojis for status and priority
- ✅ Responds back to Django with success status
- ✅ Shows customer, technician, and description

**How to use:**
1. Import into n8n
2. Replace `#work-items` with your Slack channel
3. Configure Slack credentials
4. Configure Header Auth credentials (see authentication guide)
5. Copy webhook URL to Django admin

---

### 2. Notion Database Sync ([n8n-notion-sync.json](n8n-notion-sync.json))

**Use Case:** Automatically sync WorkItems to a Notion database.

**Features:**
- ✅ Header authentication (secure)
- ✅ Checks if WorkItem already exists in Notion
- ✅ Updates existing pages or creates new ones
- ✅ Syncs all relevant fields (status, customer, description, etc.)
- ✅ Responds back with action taken (created/updated)

**How to use:**
1. Create a Notion database with these properties:
   - Reference ID (Text)
   - Status (Select)
   - Customer (Text)
   - Description (Text)
   - Technician (Text)
   - Priority (Select)
   - Created Date (Date)
2. Import workflow into n8n
3. Replace `YOUR_NOTION_DATABASE_ID` with your database ID
4. Configure Notion API credentials
5. Configure Header Auth credentials
6. Copy webhook URL to Django admin

---

## How to Import

### Method 1: Via n8n UI

1. Open n8n
2. Click **Workflows** → **Import from File**
3. Select the JSON file
4. Click **Import**

### Method 2: Copy-Paste

1. Open the JSON file
2. Copy all contents
3. In n8n, click **Workflows** → **Import from URL / Clipboard**
4. Paste the JSON
5. Click **Import**

---

## Configuration Required

After importing, you need to configure:

### 1. Authentication Credentials

**Create Header Auth Credential:**

1. In n8n, go to **Credentials**
2. Click **+ Add Credential**
3. Search for "Header Auth"
4. Configure:
   - Name: `Django Integration Auth`
   - Header Name: `X-API-Key`
   - Header Value: (generate using command below)

**Generate secret token:**
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

**Then add to Django:**

Django Admin → Integrations → Tenant Integration → Headers:
```json
{
  "X-API-Key": "your-generated-token-here"
}
```

### 2. Service Credentials

**For Slack workflow:**
- Configure Slack API credentials in n8n
- Get from: https://api.slack.com/apps

**For Notion workflow:**
- Configure Notion API credentials in n8n
- Get from: https://www.notion.so/my-integrations
- Share your database with the integration

### 3. Webhook URL

After importing and configuring:

1. Click on the Webhook node
2. Click **"Listen for test event"**
3. Copy the **Test URL**
4. Go to Django Admin → Integrations → Tenant Integrations
5. Paste the URL
6. Test by creating/updating a WorkItem
7. Once working, activate the workflow and switch to **Production URL**

---

## Customization

### Change Slack Channel

In "Send to Slack" node:
```
Channel: #your-channel-name
```

### Change Slack Message Format

In "Format Message" Function node, modify:
```javascript
let message = `Your custom format here`;
message += `Reference: ${workitem.reference_id}\n`;
// Add more fields as needed
```

### Add Notion Fields

In "Create Notion Page" or "Update Notion Page" nodes:

1. Click **Add Property**
2. Select property type
3. Enter property name (must match Notion database)
4. Set value using expression: `={{ $json.workitem.field_name }}`

### Filter Events

Add an IF node after Webhook to filter:

**Example: Only process "Resolved" status:**
```
Condition: {{ $json.workitem.status }} equals "Resolved"
```

**Example: Only process Express priority:**
```
Condition: {{ $json.workitem.priority }} equals "Express"
```

---

## Troubleshooting

### Webhook Returns 403 Forbidden

**Cause:** Authentication failed.

**Solution:**
1. Verify Header Auth credential in n8n matches Django headers exactly
2. Check header name is `X-API-Key` (case-sensitive)
3. Ensure token matches between n8n and Django

### Slack/Notion Node Fails

**Cause:** Missing or invalid credentials.

**Solution:**
1. Configure service credentials in n8n
2. Test credentials using n8n's "Test Credentials" button
3. Ensure integration has proper permissions

### Workflow Doesn't Receive Data

**Cause:** Django integration not configured or Celery worker not running.

**Solution:**
1. Check Django admin: Integration is Active
2. Verify Celery worker is running: `docker-compose logs celery_worker`
3. Check event type matches (workitem_created, workitem_updated, etc.)

---

## Security Notes

- ✅ All examples use authentication (Header Auth)
- ✅ Always use HTTPS webhook URLs in production
- ✅ Never commit credentials to version control
- ✅ Rotate authentication tokens every 90 days
- ✅ Use different credentials for dev/staging/production

---

## Creating Your Own Workflows

Use these as templates and add your own processing:

**Popular integrations:**
- **Email** - Send customer notifications
- **Google Sheets** - Log work items
- **Discord** - Team notifications
- **Trello** - Create cards for work items
- **Airtable** - Sync to database
- **Twilio** - Send SMS notifications
- **Webhook** - Call your own APIs

**Pattern:**
```
Webhook → [Process/Filter] → [Integration] → Respond
```

---

## Additional Resources

- [N8N_WEBHOOK_SETUP.md](../../../N8N_WEBHOOK_SETUP.md) - Complete webhook setup guide
- [N8N_AUTHENTICATION.md](../../../N8N_AUTHENTICATION.md) - Authentication deep-dive
- [n8n Documentation](https://docs.n8n.io/) - Official n8n docs

---

**Questions or issues?** Check the monitoring guide: [MONITORING_INTEGRATIONS.md](../../../MONITORING_INTEGRATIONS.md)
