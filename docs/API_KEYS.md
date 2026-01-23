# API Key Authentication Guide

This document explains how to set up and use API keys for external system integration with your service management application.

## Overview

API keys provide secure, tenant-scoped authentication for external systems to access your REST API endpoints. Each API key:

- Belongs to a specific tenant
- Has role-based permissions (same as user roles)
- Uses Bearer token authentication (`Authorization: Bearer sk_live_...`)
- Includes usage tracking and audit logging
- Can be revoked or expired

## Key Format

API keys follow a Stripe-style format:

```
sk_live_<32-character-random-string>
sk_test_<32-character-random-string>
```

- **`sk`**: Indicates this is a secret key
- **`live`/`test`**: Environment identifier
- **32-character string**: Cryptographically secure random identifier

**Example:** `test_api_key`

## Generating API Keys

### Method 1: Django Admin (Recommended)

1. Log in to Django admin at `/admin`
2. Navigate to **Core > API Keys**
3. Click **Add API Key** button
4. Fill in the required fields:
   - **Name**: Descriptive name (e.g., "n8n Production Integration")
   - **Tenant**: Select the tenant this key belongs to
   - **Role**: Select a role that defines permissions
   - **Expires at**: (Optional) Set an expiration date
   - **Integration**: (Optional) Link to a TenantIntegration
   - **Notes**: (Optional) Additional context
5. Click **Save**
6. **IMPORTANT**: Copy the displayed API key immediately - it will never be shown again!

### Method 2: Management Command (CLI)

```bash
cd backend
python manage.py generate_api_key \
  --tenant=acme \
  --role=5 \
  --name="n8n Production" \
  --environment=live \
  --expires=2025-12-31
```

**Parameters:**
- `--tenant`: Tenant subdomain (required)
- `--role`: Role ID (required)
- `--name`: Descriptive name (required)
- `--environment`: `live` or `test` (default: `live`)
- `--expires`: Expiration date in YYYY-MM-DD format (optional)
- `--notes`: Additional notes (optional)
- `--integration`: Link to TenantIntegration ID (optional)

**Example Output:**
```
======================================================================
API KEY GENERATED SUCCESSFULLY!
======================================================================

IMPORTANT: Copy this key now. It will NEVER be shown again!

┌────────────────────────────────────────────────────────────────────┐
│ test_api_key                          │
└────────────────────────────────────────────────────────────────────┘

Name:        n8n Production
Tenant:      ACME Corp (acme)
Role:        Integration Access
Prefix:      sk_live_abc1...
Active:      True
Created:     2025-01-15 10:30:45
```

## Using API Keys

### Basic Usage

Include the API key in the `Authorization` header with the `Bearer` scheme:

```bash
curl -H "Authorization: Bearer test_api_key" \
     https://your-domain.com/api/tasks/work-items/
```

### Examples

#### List Work Items
```bash
# List all work items
curl -H "Authorization: Bearer YOUR_API_KEY" \
     https://your-domain.com/api/tasks/work-items/

# Filter by status
curl -H "Authorization: Bearer YOUR_API_KEY" \
     "https://your-domain.com/api/tasks/work-items/?status=in_progress"

# Filter by date range (created between dates)
curl -H "Authorization: Bearer YOUR_API_KEY" \
     "https://your-domain.com/api/tasks/work-items/?created_after=2025-01-01&created_before=2025-01-31"

# Filter by customer and date
curl -H "Authorization: Bearer YOUR_API_KEY" \
     "https://your-domain.com/api/tasks/work-items/?customer=123&created_after=2025-01-01"
```

#### Create a Work Item
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "customer": 123,
    "type": "repair",
    "description": "Screen replacement",
    "intake_method": "walkin"
  }' \
  https://your-domain.com/api/tasks/work-items/
```

#### Get Work Item Details (by Reference ID)
```bash
# Search by reference ID (exact match)
curl -H "Authorization: Bearer YOUR_API_KEY" \
     "https://your-domain.com/api/tasks/work-items/?search=RMA-123"

# Returns a list with one item:
# {
#   "count": 1,
#   "results": [
#     {
#       "id": 456,
#       "reference_id": "RMA-123",
#       ...
#     }
#   ]
# }
```

#### Update a Work Item
```bash
# Step 1: Search by reference ID to get the database ID
curl -H "Authorization: Bearer YOUR_API_KEY" \
     "https://your-domain.com/api/tasks/work-items/?search=RMA-123"

