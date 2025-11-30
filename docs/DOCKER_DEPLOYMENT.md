# Docker Deployment Guide - Integration System

This guide explains how to deploy the integration system (with Celery and Redis) using Docker.

## What's New in Docker Setup

The Docker configuration has been updated to include:

- ✅ **Redis** service (for Celery message broker)
- ✅ **Celery Worker** service (processes background tasks)
- ✅ **Celery Beat** service (schedules periodic tasks)
- ✅ Updated **Dockerfile.backend** to use `requirements.txt`
- ✅ Environment variables for Celery/Redis configuration

## Updated Services

Your `docker-compose.yml` now includes:

1. **db** - PostgreSQL database
2. **redis** - Redis (message broker for Celery) ⭐ NEW
3. **web** - Django application server
4. **celery_worker** - Background task processor ⭐ NEW
5. **celery_beat** - Periodic task scheduler ⭐ NEW
6. **frontend** - React frontend build
7. **nginx** - Reverse proxy

## Quick Start

### 1. Rebuild the Docker Images

Since we updated `requirements.txt` and `Dockerfile.backend`, rebuild the images:

```bash
docker-compose build
```

This will:
- Install Celery and Redis Python packages
- Include all new integration code
- Create fresh images with all dependencies

### 2. Start All Services

```bash
docker-compose up -d
```

This starts:
- PostgreSQL
- Redis
- Django web server
- Celery worker
- Celery beat
- Frontend
- Nginx

### 3. Run Migrations

The migrations will run automatically when the `web` service starts. If you need to run them manually:

```bash
docker-compose exec web python manage.py migrate
```

You should see:
```
Running migrations:
  Applying integrations.0001_initial... OK
```

### 4. Verify Services Are Running

```bash
docker-compose ps
```

You should see all services as "Up":
```
NAME                         STATUS
fixed-service-db-1           Up (healthy)
fixed-service-redis-1        Up (healthy)
fixed-service-web-1          Up
fixed-service-celery_worker-1 Up
fixed-service-celery_beat-1  Up
fixed-service-frontend-1     Exited (0)
fixed-service-nginx-1        Up
```

### 5. Check Celery Worker Logs

```bash
docker-compose logs -f celery_worker
```

You should see:
```
[tasks]
  . integrations.tasks.send_integration_webhook
  . integrations.tasks.retry_failed_syncs

celery@xxx ready.
```

## Testing the Integration

### 1. Access Django Admin

Navigate to `http://localhost:8008/admin/` and log in.

### 2. Configure an Integration

1. Go to **Integrations → Tenant Integrations**
2. Click **Add Tenant Integration**
3. Configure your n8n webhook (see main setup guide)

### 3. Create a Test WorkItem

Create a WorkItem and watch the Celery worker logs:

```bash
docker-compose logs -f celery_worker
```

You should see:
```
[INFO] Sending webhook to n8n - New WorkItems for WorkItem:123
[INFO] Successfully synced WorkItem:123 to n8n - New WorkItems
```

## Docker Commands Reference

### Start Services
```bash
# Start all services in background
docker-compose up -d

# Start specific service
docker-compose up -d celery_worker

# View logs in real-time
docker-compose logs -f celery_worker

# View logs for all services
docker-compose logs -f
```

### Stop Services
```bash
# Stop all services
docker-compose down

# Stop and remove volumes (CAUTION: deletes data!)
docker-compose down -v
```

### Rebuild After Code Changes
```bash
# Rebuild all images
docker-compose build

# Rebuild specific service
docker-compose build web

# Rebuild and restart
docker-compose up -d --build
```

### Execute Commands in Containers
```bash
# Django shell
docker-compose exec web python manage.py shell

# Create superuser
docker-compose exec web python manage.py createsuperuser

# Run migrations
docker-compose exec web python manage.py migrate

# Check Celery tasks
docker-compose exec celery_worker celery -A app inspect active

# Access Redis CLI
docker-compose exec redis redis-cli
```

### Monitor Services
```bash
# View running containers
docker-compose ps

# View resource usage
docker stats

# Check Redis is working
docker-compose exec redis redis-cli ping
# Should return: PONG

# Check database connection
docker-compose exec db psql -U postgres -d secret -c "SELECT 1;"
```

## Troubleshooting

### Issue: Services won't start after rebuild

**Solution:**
```bash
# Stop everything
docker-compose down

# Remove old containers and images
docker-compose rm -f
docker image prune -f

# Rebuild and start fresh
docker-compose build --no-cache
docker-compose up -d
```

### Issue: Celery worker not processing tasks

**Check logs:**
```bash
docker-compose logs celery_worker
```

**Common causes:**
1. Redis not running - check: `docker-compose ps redis`
2. Environment variables missing - check: `docker-compose exec celery_worker env | grep CELERY`
3. Code errors - check worker logs for Python exceptions

**Restart worker:**
```bash
docker-compose restart celery_worker
```

### Issue: "ModuleNotFoundError: No module named 'celery'"

