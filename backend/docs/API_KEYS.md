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

**Example:** `sk_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`

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
│ sk_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6                          │
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
curl -H "Authorization: Bearer sk_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6" \
     https://your-domain.com/api/work-items/
```

### Examples

#### List Work Items
```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
     https://your-domain.com/api/work-items/
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
  https://your-domain.com/api/work-items/
```

#### Get Work Item Details
```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
     https://your-domain.com/api/work-items/456/?include=customerDetails,deviceDetails
```

#### Update a Work Item
```bash
curl -X PATCH \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "in_progress",
    "notes": "Started repair process"
  }' \
  https://your-domain.com/api/work-items/456/
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
        "url": "https://your-domain.com/api/work-items/",
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
const API_KEY = 'sk_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
const API_BASE = 'https://your-domain.com/api';

const fetchWorkItems = async () => {
  const response = await fetch(`${API_BASE}/work-items/`, {
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
```

#### Python
```python
import requests

API_KEY = 'sk_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'
API_BASE = 'https://your-domain.com/api'

headers = {
    'Authorization': f'Bearer {API_KEY}',
    'Content-Type': 'application/json'
}

# Get work items
response = requests.get(f'{API_BASE}/work-items/', headers=headers)
work_items = response.json()

# Create work item
new_item = {
    'customer': 123,
    'type': 'repair',
    'description': 'Screen replacement'
}
response = requests.post(f'{API_BASE}/work-items/', json=new_item, headers=headers)
```

## Permissions and Roles

API keys use the same role-based permission system as regular users. When creating an API key, you assign it a role that determines what actions it can perform.

### Common Permission Patterns

#### Read-Only Access
Create a role with these permissions:
- `view_all_workitems`
- `view_all_customers`
- `view_all_tasks`

#### Integration Access (Read + Write)
Create a role with these permissions:
- `view_all_workitems`, `tasks.add_workitem`, `tasks.change_workitem`
- `view_all_customers`, `customers.add_customer`, `customers.change_customer`
- `view_all_tasks`, `tasks.add_task`, `tasks.change_task`

#### Limited Scope
Create a role with only specific permissions:
- `view_all_workitems`, `tasks.add_workitem` (can view and create, but not update)

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
- Test with a simple endpoint like `/api/work-items/`

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
