# n8n Webhook Authentication Guide

Complete guide to securing your n8n webhooks with proper authentication methods.

## Table of Contents

- [Why Authentication is Critical](#why-authentication-is-critical)
- [Authentication Methods Comparison](#authentication-methods-comparison)
- [Option A: No Authentication](#option-a-no-authentication-testing-only)
- [Option B: Header Authentication](#option-b-header-authentication-recommended)
- [Option C: Basic Authentication](#option-c-basic-authentication)
- [Option D: HMAC Signature Verification](#option-d-hmac-signature-verification-most-secure)
- [Security Best Practices](#security-best-practices)
- [Testing Authentication](#testing-authentication)
- [Troubleshooting](#troubleshooting)

---

## Why Authentication is Critical

Without authentication, **anyone** who discovers your webhook URL can:
- ❌ Send fake WorkItem data to your n8n workflows
- ❌ Trigger spam notifications to Slack/Email
- ❌ Pollute your Notion database with fake records
- ❌ Cause system overload with excessive requests
- ❌ Access sensitive business logic

**Your webhook URL should be treated like a password.**

### Real-World Scenario

Imagine your webhook URL is:
```
https://n8n.serwisfixed.pl/webhook/abc123
```

Without authentication:
1. Someone finds this URL (logs, network traffic, etc.)
2. They send fake data:
   ```bash
   curl -X POST https://n8n.serwisfixed.pl/webhook/abc123 \
     -d '{"workitem": {"reference_id": "FAKE-999"}}'
   ```
3. Your Slack gets spammed ❌
4. Fake records in Notion ❌
5. Customers receive fake emails ❌

**With authentication, unauthorized requests are rejected immediately!** ✅

---

## Authentication Methods Comparison

| Method | Security Level | Setup Difficulty | Use Case | Recommended |
|--------|---------------|------------------|----------|-------------|
| **None** | ❌ Very Low | Very Easy | Testing only | No |
| **Header Auth** | ✅ Good | Easy | Most use cases | **Yes** ⭐ |
| **Basic Auth** | ✅ Good | Easy | Traditional systems | Yes |
| **HMAC Signature** | ✅✅ Excellent | Medium | High-security production | Yes (advanced) |

### Quick Recommendation

**For most users:**
→ Use **Header Authentication** (Option B) ⭐

**Why:**
- ✅ Simple to set up
- ✅ Secure (uses secret token)
- ✅ Widely used industry standard
- ✅ Easy to rotate credentials
- ✅ Works with all n8n versions

**For high-security environments:**
→ Use **HMAC Signature** (Option D)

**For your current setup (from screenshot):**
→ You have **Basic Auth** selected - this is fine! See Option C below.

---

## Option A: No Authentication (Testing Only)

**⚠️ DO NOT USE IN PRODUCTION**

### When to Use

- ✅ Local development on your machine
- ✅ Testing webhook payload structure
- ✅ Quick proof-of-concept

### n8n Configuration

**Webhook Node Settings:**
```
Authentication: None
```

That's it! No credentials needed.

### Django Configuration

**TenantIntegration:**
```
Name: n8n - Test (No Auth)
Webhook URL: https://n8n.serwisfixed.pl/webhook-test/abc123
Headers: {} (empty)
```

### Testing

```bash
curl -X POST "https://n8n.serwisfixed.pl/webhook-test/abc123" \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

### ⚠️ Security Risk

Anyone with the URL can send requests:
```bash
# Malicious user
curl -X POST "https://n8n.serwisfixed.pl/webhook/abc123" \
  -d '{"workitem": {"reference_id": "SPAM-999"}}'
```

**Never use this in production or with real data!**

---

## Option B: Header Authentication (Recommended) ⭐

**Best balance of security and simplicity.**

### How It Works

1. Django sends a secret token in HTTP header
2. n8n verifies the token matches
3. If match → process request ✅
4. If no match → reject with 403 Forbidden ❌

### Step 1: Generate a Secret Token

```bash
# Generate a random secret token
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

Example output:
```
vK8k9x2L4mP7qR3tY6wZ1aB5cD8eF0gH2iJ4kL6mN8oP
```

**Save this token securely!**

---

### Step 2: Configure n8n

#### Create Header Auth Credentials

1. In n8n, go to **Credentials** (left sidebar)
2. Click **"+ Add Credential"**
3. Search for **"Header Auth"**
4. Fill in:
   - **Name**: `Django Integration Auth`
   - **Header Name**: `X-API-Key` (or any custom name)
   - **Header Value**: `vK8k9x2L4mP7qR3tY6wZ1aB5cD8eF0gH2iJ4kL6mN8oP`
5. Click **Save**

**What this looks like:**

```
┌────────────────────────────────────┐
│ Create New Credentials             │
├────────────────────────────────────┤
│ Credential Type: Header Auth       │
│                                    │
│ Name: Django Integration Auth      │
│                                    │
│ Header Name: X-API-Key             │
│                                    │
│ Header Value:                      │
│ vK8k9x2L4mP7qR3tY6wZ1aB...        │
│                                    │
│ [ Save ]                           │
└────────────────────────────────────┘
```

#### Configure Webhook Node

1. Open your Webhook node
2. Click **Authentication** dropdown
3. Select **"Header Auth"**
4. Click **Credential to connect with**
5. Select **"Django Integration Auth"**
6. Save

**Result:**

```
┌─────────────────────────────────────┐
│ Webhook                             │
├─────────────────────────────────────┤
│ Authentication: Header Auth         │
│ Credential: Django Integration Auth │
└─────────────────────────────────────┘
```

---

### Step 3: Configure Django

In Django admin:

1. Go to **Integrations → Tenant Integrations**
2. Edit your integration
3. In the **Headers** field, add:
   ```json
   {
     "X-API-Key": "vK8k9x2L4mP7qR3tY6wZ1aB5cD8eF0gH2iJ4kL6mN8oP"
   }
   ```
4. **Important:** Header name must match exactly (`X-API-Key`)
5. Click **Save**

**What this looks like in admin:**

```
┌────────────────────────────────────────────────┐
│ Webhook Configuration                          │
├────────────────────────────────────────────────┤
│ Headers:                                       │
│ ┌────────────────────────────────────────────┐ │
│ │ {                                          │ │
│ │   "X-API-Key": "vK8k9x2L4m...kL6mN8oP"    │ │
│ │ }                                          │ │
│ └────────────────────────────────────────────┘ │
│                                                │
│ Optional HTTP headers to include...            │
└────────────────────────────────────────────────┘
```

---

### Step 4: Test

```bash
# Test WITH auth token (should work)
curl -X POST "https://n8n.serwisfixed.pl/webhook/abc123" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: vK8k9x2L4mP7qR3tY6wZ1aB5cD8eF0gH2iJ4kL6mN8oP" \
  -d '{"test": "authenticated"}'
# ✅ Success: 200 OK

# Test WITHOUT auth token (should fail)
curl -X POST "https://n8n.serwisfixed.pl/webhook/abc123" \
  -H "Content-Type: application/json" \
  -d '{"test": "no auth"}'
# ❌ Fail: 403 Forbidden
```

---

### Custom Header Names

You can use any header name:

**Examples:**
- `X-API-Key` ← Recommended
- `X-Secret-Token`
- `Authorization` (if not using Bearer)
- `X-Webhook-Secret`
- `X-Custom-Auth`

**Django config:**
```json
{
  "X-Webhook-Secret": "your-token-here"
}
```

**n8n credential:**
```
Header Name: X-Webhook-Secret
Header Value: your-token-here
```

---

### Advantages

✅ **Simple**: Easy to set up and understand
✅ **Secure**: Token is secret and validated
✅ **Flexible**: Use any header name
✅ **Standard**: Widely used pattern (like API keys)
✅ **Rotatable**: Easy to change token
✅ **Debuggable**: Easy to test with curl

### Disadvantages

⚠️ Token sent in every request (HTTPS required)
⚠️ No request signature validation (use HMAC for that)

---

## Option C: Basic Authentication

**What you have in your screenshot!**

### How It Works

1. Django sends username:password in `Authorization` header
2. n8n decodes and verifies credentials
3. If match → process request ✅
4. If no match → reject with 401 Unauthorized ❌

### Step 1: Choose Username and Password

**Example:**
- Username: `django-integration`
- Password: `H7yT9kL2mP5qR8wX3zA6cF1eG4iJ7nO0`

**Generate strong password:**
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(24))"
```

---

### Step 2: Configure n8n

#### Create Basic Auth Credentials

1. In n8n, go to **Credentials**
2. Click **"+ Add Credential"**
3. Search for **"Basic Auth"**
4. Fill in:
   - **Name**: `Django Integration Basic Auth`
   - **User**: `django-integration`
   - **Password**: `H7yT9kL2mP5qR8wX3zA6cF1eG4iJ7nO0`
5. Click **Save**

#### Configure Webhook Node

1. Open Webhook node
2. **Authentication**: Select `Basic Auth`
3. **Credential to connect with**: Select `Django Integration Basic Auth`
4. Save

---

### Step 3: Configure Django

In Django admin (**TenantIntegration → Headers**):

```json
{
  "Authorization": "Basic ZGphbmdvLWludGVncmF0aW9uOkg3eVQ5a0wybVA1cVI4d1gzekE2Y0YxZUc0aUo3bk8w"
}
```

**How to get the encoded value:**

```bash
# Method 1: Use echo + base64
echo -n "django-integration:H7yT9kL2mP5qR8wX3zA6cF1eG4iJ7nO0" | base64
```

Output:
```
ZGphbmdvLWludGVncmF0aW9uOkg3eVQ5a0wybVA1cVI4d1gzekE2Y0YxZUc0aUo3bk8w
```

**Method 2: Use Python:**
```python
import base64
username = "django-integration"
password = "H7yT9kL2mP5qR8wX3zA6cF1eG4iJ7nO0"
credentials = f"{username}:{password}"
encoded = base64.b64encode(credentials.encode()).decode()
print(f"Basic {encoded}")
```

Output:
```
Basic ZGphbmdvLWludGVncmF0aW9uOkg3eVQ5a0wybVA1cVI4d1gzekE2Y0YxZUc0aUo3bk8w
```

**Django Admin Configuration:**

```json
{
  "Authorization": "Basic ZGphbmdvLWludGVncmF0aW9uOkg3eVQ5a0wybVA1cVI4d1gzekE2Y0YxZUc0aUo3bk8w"
}
```

---

### Step 4: Test

```bash
# Test WITH Basic Auth (should work)
curl -X POST "https://n8n.serwisfixed.pl/webhook/abc123" \
  -H "Content-Type: application/json" \
  -u "django-integration:H7yT9kL2mP5qR8wX3zA6cF1eG4iJ7nO0" \
  -d '{"test": "authenticated"}'
# ✅ Success: 200 OK

# Or with Authorization header directly
curl -X POST "https://n8n.serwisfixed.pl/webhook/abc123" \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic ZGphbmdvLWludGVncmF0aW9uOkg3eVQ5a0wybVA1cVI4d1gzekE2Y0YxZUc0aUo3bk8w" \
  -d '{"test": "authenticated"}'
# ✅ Success: 200 OK

# Test WITHOUT auth (should fail)
curl -X POST "https://n8n.serwisfixed.pl/webhook/abc123" \
  -H "Content-Type: application/json" \
  -d '{"test": "no auth"}'
# ❌ Fail: 401 Unauthorized
```

---

### Advantages

✅ **Standard**: Well-known HTTP authentication method
✅ **Built-in**: Supported by all HTTP clients
✅ **Simple**: Just username + password

### Disadvantages

⚠️ Credentials must be base64 encoded
⚠️ Requires HTTPS (credentials are only base64, not encrypted)
⚠️ Slightly more complex than Header Auth

---

## Option D: HMAC Signature Verification (Most Secure)

**For high-security production environments.**

### How It Works

1. Django generates a signature using a secret key + request body
2. Django sends the signature in a header
3. n8n recalculates the signature using the same secret + body
4. If signatures match → request is authentic ✅
5. If signatures don't match → request was tampered ❌

**Benefits:**
- ✅ Verifies request wasn't modified in transit
- ✅ Verifies request came from Django (has the secret)
- ✅ No credentials in the request (just a signature)
- ✅ Industry standard (used by GitHub, Stripe, Shopify)

---

### Implementation Overview

**Note:** This requires custom implementation in Django. n8n doesn't have built-in HMAC support, so you'll need a Function node to verify signatures.

#### Step 1: Update Django Integration Task

Modify `backend/integrations/tasks.py` to add HMAC signature:

```python
import hmac
import hashlib
import json

def generate_signature(payload, secret):
    """Generate HMAC SHA256 signature."""
    message = json.dumps(payload, sort_keys=True).encode()
    signature = hmac.new(
        secret.encode(),
        message,
        hashlib.sha256
    ).hexdigest()
    return signature

# In send_integration_webhook task, before making request:
if integration.hmac_secret:  # New field to add
    signature = generate_signature(payload, integration.hmac_secret)
    headers['X-Hub-Signature-256'] = f'sha256={signature}'
```

#### Step 2: Add HMAC Secret to TenantIntegration Model

Add a field to store the HMAC secret:

```python
# backend/integrations/models.py
class TenantIntegration(models.Model):
    # ... existing fields ...
    hmac_secret = models.CharField(
        max_length=255,
        blank=True,
        help_text="Secret for HMAC signature verification"
    )
```

#### Step 3: Configure n8n to Verify Signature

Add a Function node after Webhook to verify:

```javascript
// Function node in n8n
const crypto = require('crypto');

// Get the signature from header
const receivedSignature = $json.headers['x-hub-signature-256'];
const secret = 'your-shared-secret-key';

// Recalculate signature from body
const body = JSON.stringify($json.body);
const calculatedSignature = 'sha256=' + crypto
  .createHmac('sha256', secret)
  .update(body)
  .digest('hex');

// Compare signatures
if (receivedSignature !== calculatedSignature) {
  throw new Error('Invalid signature - request not authenticated!');
}

// Signature is valid, continue processing
return { json: $json.body };
```

#### Workflow Structure

```
Webhook → Function (Verify HMAC) → Process Data → Respond
                ↓ (invalid)
              Error (403)
```

---

### Advantages

✅ **Highest security**: Verifies request integrity
✅ **Industry standard**: Used by major platforms
✅ **Tamper-proof**: Detects modified requests
✅ **Replay protection**: Can add timestamp validation

### Disadvantages

⚠️ **Complex**: Requires custom code in Django and n8n
⚠️ **Not built-in**: Need Function node in n8n
⚠️ **Harder to debug**: Signature mismatches can be cryptic

**Recommendation:** Only use if you need the extra security. For most use cases, Header Auth is sufficient.

---

## Security Best Practices

### 1. Always Use HTTPS

**Never send webhooks over HTTP!**

❌ Bad:
```
http://n8n.example.com/webhook/abc123
```

✅ Good:
```
https://n8n.example.com/webhook/abc123
```

**Why:** HTTP sends credentials in plain text, anyone sniffing network traffic can steal them.

---

### 2. Use Strong Secrets

**Bad secrets:**
```
password123
secret
mytoken
```

**Good secrets:**
```
vK8k9x2L4mP7qR3tY6wZ1aB5cD8eF0gH2iJ4kL6mN8oP
H7yT9kL2mP5qR8wX3zA6cF1eG4iJ7nO0pQ2rT5uV8xY
```

**Generate with:**
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

---

### 3. Rotate Credentials Regularly

**Recommended schedule:**
- **Production**: Every 90 days
- **Staging**: Every 180 days
- **After security incident**: Immediately

**How to rotate:**
1. Generate new secret token
2. Update n8n credentials
3. Update Django TenantIntegration headers
4. Test thoroughly
5. Deactivate old credentials

---

### 4. Store Secrets Securely

**❌ Don't:**
- Commit secrets to Git
- Share in Slack/Email
- Store in plain text files

**✅ Do:**
- Use environment variables
- Use secret management tools (AWS Secrets Manager, Vault)
- Store encrypted in database
- Use Django admin (database-backed)

---

### 5. Limit IP Access (If Possible)

If your Django server has a static IP, configure n8n to only accept requests from that IP.

**In n8n:**
1. Open Webhook node
2. Click **Options** → **IP(s) Whitelist**
3. Enter your server IP: `203.0.113.42`
4. Save

**Now only requests from that IP are accepted!**

---

### 6. Monitor Authentication Failures

**Set up alerts for:**
- Multiple failed authentication attempts
- Requests from unknown IPs
- Unusual request patterns

**In n8n:**
- Check Executions tab for failed requests
- Look for 401/403 errors
- Investigate the source

**In Django:**
- Check IntegrationSync for failed syncs
- Review error messages
- Correlate with n8n failures

---

### 7. Use Different Credentials per Environment

**Don't reuse credentials!**

| Environment | Credential |
|-------------|------------|
| Development | `dev-secret-abc123` |
| Staging | `staging-secret-xyz789` |
| Production | `prod-secret-mnp456` |

**Why:** If dev credentials leak, production is still secure.

---

## Testing Authentication

### Test Checklist

- [ ] **Valid credentials work** - Webhook accepts authenticated requests
- [ ] **Invalid credentials rejected** - Returns 401/403
- [ ] **Missing credentials rejected** - Returns 401/403
- [ ] **Wrong header name rejected** - Returns 401/403
- [ ] **Malformed credentials rejected** - Returns 401/403

---

### Test Valid Credentials

**Header Auth:**
```bash
curl -v -X POST "https://n8n.serwisfixed.pl/webhook/abc123" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR-SECRET-TOKEN" \
  -d '{"test": "valid"}'

# Expected: HTTP 200 OK
```

**Basic Auth:**
```bash
curl -v -X POST "https://n8n.serwisfixed.pl/webhook/abc123" \
  -H "Content-Type: application/json" \
  -u "username:password" \
  -d '{"test": "valid"}'

# Expected: HTTP 200 OK
```

---

### Test Invalid Credentials

**Wrong token:**
```bash
curl -v -X POST "https://n8n.serwisfixed.pl/webhook/abc123" \
  -H "X-API-Key: WRONG-TOKEN" \
  -d '{"test": "invalid"}'

# Expected: HTTP 403 Forbidden
```

**Missing token:**
```bash
curl -v -X POST "https://n8n.serwisfixed.pl/webhook/abc123" \
  -d '{"test": "no auth"}'

# Expected: HTTP 401 Unauthorized
```

---

### Test from Django

1. Create a WorkItem or update one
2. Check Celery logs:
   ```bash
   docker-compose logs -f celery_worker
   ```
3. Look for:
   - ✅ `Successfully synced WorkItem:XXX`
   - ❌ `Request failed: 403 Forbidden` (auth error)

4. Check IntegrationSync in admin:
   - Status should be "Synced" ✅
   - If "Failed", check `last_error` field

---

## Troubleshooting

### Issue: 403 Forbidden

**Cause:** Authentication failed.

**Check:**
1. **Header name matches exactly**
   - n8n: `X-API-Key`
   - Django: `"X-API-Key": "..."`
   - Case-sensitive!

2. **Token/password matches exactly**
   - No extra spaces
   - No quotes in the token value
   - Copy-paste to avoid typos

3. **Using correct credential in n8n**
   - Webhook node → Authentication
   - Verify selected credential

**Test manually:**
```bash
curl -v -X POST "YOUR-WEBHOOK-URL" \
  -H "X-API-Key: YOUR-TOKEN" \
  -d '{"test": "debug"}'
```

Look at response headers for clues.

---

### Issue: 401 Unauthorized

**Cause:** No authentication provided or wrong format.

**For Basic Auth:**
Check the Authorization header is formatted correctly:
```
Authorization: Basic <base64-encoded-credentials>
```

**Verify encoding:**
```bash
echo -n "username:password" | base64
# Should match what's in Django headers
```

---

### Issue: Header Not Being Sent

**Check Django IntegrationSync:**
1. Admin → Integration Syncs
2. Find recent sync
3. Click to view details
4. Check `request_payload` field
5. Verify headers are included

**Common mistake:**
```json
// ❌ Wrong - headers as string
{
  "headers": "X-API-Key: token123"
}

// ✅ Correct - headers as JSON object
{
  "headers": {
    "X-API-Key": "token123"
  }
}
```

---

### Issue: Works in curl, Fails from Django

**Possible causes:**

1. **Headers not configured in Django admin**
   - Check TenantIntegration → Headers field
   - Should be valid JSON

2. **Headers field empty**
   - Must contain authentication headers

3. **Case sensitivity**
   - `X-API-Key` ≠ `x-api-key`
   - Use exact case from n8n

**Debug:**
```bash
docker-compose exec web python manage.py shell
```

```python
from integrations.models import TenantIntegration

integration = TenantIntegration.objects.first()
print(integration.headers)
# Should show: {'X-API-Key': 'your-token'}
```

---

### Issue: Intermittent Authentication Failures

**Possible causes:**

1. **Credential rotation in progress**
   - Old token still in use somewhere
   - n8n credential updated but Django not updated (or vice versa)

2. **Multiple integrations with different credentials**
   - Check which integration is triggering
   - Verify correct credential for that integration

3. **Network issues**
   - Request timeout before auth completes
   - Check Celery task timeout settings

---

## Next Steps

1. ✅ **Choose authentication method**
   - Recommended: Header Auth (Option B)
   - Your setup: Basic Auth (Option C) - works great!

2. ✅ **Configure n8n credentials**
   - Create credential in n8n
   - Assign to Webhook node

3. ✅ **Configure Django headers**
   - Update TenantIntegration in admin
   - Add authentication headers

4. ✅ **Test thoroughly**
   - Valid credentials → should work
   - Invalid credentials → should fail with 403

5. ✅ **Monitor in production**
   - Check n8n Executions tab
   - Check Django IntegrationSync
   - Look for authentication errors

---

## Additional Resources

- **[N8N_WEBHOOK_SETUP.md](N8N_WEBHOOK_SETUP.md)** - Webhook configuration guide
- **[MONITORING_INTEGRATIONS.md](MONITORING_INTEGRATIONS.md)** - Debug integration issues
- **[n8n Webhook Credentials Docs](https://docs.n8n.io/integrations/builtin/credentials/webhook/)** - Official n8n documentation

---

**Your webhook is now secured!** 🔒

Remember to:
- Use HTTPS always
- Rotate credentials regularly
- Monitor authentication failures
- Test after any credential changes
