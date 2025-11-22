# Docker Quick Start - Integration System

## 🚀 Get Up and Running in 3 Steps

### Step 1: Rebuild Docker Images
```bash
docker-compose build
```
This installs Celery, Redis, and all integration dependencies.

### Step 2: Start All Services
```bash
docker-compose up -d
```
This starts: PostgreSQL, Redis, Django, Celery Worker, Celery Beat, Frontend, and Nginx.

### Step 3: Verify Everything Works
```bash
# Check all services are running
docker-compose ps

# Watch Celery worker logs
docker-compose logs -f celery_worker

# Check Redis is working
docker-compose exec redis redis-cli ping
# Should return: PONG
```

## ✅ Configure Your First Integration

1. Go to `http://localhost:8008/admin/`
2. Navigate to **Integrations → Tenant Integrations**
3. Click **Add Tenant Integration**
4. Fill in:
   - **Webhook URL**: Your n8n webhook URL
   - **Event Type**: "WorkItem Created"
   - **Is Active**: ✓ Checked
5. Save

## 🧪 Test It

Create a WorkItem and watch the magic happen:

```bash
docker-compose logs -f celery_worker
```

You'll see:
```
[INFO] Sending webhook to n8n...
[INFO] Successfully synced WorkItem:123
```

## 📊 Useful Commands

```bash
# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f celery_worker

# Restart a service
docker-compose restart celery_worker

# Stop everything
docker-compose down

# Rebuild and restart
docker-compose up -d --build

# Django shell
docker-compose exec web python manage.py shell

# Create superuser
docker-compose exec web python manage.py createsuperuser
```

## 🔧 Troubleshooting

### Services won't start?
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Celery not working?
```bash
# Check worker status
docker-compose logs celery_worker

# Restart worker
docker-compose restart celery_worker
```

### Need to rebuild after code changes?
```bash
docker-compose up -d --build
```

## 📚 Full Documentation

- [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md) - Complete Docker guide
- [INTEGRATION_SETUP.md](INTEGRATION_SETUP.md) - Integration configuration
- [backend/integrations/README.md](backend/integrations/README.md) - Full API docs

---

**That's it!** Your integration system is now running in Docker 🎉
