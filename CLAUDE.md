# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Backend (Django)
- `cd backend && python manage.py runserver localhost:8000` - Start Django development server (must use localhost, not 127.0.0.1)
- `cd backend && python manage.py makemigrations` - Create new database migrations
- `cd backend && python manage.py migrate` - Apply database migrations
- `cd backend && python manage.py createsuperuser` - Create admin user
- `cd backend && python manage.py shell` - Django shell
- `cd backend && python manage.py test` - Run tests

### API Keys (External Integrations)
- `cd backend && python manage.py generate_api_key --tenant=<subdomain> --role=<role_id> --name="Integration Name"` - Generate API key for external systems
- API keys use `Authorization: Bearer <key>` header format
- Manage API keys via Django admin: **Core > API Keys**
- See [backend/docs/API_KEYS.md](backend/docs/API_KEYS.md) for complete usage guide

### Celery (Background Tasks & Integrations)
- `cd backend && celery -A app worker --loglevel=info` - Start Celery worker for background tasks
- `cd backend && celery -A app beat --loglevel=info` - Start Celery Beat for periodic tasks
- `redis-cli ping` - Verify Redis is running (required for Celery)

### Frontend (React + Vite)
- `cd frontend && npm run dev` - Start Vite development server (runs on port 5173)
- `cd frontend && npm run build` - Build for production
- `cd frontend && npm run preview` - Preview production build

## Architecture Overview

This is a multi-tenant service management application with Django REST Framework backend and React frontend.

### Multi-Tenancy
- **Tenant-based isolation**: All core models inherit from `TenantModelMixin` and are filtered by tenant
- **Tenant resolution**: Uses `TenantMiddleware` which resolves tenants from:
  1. Authenticated user's active tenant
  2. `X-Tenant` HTTP header
  3. Subdomain (e.g., `repairhero.localhost`)
- **Custom User model**: Located in `backend/core/models.py:User` with tenant relationship

### Core Domain Models

**Customer Management** (`backend/customers/models.py`):
- `Customer`: Tenant-scoped customers with contact info and addresses
- `Asset`: Customer-owned devices linked to inventory items
- `Lead`/`Opportunity`: Sales pipeline management

**Service Management** (`backend/service/models.py`):
- `RepairShop`: Internal/partner repair facilities
- `Location`: Flexible location system (shops, customer addresses, or freeform)
- `Employee`: Users with roles and location assignments

**Work Management** (`backend/tasks/models.py`):
- `WorkItem`: Main service tickets with auto-generated reference IDs (RMA-N format)
- `Task`: Subtasks within work items
- Supports various intake/dropoff methods, pricing, and workflow states

**Integration System** (`backend/integrations/`):
- `TenantIntegration`: Per-tenant configuration for external integrations (n8n, Notion, Slack)
- `IntegrationSync`: Audit trail and idempotency for integration webhooks
- `APIKey`: Secure authentication for external systems to call our API
- Event-driven architecture using Django signals with transaction safety
- Background processing via Celery tasks with automatic retries
- See [backend/docs/INTEGRATION_SETUP.md](backend/docs/INTEGRATION_SETUP.md) for outbound webhooks
- See [backend/docs/API_KEYS.md](backend/docs/API_KEYS.md) for inbound API authentication

## Documentation

All integration and deployment documentation is in the [`backend/docs/`](backend/docs/) directory:
- **[backend/docs/API_KEYS.md](backend/docs/API_KEYS.md)** - API key authentication for external systems
- **[backend/docs/INTEGRATION_SETUP.md](backend/docs/INTEGRATION_SETUP.md)** - Quick start guide for integrations
- **[backend/docs/N8N_WEBHOOK_SETUP.md](backend/docs/N8N_WEBHOOK_SETUP.md)** - Complete n8n configuration guide
- **[backend/docs/N8N_AUTHENTICATION.md](backend/docs/N8N_AUTHENTICATION.md)** - Authentication methods and security
- **[backend/docs/DOCKER_DEPLOYMENT.md](backend/docs/DOCKER_DEPLOYMENT.md)** - Docker deployment guide
- **[backend/docs/MONITORING_INTEGRATIONS.md](backend/docs/MONITORING_INTEGRATIONS.md)** - Debugging and monitoring
- See [backend/docs/README.md](backend/docs/README.md) for complete index

### Key Architectural Patterns

**Permission System**: Role-based permissions per tenant using `Role`, `RolePermission`, and `UserRole` models.

**Generic Relations**: `Note` model uses Django's generic foreign keys to attach notes to any model.

**API Communication**:
- Backend serves REST API on port 8000
- **Frontend**: Uses session-based authentication (cookies)
- **External Systems**: Use API key authentication (`Authorization: Bearer <key>`)
  - API keys are tenant-scoped with role-based permissions
  - Managed via Django admin or CLI (`generate_api_key` command)
  - See [backend/docs/API_KEYS.md](backend/docs/API_KEYS.md) for details
- CORS configured for `localhost:5173` and `*.localhost:5173` patterns

**Database**: PostgreSQL with connection details in `backend/app/settings.py`

### Frontend Structure
- React 18 with React Router v7
- Chakra UI component library with Tailwind CSS
- Axios for API calls
- Context-based user state management in `UserContext`

### Development Notes
- Multi-tenant hosts use `.localhost` domains (e.g., `repairhero.localhost:5173`)
- Django admin available for data management
- **Authentication**:
  - Frontend → Backend: Session-based (cookies)
  - External Systems → Backend: API keys (`Authorization: Bearer <key>`)
  - Both methods work simultaneously without conflicts
