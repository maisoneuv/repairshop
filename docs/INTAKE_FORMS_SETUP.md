# Intake Forms Feature - Setup Guide

This guide will help you set up the new intake form generation feature for your Fixed Service application.

## Overview

The intake forms feature allows you to:
- Automatically generate PDF intake forms when work items are created
- Manually regenerate forms for existing work items
- Customize form templates via Django admin
- Download and view generated PDFs
- Track generation history and status

## Prerequisites

- Docker and Docker Compose installed
- PostgreSQL database running
- Redis running (for Celery)
- Celery worker running

---

## Installation Steps

### 1. Install Python Dependencies

The required dependencies have been added to `requirements.txt`. Install them in your Docker container:

```bash
docker-compose exec web pip install -r requirements.txt
```

**New dependencies:**
- `playwright==1.48.0` - For PDF generation
- `django-ckeditor==6.7.0` - For rich HTML template editing
- `Pillow==10.4.0` - Image processing support

### 2. Install Playwright Browsers

Playwright requires browser binaries to be installed. Run this command in your Docker container:

```bash
docker-compose exec web playwright install chromium
```

Or if running locally:
```bash
playwright install chromium
```

### 3. Create Database Migrations

The `documents` app has been created with two models: `FormTemplate` and `FormDocument`. Create and run migrations:

```bash
# Create migrations
docker-compose exec web python manage.py makemigrations documents

# Run migrations
docker-compose exec web python manage.py migrate
```

### 4. Create Media Directory

PDF files will be stored in the `media` directory. Create it if it doesn't exist:

```bash
mkdir -p backend/media
```

Ensure proper permissions:
```bash
chmod 755 backend/media
```

### 5. Restart Services

Restart all services to pick up the new code and dependencies:

```bash
docker-compose restart
```

Make sure Celery worker is running to process PDF generation tasks:
```bash
docker-compose logs -f celery_worker
```

---

## Initial Setup

### 1. Create Default Intake Template

You have two options for creating the default template:

#### Option A: Via Django Admin (Recommended)

1. Log in to Django admin: `http://localhost:8008/admin/`
2. Navigate to **Documents > Form Templates**
3. Click **Add Form Template**
4. Fill in:
   - **Form type:** Intake Form
   - **Name:** Default Intake Form
   - **Is active:** ✓ (checked)
   - **HTML content:** Copy the content from `backend/documents/fixtures/default_intake_template.html`
5. Click **Save**

#### Option B: Via Data Migration

Create a data migration to automatically seed the template for all tenants:

```bash
docker-compose exec web python manage.py makemigrations documents --empty --name seed_default_template
```

Edit the migration file (`backend/documents/migrations/XXXX_seed_default_template.py`) and add:

```python
from django.db import migrations

def create_default_templates(apps, schema_editor):
    FormTemplate = apps.get_model('documents', 'FormTemplate')
    Tenant = apps.get_model('tenants', 'Tenant')

    # Load HTML from fixture file
    import os
    from django.conf import settings

    fixture_path = os.path.join(
        settings.BASE_DIR,
        'documents',
        'fixtures',
        'default_intake_template.html'
    )

    with open(fixture_path, 'r', encoding='utf-8') as f:
        html_content = f.read()

    # Create template for each tenant
    for tenant in Tenant.objects.all():
        FormTemplate.objects.get_or_create(
            tenant=tenant,
            form_type='intake',
            defaults={
                'name': 'Default Intake Form',
                'html_content': html_content,
                'is_active': True
            }
        )

class Migration(migrations.Migration):
    dependencies = [
        ('documents', 'XXXX_initial'),  # Replace with your initial migration
        ('tenants', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(create_default_templates),
    ]
```

Then run:
```bash
docker-compose exec web python manage.py migrate
```

### 2. Grant Template Management Permission

To allow users to manage templates, grant the `manage_templates` permission:

1. Go to Django admin > Users
2. Select a user
3. In User permissions, add: `documents | form template | Can create, edit, and delete form templates`
4. Save

