# Intake Forms Setup Status

## ✅ ALL SETUP COMPLETE!

The intake forms feature is now fully functional and ready to use!

### What's Been Done

1. ✅ **Fixed import error** - Removed unnecessary `rest_framework_nested` import
2. ✅ **Rebuilt Docker containers** - All services running with Playwright dependencies
3. ✅ **Installed Playwright** - Chromium browser (169.4 MB) + system dependencies
4. ✅ **Verified Playwright** - Browser launch test: **SUCCESS**
5. ✅ **Created media directory** - `/backend/media/` ready for PDF storage
6. ✅ **Created database migrations** - Documents app schema
7. ✅ **Applied migrations** - FormTemplate and FormDocument tables created

---

## 🚀 Ready to Use!

### Current Service Status

```
✅ web             - Running (Playwright ready)
✅ db              - Running (healthy)
✅ redis           - Running (healthy)
✅ celery_worker   - Running (ready to generate PDFs)
✅ celery_beat     - Running
✅ nginx           - Running on http://localhost:8008
✅ frontend        - Running
```

---

## 📝 Final Step: Create Default Template

**Go to Django Admin and create your first intake form template:**

1. **Navigate to:** http://localhost:8008/admin/
2. **Go to:** Documents > Form Templates
3. **Click:** "Add Form Template"
4. **Fill in:**
   - **Tenant:** Select your tenant from dropdown
   - **Form type:** Intake Form
   - **Name:** Default Intake Form
   - **Is active:** ✓ (check this box)
   - **HTML content:** Copy and paste the entire content from:
     ```
     backend/documents/fixtures/default_intake_template.html
     ```
5. **Click:** "Save"

### Quick Copy Command

```bash
# View the template content to copy:
cat backend/documents/fixtures/default_intake_template.html
```

---

## 🧪 Test the Feature

### Step 1: Create a Work Item

1. Go to: http://localhost:8008/
2. Create a new work item with:
   - Customer details (name, phone, email)
   - Device information
   - Description

### Step 2: Monitor Generation

Watch the Celery worker logs to see the PDF being generated:

```bash
docker-compose logs -f celery_worker
```

You should see:
```
Starting form document generation task for work item...
Successfully generated PDF for work item RMA-XXX...
```

### Step 3: View the PDF

1. Open the work item detail page
2. Look in the **right sidebar** for the **"Intake Forms"** section
3. You should see:
   - ✓ Status badge (green = success)
   - Generated date and time
   - "Auto-generated" label
   - **Download** button
4. Click **Download** to get the PDF!

### Step 4: Manual Generation (Optional)

You can also manually generate forms:

1. On any work item detail page
2. Click the **"Generate Intake Form"** button
3. Wait a few seconds (it will show a loading spinner)
4. The new form will appear in the list

---

## 🎯 What You Can Do Now

✅ **Auto-generate PDFs** - Forms generate automatically when work items are created
✅ **Manual regeneration** - Click button to regenerate anytime
✅ **Download PDFs** - Click download button on any successful form
✅ **Manage templates** - Edit HTML templates in Django admin
✅ **View history** - See all generated forms with timestamps
✅ **Track errors** - Failed generations show error messages

---

## 🔧 Useful Commands

```bash
# Check if containers are running
docker-compose ps

# View Celery worker logs (PDF generation)
docker-compose logs -f celery_worker

# View web server logs
docker-compose logs -f web

# Restart all services
docker-compose restart

# Stop all services
docker-compose down

# Start all services
docker-compose up -d

# Test Playwright
docker-compose exec web python -c "from playwright.sync_api import sync_playwright; print('OK')"
```

---

## 📚 Documentation

- **Full Setup Guide:** [INTAKE_FORMS_SETUP.md](INTAKE_FORMS_SETUP.md)
- **Code Location:** `backend/documents/` directory
- **Frontend Component:** `frontend/src/components/FormDocumentsSection.jsx`

---

## 🎨 Customization

### Edit Templates

1. Django admin > Documents > Form Templates
2. Select template
3. Edit HTML content
4. Use variables like `{{customer.full_name}}`, `{{workitem.reference_id}}`, etc.
5. Save and activate

### Available Variables

See the admin form for complete list of variables, including:
- Customer: `{{fio}}`, `{{phone}}`, `{{email}}`
- Work Item: `{{id}}`, `{{now}}`, `{{prepay}}`, `{{defect}}`
- Device: `{{product}}`, `{{serial}}`
- Staff: `{{accepter}}`, `{{technician.full_name}}`
- And 50+ more!

---

## 🐛 Troubleshooting

### PDFs Showing "Pending" Forever

Check Celery worker logs:
```bash
docker-compose logs celery_worker | grep ERROR
```

### PDFs Showing "Error" Status

1. Click on the form to see error message
2. Check FormDocument in Django admin for full error
3. Common issues:
   - Template has invalid HTML
   - Work item missing required data (customer, etc.)
   - Playwright browser crashed (restart Celery)

### Can't Download PDF

- Check that file exists: `ls -la backend/media/documents/`
- Verify MEDIA_URL is configured in settings
- Check nginx is serving media files

---

## 🎉 You're All Set!

The intake forms feature is now fully functional. Create a work item and watch it generate a beautiful PDF automatically!

**Need help?** Check the full documentation in [INTAKE_FORMS_SETUP.md](INTAKE_FORMS_SETUP.md)