# Step 2: Update using the database ID from step 1
curl -X PATCH \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "in_progress",
    "notes": "Started repair process"
  }' \
  https://your-domain.com/api/tasks/work-items/456/
```

### Integration Examples

#### n8n Workflow
```json
{
  "nodes": [
    {
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "GET",
        "url": "https://your-domain.com/api/tasks/work-items/",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "httpHeaderAuth": {
          "name": "Authorization",
          "value": "=Bearer {{ $credentials.apiKey }}"
        }
      }
    }
  ]
}
```

#### JavaScript/TypeScript
```javascript
const API_KEY = 'test_api_key';
const API_BASE = 'https://your-domain.com/api/tasks';

// List all work items
const fetchWorkItems = async (filters = {}) => {
  const params = new URLSearchParams(filters);
  const url = `${API_BASE}/work-items/${params.toString() ? '?' + params.toString() : ''}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
};

// Example: Get work items created in a date range
const getWorkItemsByDateRange = async (startDate, endDate) => {
  return await fetchWorkItems({
    created_after: startDate,   // Format: "2025-01-01"
    created_before: endDate      // Format: "2025-01-31"
  });
};

// Example: Get work items for a customer with status filter
const getCustomerWorkItems = async (customerId, status = null) => {
  const filters = { customer: customerId };
  if (status) filters.status = status;
  return await fetchWorkItems(filters);
};

// Get work item by reference ID
const getWorkItemByReference = async (referenceId) => {
  const response = await fetch(`${API_BASE}/work-items/?search=${referenceId}`, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  if (data.results && data.results.length > 0) {
    return data.results[0]; // Return first match
  }
  throw new Error(`Work item ${referenceId} not found`);
};

// Get work item by database ID
const getWorkItem = async (id) => {
  const response = await fetch(`${API_BASE}/work-items/${id}/?include=customerDetails,deviceDetails`, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
};

// Update work item by reference ID (two-step process)
const updateWorkItemByReference = async (referenceId, updates) => {
  // Step 1: Get the work item to find its database ID
  const workItem = await getWorkItemByReference(referenceId);

  // Step 2: Update using database ID
  const response = await fetch(`${API_BASE}/work-items/${workItem.id}/`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
};
```

#### Python
```python
import requests

API_KEY = 'test_api_key'
API_BASE = 'https://your-domain.com/api/tasks'

headers = {
    'Authorization': f'Bearer {API_KEY}',
    'Content-Type': 'application/json'
}

# List all work items
response = requests.get(f'{API_BASE}/work-items/', headers=headers)
work_items = response.json()

# List work items with filters
def get_work_items(filters=None):
    """Fetch work items with optional filters"""
    params = filters or {}
    response = requests.get(f'{API_BASE}/work-items/', headers=headers, params=params)
    response.raise_for_status()
    return response.json()

# Example: Get work items created in a date range
work_items = get_work_items({
    'created_after': '2025-01-01',
    'created_before': '2025-01-31'
})

# Example: Get work items for a customer with status filter
work_items = get_work_items({
    'customer': 123,
    'status': 'in_progress'
})

# Get work item by reference ID (search)
reference_id = 'RMA-123'
response = requests.get(
    f'{API_BASE}/work-items/?search={reference_id}',
    headers=headers
)
data = response.json()
if data['results']:
    work_item = data['results'][0]
    print(f"Found work item: {work_item['reference_id']} (ID: {work_item['id']})")
else:
    raise ValueError(f"Work item {reference_id} not found")

# Get work item by database ID (with included details)
db_id = work_item['id']
response = requests.get(
    f'{API_BASE}/work-items/{db_id}/?include=customerDetails,deviceDetails',
    headers=headers
)
work_item_details = response.json()

# Create work item
new_item = {
    'customer': 123,
    'type': 'repair',
    'description': 'Screen replacement'
}
response = requests.post(f'{API_BASE}/work-items/', json=new_item, headers=headers)

# Update work item by reference ID (two-step process)
# Step 1: Search to get database ID
reference_id = 'RMA-123'
response = requests.get(f'{API_BASE}/work-items/?search={reference_id}', headers=headers)
data = response.json()
if not data['results']:
    raise ValueError(f"Work item {reference_id} not found")

db_id = data['results'][0]['id']

# Step 2: Update using database ID
updates = {
    'status': 'in_progress',
    'notes': 'Started repair'
}
response = requests.patch(
    f'{API_BASE}/work-items/{db_id}/',
    json=updates,
    headers=headers
)
updated_work_item = response.json()
```

### Filtering and Searching

#### Available Filters

You can filter work items using URL query parameters:

**Basic Filters:**
- `customer` - Filter by customer ID
- `customer_asset` - Filter by asset ID
- `status` - Filter by status (e.g., "New", "in_progress", "completed")
- `type` - Filter by work item type (e.g., "repair", "warranty")
- `owner` - Filter by owner employee ID
- `technician` - Filter by technician employee ID

**Date Range Filters:**
- `created_after` - Work items created on or after this date (format: YYYY-MM-DD)
- `created_before` - Work items created on or before this date (format: YYYY-MM-DD)
- `closed_after` - Work items closed on or after this date
- `closed_before` - Work items closed on or before this date
- `due_after` - Work items due on or after this date
- `due_before` - Work items due on or before this date

**Search:**
- `search` - Search by reference ID, customer name, or customer email (exact match for reference_id)

**Examples:**
```bash
# All work items created in January 2025
GET /api/tasks/work-items/?created_after=2025-01-01&created_before=2025-01-31

# All "in_progress" items for a specific customer
GET /api/tasks/work-items/?customer=123&status=in_progress

# All items due in the next 7 days
GET /api/tasks/work-items/?due_after=2025-01-09&due_before=2025-01-16

# Combine multiple filters
GET /api/tasks/work-items/?status=New&created_after=2025-01-01&technician=5
```

### Working with Reference IDs

**Why the two-step process?**

The API uses database IDs in URLs to maintain compatibility with the existing frontend application. To work with reference IDs (like "RMA-123"), external apps should:

1. **Search by reference ID**: Use `?search=RMA-123` to find the work item
2. **Use database ID for updates**: Extract the `id` from search results and use it for retrieve/update operations

**Benefits:**
- ✅ Exact match search with `=reference_id` in search_fields
- ✅ No breaking changes to frontend
- ✅ Simple, predictable API behavior
- ✅ Can be wrapped in helper functions (see examples above)

## Working with Tasks

Tasks are subtasks within work items. The Task API supports full CRUD operations, advanced filtering, and can filter by parent work item reference ID.

### Task Endpoints

**Base URL:** `/api/tasks/tasks/`

- `GET /api/tasks/tasks/` - List all tasks
- `POST /api/tasks/tasks/` - Create a new task
- `GET /api/tasks/tasks/{id}/` - Retrieve a specific task
- `PATCH /api/tasks/tasks/{id}/` - Update a task
- `DELETE /api/tasks/tasks/{id}/` - Delete a task

### Task Examples

#### List Tasks
```bash
# List all tasks
curl -H "Authorization: Bearer YOUR_API_KEY" \
     https://your-domain.com/api/tasks/tasks/

# Filter by work item reference ID (e.g., all tasks for RMA-123)
curl -H "Authorization: Bearer YOUR_API_KEY" \
     "https://your-domain.com/api/tasks/tasks/?work_item_ref=RMA-123"

# Filter by status
curl -H "Authorization: Bearer YOUR_API_KEY" \
     "https://your-domain.com/api/tasks/tasks/?status=In Progress"

# Filter by date range (created this month)
curl -H "Authorization: Bearer YOUR_API_KEY" \
     "https://your-domain.com/api/tasks/tasks/?created_after=2025-01-01&created_before=2025-01-31"

# Search tasks by summary or description
curl -H "Authorization: Bearer YOUR_API_KEY" \
     "https://your-domain.com/api/tasks/tasks/?search=diagnosis"
```

#### Create a Task
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "work_item": 456,
    "summary": "Diagnose screen issue",
    "description": "Check for hardware or software problem",
    "assigned_employee": 10,
    "status": "To do",
    "due_date": "2025-01-15"
  }' \
  https://your-domain.com/api/tasks/tasks/
