# Documentation Guide

Guidelines for creating and organizing documentation in this repository.

## 📁 File Structure

```
fixed-service/
├── README.md                    # Project overview
├── CLAUDE.md                    # Claude Code development guide
└── docs/                        # All documentation lives here
    ├── README.md                # Documentation index
    ├── INTEGRATION_SETUP.md
    ├── N8N_WEBHOOK_SETUP.md
    ├── N8N_AUTHENTICATION.md
    ├── DOCKER_DEPLOYMENT.md
    ├── DOCKER_QUICK_START.md
    ├── MONITORING_INTEGRATIONS.md
    └── ... (other docs)
```

## ✅ Creating New Documentation

### 1. Where to Create Files

**Always create documentation in the `docs/` directory:**

```bash
# ✅ Correct
docs/NEW_FEATURE.md

# ❌ Wrong
NEW_FEATURE.md
backend/NEW_FEATURE.md
```

**Exception:** Keep `CLAUDE.md` and `README.md` in the root directory.

### 2. File Naming Convention

Use **ALL_CAPS_WITH_UNDERSCORES.md**:

```bash
# ✅ Good
INTEGRATION_SETUP.md
N8N_WEBHOOK_SETUP.md
DOCKER_DEPLOYMENT.md

# ❌ Bad
integration-setup.md
n8nWebhookSetup.md
docker_deployment.MD
```

### 3. File Organization

Group related docs with common prefixes:

```
INTEGRATION_SETUP.md
INTEGRATION_UPDATE_FIX.md
INTEGRATION_MONITORING_SUMMARY.md

N8N_WEBHOOK_SETUP.md
N8N_AUTHENTICATION.md

DOCKER_DEPLOYMENT.md
DOCKER_QUICK_START.md
```

## 📝 Document Structure

### Required Sections

Every documentation file should include:

1. **Title** (H1)
2. **Brief description**
3. **Table of Contents** (for longer docs)
4. **Main content**
5. **Next steps or related links**

### Template

```markdown
# Document Title

Brief description of what this document covers (1-2 sentences).

## Table of Contents

- [Section 1](#section-1)
- [Section 2](#section-2)

---

## Section 1

Content here...

### Subsection

More content...

## Section 2

Content here...

## Next Steps

- Link to related doc
- Link to related doc

---

**Last Updated:** Month Year
```

## 🔗 Linking Between Documents

### Internal Links (Same Directory)

Since all docs are in `docs/`, use relative links:

```markdown
See [N8N_AUTHENTICATION.md](N8N_AUTHENTICATION.md) for details.
```

### Links from Root

From `README.md` or `CLAUDE.md` to docs:

```markdown
See [docs/INTEGRATION_SETUP.md](docs/INTEGRATION_SETUP.md)
```

### Links from Code

From `backend/integrations/README.md` to docs:

```markdown
See [../../docs/N8N_WEBHOOK_SETUP.md](../../docs/N8N_WEBHOOK_SETUP.md)
```

## 📋 Updating Documentation Index

When you create a new document, **always update `docs/README.md`**:

1. Add to appropriate section
2. Update table of contents
3. Update document status table

Example:

```markdown
### New Section

| Document | Description | When to Read |
|----------|-------------|--------------|
| **[NEW_FEATURE.md](NEW_FEATURE.md)** | Description | When to use it |
```

## 🎨 Formatting Guidelines

### Use Emojis Sparingly

Good for section headers and callouts:

```markdown
## 🚀 Quick Start
## 📚 Documentation
✅ Success
❌ Error
⚠️ Warning
```

### Code Blocks

Always specify language:

```markdown
```bash
docker-compose up -d
\```

```python
def example():
    return "Hello"
\```

```json
{
  "key": "value"
}
\```
```

### Tables

Use tables for comparisons and lists:

```markdown
| Feature | Status | Notes |
|---------|--------|-------|
| Auth    | ✅     | Complete |
| Docker  | ✅     | Complete |
```

### Callouts

Use blockquotes for important notes:

```markdown
> **Important:** Always use HTTPS in production!

> **Note:** This requires Redis to be running.

> **Warning:** This will delete all data!
```

### Lists

Use consistent list formatting:

```markdown
**Unordered:**
- Item 1
- Item 2
  - Sub-item
  - Sub-item

**Ordered:**
1. First step
2. Second step
3. Third step

**Checkboxes:**
- [ ] Task not done
- [x] Task complete
```

## 📊 Example Sections

### Quick Start Section

```markdown
## Quick Start

### Step 1: Install Dependencies

```bash
npm install
\```

### Step 2: Configure Settings

Edit `config.json`:

```json
{
  "key": "value"
}
\```

### Step 3: Run

```bash
npm start
\```
```

### Troubleshooting Section

```markdown
## Troubleshooting

### Issue: Service won't start

**Symptoms:**
- Error message shown
- Service crashes

**Cause:** Missing dependency

**Solution:**
```bash
npm install missing-package
\```
```

### Reference Section

```markdown
## Reference

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `port` | number | 3000 | Server port |
| `host` | string | "localhost" | Server host |
```

## 🔍 Documentation Checklist

Before committing new documentation:

- [ ] File created in `docs/` directory
- [ ] Filename uses ALL_CAPS_WITH_UNDERSCORES.md
- [ ] Title and description present
- [ ] Table of contents (if > 3 sections)
- [ ] Code examples included
- [ ] Links are relative and work correctly
- [ ] `docs/README.md` updated
- [ ] Grammar and spelling checked
- [ ] Last updated date added

## 🎯 Best Practices

### DO:

✅ **Keep docs in `docs/` directory**
✅ **Use descriptive filenames**
✅ **Include working code examples**
✅ **Add troubleshooting sections**
✅ **Link to related documents**
✅ **Update the index (README.md)**
✅ **Use consistent formatting**

### DON'T:

❌ **Create docs outside `docs/` (except CLAUDE.md, README.md)**
❌ **Use vague titles** ("guide.md", "info.md")
❌ **Skip examples** (always show working code)
❌ **Break links** (test all links work)
❌ **Duplicate content** (link instead)

## 📞 Questions?

If you're unsure where to put documentation:

1. **Integration-related?** → `docs/INTEGRATION_*.md`
2. **n8n-related?** → `docs/N8N_*.md`
3. **Docker-related?** → `docs/DOCKER_*.md`
4. **Monitoring/debugging?** → `docs/MONITORING_*.md`
5. **General feature?** → `docs/FEATURE_NAME.md`

When in doubt, create in `docs/` and update `docs/README.md`!

---

**Remember:** Good documentation is:
- **Clear** - Easy to understand
- **Complete** - Covers all use cases
- **Correct** - Up to date and accurate
- **Accessible** - Easy to find and navigate

---

**Last Updated:** November 2025