Or grant to a group:
1. Django admin > Groups
2. Select/create a group (e.g., "Managers")
3. Add the permission
4. Add users to the group

---

## Usage

### Auto-Generation

Intake forms are **automatically generated** when new work items are created:

1. Create a new work item via the UI or API
2. A Celery task is queued to generate the intake form
3. The form appears in the work item detail page under "Intake Forms"
4. Check Celery worker logs for generation status

### Manual Generation

To manually generate an intake form for an existing work item:

1. Open a work item detail page
2. Scroll to the **Intake Forms** section (right sidebar)
3. Click **Generate Intake Form** button
4. Wait for generation (usually 2-5 seconds)
5. Refresh the page or wait for auto-refresh
6. The new form will appear in the list

### Downloading PDFs

1. Find the generated form in the **Intake Forms** section
2. Click the **Download** button
3. The PDF will be downloaded to your browser

### Template Management (Django Admin)

#### Viewing Templates
1. Go to Django admin
2. Navigate to **Documents > Form Templates**
3. View all templates for your tenant

#### Creating a New Template
1. Click **Add Form Template**
2. Select form type (e.g., Intake Form)
3. Enter a name
4. Paste or write HTML content with `{{variables}}`
5. Check **Is active** to use this template
6. Save

#### Available Variables

Use these variables in your HTML template:

**Customer:**
- `{{customer.full_name}}` or `{{fio}}`
- `{{customer.phone}}` or `{{phone}}`
- `{{customer.email}}` or `{{email}}`
- `{{customer.address}}`

**Work Item:**
- `{{workitem.reference_id}}` or `{{id}}`
- `{{workitem.created_date}}` or `{{now}}`
- `{{workitem.prepaid_amount}}` or `{{prepay}}`
- `{{workitem.description}}` or `{{defect}}`
- `{{workitem.device_condition}}` or `{{comment}}`
- `{{workitem.accessories}}` or `{{complect}}`

**Device:**
- `{{asset.device_name}}` or `{{product}}`
- `{{asset.serial_number}}` or `{{serial}}`

**Staff:**
- `{{owner.full_name}}` or `{{accepter}}`
- `{{technician.full_name}}`

**See the admin help text for complete list.**

#### Activating/Deactivating Templates
- Only **one template** per form type can be active per tenant
- Activating a template automatically deactivates others of the same type
- Use admin actions: "Activate selected templates"

#### Duplicating Templates
- Select a template
- Use admin action: "Duplicate selected templates"
- Edit the duplicate as needed

---

## Troubleshooting

### PDFs Not Generating

1. **Check Celery worker is running:**
   ```bash
   docker-compose logs celery_worker
   ```

2. **Check for errors in Celery logs:**
   ```bash
   docker-compose logs -f celery_worker | grep ERROR
   ```

3. **Verify Playwright is installed:**
   ```bash
   docker-compose exec web playwright --version
   ```

4. **Verify template exists and is active:**
   - Go to Django admin > Form Templates
   - Check that at least one "Intake Form" template is marked active

### Permission Denied Errors

Check media directory permissions:
```bash
ls -la backend/media/
```

Ensure the Docker user can write to this directory:
```bash
chmod -R 755 backend/media/
```

### Template Variable Not Showing

1. Check spelling of variable (case-sensitive)
2. Verify the work item has that data field populated
3. Check variable mappings in `backend/documents/variables.py`

### Form Shows "Error" Status

1. Check the error message in the Intake Forms section
2. Check FormDocument record in Django admin for full error
3. Common issues:
   - Template has syntax errors
   - Missing required data (e.g., customer not set)
   - Playwright browser not installed

### Celery Task Timeout

If PDF generation takes too long:
1. Check `CELERY_TASK_TIME_LIMIT` in settings (default: 30 minutes)
2. Simplify your HTML template (remove heavy images/styles)
3. Check server resources (CPU/memory)

---

## File Structure