```

#### Update a Task
```bash
curl -X PATCH \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "Done",
    "description": "Completed diagnosis - screen replacement needed"
  }' \
  https://your-domain.com/api/tasks/tasks/789/
```

### Task Filtering

**Available Filters:**

**Basic Filters:**
- `work_item` - Filter by work item database ID
- `work_item_ref` - Filter by work item reference ID (e.g., "RMA-123")
- `assigned_employee` - Filter by employee ID
- `status` - Filter by task status
- `task_type` - Filter by task type ID

**Date Range Filters:**
- `created_after` / `created_before` - Filter by creation date
- `due_after` / `due_before` - Filter by due date
- `completed_after` / `completed_before` - Filter by completion date

**Search:**
- `search` - Search by task summary, description, or work item reference ID

**Ordering:**
- `ordering` - Sort by: `created_date`, `summary`, `status`, `assigned_employee`, `task_type__name`
- Default: `-created_date` (newest first)

**Examples:**
```bash
# All tasks for work item RMA-123
GET /api/tasks/tasks/?work_item_ref=RMA-123

# In-progress tasks for work item RMA-123
GET /api/tasks/tasks/?work_item_ref=RMA-123&status=In Progress

# Tasks due this week
GET /api/tasks/tasks/?due_after=2025-01-09&due_before=2025-01-16

