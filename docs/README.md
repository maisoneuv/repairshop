# Documentation Index

Complete documentation for the Fixed Service integration and deployment system.

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Integration System](#integration-system)
- [n8n Configuration](#n8n-configuration)
- [Docker Deployment](#docker-deployment)
- [Monitoring & Debugging](#monitoring--debugging)
- [Reference](#reference)

---

## 🚀 Quick Start

**New to the integration system?** Start here:

1. **[INTEGRATION_SETUP.md](INTEGRATION_SETUP.md)** - 5-minute quick start
   - Install Redis and Celery
   - Configure your first integration
   - Test it works

2. **[DOCKER_QUICK_START.md](DOCKER_QUICK_START.md)** - Docker setup in 3 steps
   - Rebuild Docker images
   - Start all services
   - Verify everything works

---

## 🔗 Integration System

### Overview

The integration system provides event-driven webhooks to external services (n8n, Notion, Slack, etc.) when WorkItems are created or updated.

**Key Features:**
- ✅ Event-driven (Django signals)
- ✅ Transaction safe (`transaction.on_commit()`)
- ✅ Background processing (Celery)
- ✅ Automatic retries (3 attempts with backoff)
- ✅ Full audit trail (IntegrationSync table)
- ✅ Multi-tenant support

### Documentation

| Document | Description | When to Read |
|----------|-------------|--------------|
| **[INTEGRATION_SETUP.md](INTEGRATION_SETUP.md)** | Quick start guide | Setting up integrations for the first time |
| **[INTEGRATION_UPDATE_FIX.md](INTEGRATION_UPDATE_FIX.md)** | Fix for multiple updates | Understanding why second edits now trigger webhooks |
| **[REMOVE_INTEGRATION_NOTES.md](REMOVE_INTEGRATION_NOTES.md)** | Activity timeline cleanup | Understanding why notes were removed from timeline |

---

## 🔌 n8n Configuration

### Complete n8n Setup

| Document | Description | When to Read |
|----------|-------------|--------------|
| **[N8N_WEBHOOK_SETUP.md](N8N_WEBHOOK_SETUP.md)** | Complete n8n webhook guide | Configuring n8n workflows from scratch |
| **[N8N_AUTHENTICATION.md](N8N_AUTHENTICATION.md)** | Authentication methods | Securing webhooks with auth |

### What's Covered

#### N8N_WEBHOOK_SETUP.md
- Step-by-step webhook node configuration
- How to access WorkItem data in n8n
- Example workflows (Slack, Notion, Email, etc.)
- Testing methods (curl, n8n test mode)
- Production deployment checklist
- Troubleshooting

#### N8N_AUTHENTICATION.md
- Why authentication is critical
- Option A: No Authentication (testing only)
- **Option B: Header Authentication** ⭐ **RECOMMENDED**
- Option C: Basic Authentication
- Option D: HMAC Signature Verification (most secure)
- Security best practices
- Testing with curl

---

## 🐳 Docker Deployment

### Docker Setup & Management

| Document | Description | When to Read |
|----------|-------------|--------------|
| **[DOCKER_QUICK_START.md](DOCKER_QUICK_START.md)** | 3-step Docker setup | First time deploying with Docker |
| **[DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md)** | Complete Docker guide | Detailed Docker configuration and troubleshooting |

### What's Covered

#### DOCKER_QUICK_START.md
- Rebuild images with new requirements
- Start all services
- Verify everything is running

#### DOCKER_DEPLOYMENT.md
- Updated services (Redis, Celery worker, Celery beat)
- Configuration details
- Environment variables
- Monitoring Docker services
- Troubleshooting Docker issues
- Production deployment considerations
- Scaling Celery workers

---

## 🔍 Monitoring & Debugging

### Troubleshooting Integrations

| Document | Description | When to Read |
|----------|-------------|--------------|
| **[MONITORING_INTEGRATIONS.md](MONITORING_INTEGRATIONS.md)** | Complete monitoring guide | Debugging integration issues |
| **[INTEGRATION_MONITORING_SUMMARY.md](INTEGRATION_MONITORING_SUMMARY.md)** | Quick troubleshooting | Fast diagnosis of common issues |

### What's Covered

#### MONITORING_INTEGRATIONS.md
- Supported event types
- How to check Docker logs
- Using IntegrationSync admin panel
- Checking WorkItem notes
- Verifying integration configuration
- Redis and Celery health checks
- Advanced monitoring with Django shell
- Common issues and solutions

#### INTEGRATION_MONITORING_SUMMARY.md
- Quick summary of monitoring workflow
- Step-by-step testing guide
- Common issues and fixes
- Next steps after setup

---

## 📚 Reference

### Event Types

| Event Type | When It Triggers | Use Case |
|------------|------------------|----------|
| `workitem_created` | New WorkItem created | Notify team of new repair jobs |
| `workitem_updated` | ANY field changes | Monitor all edits (description, price, etc.) |
| `workitem_status_changed` | Status field changes | Track workflow progress |

### Integration Types

| Type | Description | Documentation |
|------|-------------|---------------|
| **n8n Webhook** | Flexible automation platform | [N8N_WEBHOOK_SETUP.md](N8N_WEBHOOK_SETUP.md) |
| **Notion** | Sync to Notion databases | Example in n8n workflow |
| **Slack** | Team notifications | Example in n8n workflow |

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Django Model Save (WorkItem)                           │
│         ↓                                               │
│  Django Signal (post_save)                              │
│         ↓                                               │
│  transaction.on_commit()  ← Transaction Safety          │
│         ↓                                               │
│  Celery Task Queued (via Redis)                         │
│         ↓                                               │
│  Celery Worker Processes Task                           │
│         ↓                                               │
│  HTTP POST to n8n Webhook                               │
│         ↓                                               │
│  IntegrationSync Record Created (audit trail)           │
│         ↓                                               │
│  Response Returned to Django                            │
└─────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **Models** | `backend/integrations/models.py` | TenantIntegration, IntegrationSync |
| **Signals** | `backend/integrations/signals/workitem.py` | Event detection and triggering |
| **Tasks** | `backend/integrations/tasks.py` | Celery tasks for webhook calls |
| **Admin** | `backend/integrations/admin.py` | Django admin interface |

---

## 🎯 Common Workflows

### Setting Up a New Integration

1. Read [INTEGRATION_SETUP.md](INTEGRATION_SETUP.md)
2. Configure n8n webhook: [N8N_WEBHOOK_SETUP.md](N8N_WEBHOOK_SETUP.md)
3. Set up authentication: [N8N_AUTHENTICATION.md](N8N_AUTHENTICATION.md)
4. Test and verify: [MONITORING_INTEGRATIONS.md](MONITORING_INTEGRATIONS.md)

### Deploying with Docker

1. Quick start: [DOCKER_QUICK_START.md](DOCKER_QUICK_START.md)
2. Detailed setup: [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md)
3. Run migrations
4. Test integrations work

### Debugging Issues

1. Check quick summary: [INTEGRATION_MONITORING_SUMMARY.md](INTEGRATION_MONITORING_SUMMARY.md)
2. Full debugging guide: [MONITORING_INTEGRATIONS.md](MONITORING_INTEGRATIONS.md)
3. Check IntegrationSync in Django admin
4. Review Celery logs

---

## 📝 Document Status

| Document | Status | Last Updated |
|----------|--------|--------------|
| INTEGRATION_SETUP.md | ✅ Complete | Nov 2025 |
| N8N_WEBHOOK_SETUP.md | ✅ Complete | Nov 2025 |
| N8N_AUTHENTICATION.md | ✅ Complete | Nov 2025 |
| DOCKER_DEPLOYMENT.md | ✅ Complete | Nov 2025 |
| DOCKER_QUICK_START.md | ✅ Complete | Nov 2025 |
| MONITORING_INTEGRATIONS.md | ✅ Complete | Nov 2025 |
| INTEGRATION_MONITORING_SUMMARY.md | ✅ Complete | Nov 2025 |
| INTEGRATION_UPDATE_FIX.md | ✅ Complete | Nov 2025 |
| REMOVE_INTEGRATION_NOTES.md | ✅ Complete | Nov 2025 |

---

## 🤝 Contributing

When adding new documentation:

1. **Create in `docs/` directory** - Keep all docs organized
2. **Use descriptive filenames** - All caps with underscores (e.g., `NEW_FEATURE.md`)
3. **Update this README** - Add to appropriate section
4. **Link from CLAUDE.md** - If relevant for development
5. **Include examples** - Code snippets, curl commands, screenshots
6. **Add troubleshooting** - Common issues and solutions

---

## 📞 Support

- **Integration Issues**: See [MONITORING_INTEGRATIONS.md](MONITORING_INTEGRATIONS.md)
- **Docker Issues**: See [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md)
- **n8n Setup**: See [N8N_WEBHOOK_SETUP.md](N8N_WEBHOOK_SETUP.md)

---

**Last Updated:** November 2025