```
backend/
├── documents/               # New Django app
│   ├── models.py           # FormTemplate, FormDocument models
│   ├── views.py            # API endpoints
│   ├── serializers.py      # DRF serializers
│   ├── admin.py            # Admin interface
│   ├── tasks.py            # Celery tasks
│   ├── signals.py          # Auto-generation signal
│   ├── variables.py        # Variable mapping system
│   ├── pdf_generator.py    # Playwright PDF generation
│   ├── urls.py             # URL routing
│   └── fixtures/
│       └── default_intake_template.html
├── media/                   # Generated PDFs stored here
│   └── documents/
│       └── {tenant_id}/
│           └── intake/
│               └── {work_item_ref}/
│                   └── intake_form_TIMESTAMP.pdf

frontend/
├── src/
│   ├── api/
│   │   └── documents.js    # API client
│   ├── components/
│   │   └── FormDocumentsSection.jsx  # UI component
│   └── pages/
│       └── WorkItemDetail.jsx  # Updated to show intake forms
```

---

## API Endpoints

### Work Item Documents

```
GET  /api/documents/work-items/{id}/documents/     # List documents
POST /api/documents/work-items/{id}/documents/     # Generate document
```

### Templates (Admin)

```
GET    /api/documents/templates/                   # List templates
POST   /api/documents/templates/                   # Create template
GET    /api/documents/templates/{id}/              # Get template
PATCH  /api/documents/templates/{id}/              # Update template
DELETE /api/documents/templates/{id}/              # Delete template
POST   /api/documents/templates/{id}/activate/     # Activate
POST   /api/documents/templates/{id}/deactivate/   # Deactivate
GET    /api/documents/templates/available_variables/  # Get variable list
```

### Documents

```
GET /api/documents/documents/                      # List all documents
GET /api/documents/documents/{id}/                 # Get document
GET /api/documents/documents/{id}/download/        # Download PDF
```

---

## Production Considerations

### 1. Media File Storage

For production, consider using cloud storage (S3, Google Cloud Storage):

1. Install `django-storages`:
   ```bash
   pip install django-storages boto3
   ```

2. Configure in `settings.py`:
   ```python
   DEFAULT_FILE_STORAGE = 'storages.backends.s3boto3.S3Boto3Storage'
   AWS_STORAGE_BUCKET_NAME = 'your-bucket'
   AWS_S3_REGION_NAME = 'us-east-1'
   ```

### 2. PDF Generation Performance

- PDF generation runs asynchronously via Celery
- Consider scaling Celery workers for high volume
- Monitor task queue length and completion times

### 3. Security

- PDFs are served through Django (authentication required)
- Direct media file access is disabled in production
- Consider adding file encryption for sensitive documents

### 4. Monitoring

Monitor these metrics:
- PDF generation success rate
- Average generation time
- Celery queue depth
- Disk space usage in media directory

---

## Next Steps

### Future Enhancements

1. **Email Integration**
   - Auto-send intake forms to customers via email
   - Email templates with PDF attachment

2. **Additional Form Types**
   - Invoice generation
   - Quote generation
   - Receipt generation
   - Work order completion forms

3. **Digital Signatures**
   - Capture customer signatures electronically
   - Embed signatures in PDFs

4. **Template Marketplace**
   - Share templates between tenants
   - Pre-built template library

5. **Version Control**
   - Track template changes over time
   - Regenerate with specific template version

---

## Support

If you encounter issues:

1. Check the logs:
   - Django: `docker-compose logs web`
   - Celery: `docker-compose logs celery_worker`

2. Enable debug logging in `settings.py`:
   ```python
   LOGGING = {
       'loggers': {
           'documents': {
               'level': 'DEBUG',
           },
       },
   }
   ```

3. Check FormDocument records in Django admin for error messages

4. Review this guide's troubleshooting section

---

## Summary

You now have a complete intake form system that:
- ✅ Auto-generates PDFs when work items are created
- ✅ Allows manual regeneration
- ✅ Provides customizable HTML templates
- ✅ Stores PDFs permanently with metadata
- ✅ Integrates seamlessly with work item workflow
- ✅ Tracks generation history and errors

Enjoy your new intake forms feature! 🎉