# Overdue tasks (due before today, not completed)
GET /api/tasks/tasks/?due_before=2025-01-09&completed_date__isnull=true

# Tasks assigned to employee 5, created this month
GET /api/tasks/tasks/?assigned_employee=5&created_after=2025-01-01

# Search for diagnosis tasks
GET /api/tasks/tasks/?search=diagnosis

# Combine multiple filters
GET /api/tasks/tasks/?work_item_ref=RMA-123&status=To do&assigned_employee=5
```

### Task Code Examples

#### JavaScript/TypeScript
```javascript
// Get all tasks for a work item by reference ID
const getTasksForWorkItem = async (referenceId) => {
  const response = await fetch(`${API_BASE}/tasks/?work_item_ref=${referenceId}`, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  return response.json();
};

// Create a task
const createTask = async (workItemId, taskData) => {
  const response = await fetch(`${API_BASE}/tasks/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      work_item: workItemId,
      ...taskData
    })
  });
  return response.json();
};

// Update task status
const updateTaskStatus = async (taskId, status) => {
  const response = await fetch(`${API_BASE}/tasks/${taskId}/`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status })
  });
  return response.json();
};
```

#### Python
```python
# Get all tasks for a work item by reference ID
reference_id = 'RMA-123'
response = requests.get(
    f'{API_BASE}/tasks/',
    headers=headers,
    params={'work_item_ref': reference_id}
)
tasks = response.json()

# Create a task
new_task = {
    'work_item': 456,
    'summary': 'Diagnose screen issue',
    'description': 'Check for hardware or software problem',
    'assigned_employee': 10,
    'status': 'To do',
    'due_date': '2025-01-15'
}
response = requests.post(f'{API_BASE}/tasks/', json=new_task, headers=headers)

# Update task status
task_id = 789
response = requests.patch(
    f'{API_BASE}/tasks/{task_id}/',
    json={'status': 'Done'},
    headers=headers
)

# Get overdue tasks
from datetime import date
response = requests.get(
    f'{API_BASE}/tasks/',
    headers=headers,
    params={
        'due_before': date.today().isoformat(),
        'status': 'To do'
    }
)
overdue_tasks = response.json()
```

## Permissions and Roles

API keys use the same role-based permission system as regular users. When creating an API key, you assign it a role that determines what actions it can perform.

### Common Permission Patterns

#### Read-Only Access
Create a role with these permissions:
- `view_all_workitems` - View all work items
- `view_all_customers` - View all customers
- `view_all_tasks` - View all tasks

#### Integration Access (Read + Write)
Create a role with these permissions:
- **Work Items:** `view_all_workitems`, `tasks.add_workitem`, `tasks.change_workitem`
- **Tasks:** `view_all_tasks`, `tasks.add_task`, `tasks.change_task`
- **Customers:** `view_all_customers`, `customers.add_customer`, `customers.change_customer`

#### Limited Scope
Create a role with only specific permissions:
- `view_all_workitems`, `tasks.add_workitem` (can view and create work items, but not update)
- `view_all_tasks`, `tasks.add_task` (can view and create tasks, but not update)

### Setting Up Roles

1. Go to Django admin: **Core > Roles**
2. Click **Add Role**
3. Set:
   - **Name**: e.g., "API Integration - Read Only"
   - **Tenant**: Select tenant
   - **Description**: Document what this role is for
4. Click **Save**
5. Go to **Core > Role Permissions**
6. Add permissions for the role you just created

## Managing API Keys

### Viewing API Keys

**Django Admin:**
- Navigate to **Core > API Keys**
- View list of all API keys with:
  - Name, Prefix, Tenant, Role
  - Active status
  - Usage count and last used timestamp
  - Creation date and expiration

### Revoking API Keys

To revoke an API key without deleting it:

**Method 1: Admin Interface**
1. Go to **Core > API Keys**
2. Select the key(s) to revoke
3. Choose action: **Revoke selected API keys**
4. Click **Go**

**Method 2: Manual Edit**
1. Open the API key in admin
2. Uncheck **Is active**
3. Click **Save**

**Note:** Revoked keys are kept in the database for audit purposes. Deletion is disabled to maintain the audit trail.

### Reactivating API Keys

1. Go to **Core > API Keys**
2. Select the revoked key(s)
3. Choose action: **Activate selected API keys**
4. Click **Go**

## Security Best Practices

### Storage
- **Never commit API keys to version control**
- Store keys in environment variables or secret management systems
- Use separate keys for different environments (test vs. production)

### Key Management
- **Set expiration dates** for temporary integrations
- **Use descriptive names** to identify purpose and owner
- **Revoke unused keys** immediately
- **Rotate keys periodically** for high-security applications

### Monitoring
- **Check usage regularly** in Django admin
- **Investigate suspicious activity** (unusual IP addresses, high request counts)
- **Set up alerts** for failed authentication attempts

### Network Security
- Use HTTPS only (never HTTP)
- Consider IP whitelisting for production keys (future feature)
- Implement rate limiting (future feature)

## Troubleshooting

### 401 Unauthorized Error

**Possible causes:**
1. **Invalid key**: The API key is incorrect or has a typo
2. **Inactive key**: The key has been revoked
3. **Expired key**: The key has passed its expiration date
4. **Wrong format**: Missing "Bearer " prefix in Authorization header

**Solution:**
- Verify the key format: `Authorization: Bearer sk_live_...`
- Check key status in Django admin
- Generate a new key if needed

### 403 Forbidden Error

**Possible causes:**
1. **Insufficient permissions**: The API key's role doesn't have required permission
2. **Wrong tenant**: The resource belongs to a different tenant

**Solution:**
- Check the role's permissions in Django admin
- Verify you're accessing resources for the correct tenant
- Update the role permissions if needed

### No Response / Connection Error

**Possible causes:**
1. **Wrong URL**: API endpoint doesn't exist
2. **Server down**: Backend service is not running
3. **Network issue**: DNS, firewall, or routing problem

**Solution:**
- Verify the API base URL
- Check server status: `docker-compose ps`
- Test with a simple endpoint like `/api/tasks/work-items/`

## Migration from Session Auth

The API key system works alongside existing session authentication. Your frontend continues to use session cookies, while external integrations use API keys.

**No changes required** for existing frontend code or user authentication.

## Rate Limiting (Future)

Rate limiting is not currently implemented but is planned for future releases. When implemented, each API key will have:
- Request per minute/hour limits
- Configurable limits per key
- 429 Too Many Requests responses when exceeded

## Audit Logging

Basic audit logging is automatically tracked for each API key:
- **Last used at**: Timestamp of last successful authentication
- **Last used IP**: IP address of last request
- **Usage count**: Total number of successful authentications

For detailed request logging, check your application's server logs.

## Support

For issues or questions:
- Check Django admin logs: **Core > API Keys**
- Review server logs: `docker-compose logs web`
- Contact your system administrator

## API Documentation

For complete API endpoint documentation, see:
- Swagger UI: `https://your-domain.com/api/schema/swagger-ui/`
- ReDoc: `https://your-domain.com/api/schema/redoc/`
- OpenAPI schema: `https://your-domain.com/api/schema/`
