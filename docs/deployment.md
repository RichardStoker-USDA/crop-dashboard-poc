# Deployment

Production deployment options and configuration.

---

## Production vs Development

=== "Development"

    ```
    Frontend (Vite)      Backend (uvicorn)
    localhost:5173  -->  localhost:8000
    Two processes        Hot reload enabled
    ```

=== "Production"

    ```
    Single Backend Process
    localhost:8000
    ├── /api/*     --> FastAPI routes
    ├── /assets/*  --> Static files (JS, CSS)
    └── /*         --> index.html (SPA routing)
    ```

In production, the frontend is built to static files and served by the backend. No CORS issues.

---

## Local Deployment

Run the full production stack locally using Docker.

### Build and Run

```bash
# Build the image
docker build -t cropdash .

# Run with required environment variables
docker run -p 8000:8000 \
  -e SECRET_KEY=dev-secret-key-at-least-32-characters \
  -e DB_ENCRYPTION_KEY=dev-encryption-key-for-local-testing \
  -e ADMIN_EMAIL=admin@cropdash.dev \
  -e ADMIN_PASSWORD=changeme123 \
  cropdash
```

Open http://localhost:8000 - the frontend is bundled and served by the backend.

### Demo Mode

For demos or testing, use `DEMO_MODE=true` to reset the database on each restart:

```bash
docker run -p 8000:8000 \
  -e DEMO_MODE=true \
  -e SECRET_KEY=demo-secret-key \
  -e ADMIN_EMAIL=admin@demo.com \
  -e ADMIN_PASSWORD=demopass123 \
  cropdash
```

!!! warning "Demo Mode"
    With `DEMO_MODE=true`, the database is deleted and recreated on each restart. Any data you enter will be lost. Only use this for demonstrations, not production data.

---

## Docker Deployment

The included Dockerfile builds everything into a single container.

### Build

```bash
docker build -t cropdash .
```

### Run

```bash
docker run -p 8000:8000 \
  -e SECRET_KEY=<64-char-random> \
  -e REFRESH_SECRET_KEY=<64-char-random> \
  -e DB_ENCRYPTION_KEY=<encryption-key> \
  -e ADMIN_EMAIL=admin@yourorg.com \
  -e ADMIN_PASSWORD=<strong-password> \
  -e COOKIE_SECURE=true \
  -v /path/to/data:/app/data \
  cropdash
```

### With Docker Compose

```yaml title="docker-compose.yml"
version: '3.8'

services:
  app:
    build: .
    ports:
      - "8000:8000"
    environment:
      - SECRET_KEY=${SECRET_KEY}
      - REFRESH_SECRET_KEY=${REFRESH_SECRET_KEY}
      - DB_ENCRYPTION_KEY=${DB_ENCRYPTION_KEY}
      - ADMIN_EMAIL=${ADMIN_EMAIL}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
      - COOKIE_SECURE=true
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

```bash
docker compose up -d
```

---

## VPS Deployment

Deploy to a Linux VPS (DigitalOcean, Linode, Vultr, etc.).

### Requirements

- Linux server (Ubuntu 22.04 recommended)
- Docker installed
- Domain name (optional but recommended)
- SSL certificate (use Caddy or Certbot)

### With Caddy (Automatic HTTPS)

```
# /etc/caddy/Caddyfile
yourdomain.com {
    reverse_proxy localhost:8000
}
```

Caddy automatically provisions SSL certificates.

### Systemd Service

```ini title="/etc/systemd/system/cropdash.service"
[Unit]
Description=CropDash Platform
After=docker.service
Requires=docker.service

[Service]
Restart=always
ExecStart=/usr/bin/docker run --rm \
  -p 8000:8000 \
  --env-file /opt/cropdash/.env \
  -v /opt/cropdash/data:/app/data \
  cropdash:latest

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable cropdash
sudo systemctl start cropdash
```

---

## Production Checklist

### Security

- [ ] Generate unique `SECRET_KEY` and `REFRESH_SECRET_KEY`
- [ ] Set `DB_ENCRYPTION_KEY` (cannot be changed later)
- [ ] Change default admin password immediately
- [ ] Set `COOKIE_SECURE=true` (requires HTTPS)
- [ ] Configure HTTPS (Caddy, nginx, or cloud load balancer)
- [ ] Consider adding 2FA layer (see above)

### Environment Variables

```bash title=".env"
# Required
SECRET_KEY=<64-char-random-hex>
REFRESH_SECRET_KEY=<64-char-random-hex>
DB_ENCRYPTION_KEY=<encryption-key>
ADMIN_EMAIL=admin@yourorg.com
ADMIN_PASSWORD=<strong-password>

# Production settings
DEBUG=false
DEMO_MODE=false
COOKIE_SECURE=true
CORS_ORIGINS=https://yourdomain.com

# Optional: Box integration
BOX_CLIENT_ID=<client-id>
BOX_CLIENT_SECRET=<client-secret>
BOX_REDIRECT_URI=https://yourdomain.com/admin/box/callback
```

### Database

- [ ] Back up `data/crop_dashboard.db` regularly
- [ ] Store `DB_ENCRYPTION_KEY` securely (cannot recover without it)
- [ ] Mount persistent storage for `/app/data` in Docker

### Generate Keys

```bash
# Generate secure keys
openssl rand -hex 32  # For SECRET_KEY
openssl rand -hex 32  # For REFRESH_SECRET_KEY
openssl rand -base64 32  # For DB_ENCRYPTION_KEY
```

---

## Backup Strategy

### Database Backup

```bash
# Copy the database file
cp data/crop_dashboard.db backups/crop_dashboard_$(date +%Y%m%d).db

# Or with Docker
docker exec <container> cat /app/data/crop_dashboard.db > backup.db
```

### Automated Backups

```bash title="/etc/cron.daily/backup-cropdash"
#!/bin/bash
cp /opt/cropdash/data/crop_dashboard.db /backups/crop_dashboard_$(date +%Y%m%d).db
# Keep last 30 days
find /backups -name "crop_dashboard_*.db" -mtime +30 -delete
```

---

## Monitoring

### Health Check

```bash
curl http://localhost:8000/health
# Returns: {"status": "healthy", "app": "CSG Flux Dashboard", "demo_mode": false}
```

### Logs

```bash
# Docker logs
docker logs -f <container>

# Systemd logs
journalctl -u cropdash -f
```

---

## Scaling Considerations

SQLite handles concurrent reads well but has write limitations:

| Scenario | SQLite Works | Consider PostgreSQL |
|----------|-------------|---------------------|
| Read-heavy dashboard | Yes | Not needed |
| Multiple backend instances | No | Yes |
| High-frequency writes | Maybe | Yes |
| >1000 concurrent users | Maybe | Yes |

### Migration Path

If you outgrow SQLite:

1. Export data to JSON/CSV
2. Switch `DATABASE_URL` to PostgreSQL connection string
3. Import data
4. SQLAlchemy handles most differences

---

## Next Steps

- [Configuration](getting-started/configuration.md) - Environment variables
- [Quick Start](getting-started/quick-start.md) - Local setup
- [Security](security.md) - Security details and best practices