This means the Docker image wasn't rebuilt after adding `requirements.txt`.

**Solution:**
```bash
docker-compose build --no-cache web celery_worker celery_beat
docker-compose up -d
```

### Issue: Webhooks not being sent

**Check integration is active:**
```bash
docker-compose exec web python manage.py shell
```
```python
from integrations.models import TenantIntegration
TenantIntegration.objects.filter(is_active=True)
```

**Check Celery worker logs:**
```bash
docker-compose logs celery_worker | grep -i error
```

**Check Redis connection:**
```bash
docker-compose exec redis redis-cli ping
```

### Issue: Database migrations not applied

**Manually run migrations:**
```bash
docker-compose exec web python manage.py migrate
```

**Check migration status:**
```bash
docker-compose exec web python manage.py showmigrations integrations
```

### Issue: Can't connect to Redis

**Verify Redis is running:**
```bash
docker-compose ps redis
```

**Check environment variable:**
```bash
docker-compose exec web env | grep CELERY_BROKER
```

Should show: `CELERY_BROKER_URL=redis://redis:6379/0`

## Production Deployment Considerations

### 1. Scale Celery Workers

Add more workers for better performance:

```bash
docker-compose up -d --scale celery_worker=3
```

Or in `docker-compose.yml`:
```yaml
celery_worker:
  # ... existing config ...
  deploy:
    replicas: 3
```

### 2. Enable Redis Persistence

Update `docker-compose.yml`:
```yaml
redis:
  image: redis:7-alpine
  command: redis-server --appendonly yes
  volumes:
    - redisdata:/data
```

### 3. Add Resource Limits

Prevent services from consuming too many resources:

```yaml
celery_worker:
  # ... existing config ...
  deploy:
    resources:
      limits:
        cpus: '1'
        memory: 512M
      reservations:
        cpus: '0.5'
        memory: 256M
```

### 4. Use Secrets for Sensitive Data

Instead of `.env` file, use Docker secrets in production:

```yaml
services:
  web:
    secrets:
      - db_password
      - django_secret_key

secrets:
  db_password:
    file: ./secrets/db_password.txt
  django_secret_key:
    file: ./secrets/django_secret.txt
```

### 5. Monitor with Flower

Add Celery monitoring UI:

```yaml
flower:
  build:
    context: .
    dockerfile: docker/Dockerfile.backend
  env_file: .env
  depends_on:
    - redis
  working_dir: /app
  command: celery -A app flower --port=5555
  ports:
    - "5555:5555"
```

Then access Flower at `http://localhost:5555`

### 6. Health Checks

The `redis` and `db` services already have health checks. Consider adding one for Celery:

```yaml
celery_worker:
  # ... existing config ...
  healthcheck:
    test: ["CMD-SHELL", "celery -A app inspect ping -d celery@$HOSTNAME"]
    interval: 30s
    timeout: 10s
    retries: 3
```

## Environment Variables

Your `.env` file should include:

```bash
# Celery & Redis
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0

# Note: In Docker, use 'redis' as hostname (Docker service name)
# Outside Docker: use 'localhost' or '127.0.0.1'
```

## Docker Compose Service Details

### Redis Service
```yaml
redis:
  image: redis:7-alpine       # Lightweight Alpine Linux version
  healthcheck:                 # Ensures Redis is ready before dependents start
    test: ["CMD", "redis-cli", "ping"]
  volumes:
    - redisdata:/data          # Persist Redis data
```

### Celery Worker Service
```yaml
celery_worker:
  build:
    context: .
    dockerfile: docker/Dockerfile.backend
  command: celery -A app worker --loglevel=info
  depends_on:
    - db
    - redis
  restart: unless-stopped      # Auto-restart if it crashes
```

### Celery Beat Service
```yaml
celery_beat:
  build:
    context: .
    dockerfile: docker/Dockerfile.backend
  command: celery -A app beat --loglevel=info
  depends_on:
    - redis
  restart: unless-stopped
```

## Viewing Integration Sync History

```bash
# Access Django shell in container
docker-compose exec web python manage.py shell
```

```python
from integrations.models import IntegrationSync

# View recent syncs
for sync in IntegrationSync.objects.all()[:10]:
    print(f"{sync.integration.name}: {sync.status} - {sync.event_type}")

# Count syncs by status
from django.db.models import Count
IntegrationSync.objects.values('status').annotate(count=Count('id'))
```

## Next Steps

1. **Configure your first integration** via Django admin
2. **Test with a WorkItem creation** to verify webhooks work
3. **Monitor Celery logs** to see tasks being processed
4. **Set up n8n workflows** to receive and process webhooks
5. **Scale workers** if you have high volumes

## Support

- See [INTEGRATION_SETUP.md](INTEGRATION_SETUP.md) for integration configuration
- See [backend/integrations/README.md](backend/integrations/README.md) for detailed documentation
- Check Docker Compose logs: `docker-compose logs -f`

Happy deploying! 🚀
