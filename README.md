# Fixed Service

Multi-tenant service management application with Django REST Framework backend and React frontend.

## 🚀 Quick Start

### Development

```bash
# Backend
cd backend && python manage.py runserver localhost:8000

# Frontend
cd frontend && npm run dev

# Celery Worker
cd backend && celery -A app worker --loglevel=info
```

### Docker

```bash
docker-compose up -d
```

See **[docs/DOCKER_QUICK_START.md](docs/DOCKER_QUICK_START.md)** for detailed Docker setup.

## 📚 Documentation

All documentation is in the **[`docs/`](docs/)** directory:

- **[docs/README.md](docs/README.md)** - Complete documentation index

### Quick Links

| Topic | Documentation |
|-------|---------------|
| **Integration Setup** | [docs/INTEGRATION_SETUP.md](docs/INTEGRATION_SETUP.md) |
| **n8n Webhooks** | [docs/N8N_WEBHOOK_SETUP.md](docs/N8N_WEBHOOK_SETUP.md) |
| **Authentication** | [docs/N8N_AUTHENTICATION.md](docs/N8N_AUTHENTICATION.md) |
| **Docker Deployment** | [docs/DOCKER_DEPLOYMENT.md](docs/DOCKER_DEPLOYMENT.md) |
| **Monitoring** | [docs/MONITORING_INTEGRATIONS.md](docs/MONITORING_INTEGRATIONS.md) |

## 🏗️ Architecture

- **Backend**: Django 5.0 + Django REST Framework
- **Frontend**: React 18 + React Router v7 + Chakra UI
- **Database**: PostgreSQL
- **Background Tasks**: Celery + Redis
- **Server**: Gunicorn + Nginx

### Key Features

- ✅ Multi-tenant architecture
- ✅ Role-based permissions
- ✅ Event-driven integrations (n8n, Notion, Slack)
- ✅ Automatic webhook triggers
- ✅ Full audit trail
- ✅ Docker deployment

## 🔧 Tech Stack

### Backend
- Django 5.0
- Django REST Framework
- Celery (background tasks)
- Redis (message broker)
- PostgreSQL

### Frontend
- React 18
- React Router v7
- Chakra UI
- Tailwind CSS
- Axios

## 📖 Development

See [CLAUDE.md](CLAUDE.md) for detailed development guidelines.

### Core Models

- **WorkItem**: Service tickets with auto-generated reference IDs
- **Customer**: Customer management with assets
- **Employee**: Staff with role assignments
- **TenantIntegration**: External integration configurations
- **IntegrationSync**: Audit trail for webhook calls

## 🤝 Contributing

When adding new documentation:
1. Create files in the `docs/` directory
2. Update `docs/README.md` with links
3. Use descriptive ALL_CAPS_WITH_UNDERSCORES.md filenames

## 📞 Support

- **Integration Issues**: [docs/MONITORING_INTEGRATIONS.md](docs/MONITORING_INTEGRATIONS.md)
- **Docker Issues**: [docs/DOCKER_DEPLOYMENT.md](docs/DOCKER_DEPLOYMENT.md)
- **Development Setup**: [CLAUDE.md](CLAUDE.md)

---

**For complete documentation, see [docs/README.md](docs/README.md)**
