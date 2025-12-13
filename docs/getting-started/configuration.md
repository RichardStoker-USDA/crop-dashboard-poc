# Configuration

All configuration is done through environment variables, either set directly or via a `.env` file in the project root.

---

## How Settings Are Loaded

The backend uses Pydantic Settings (`backend/config.py`) which loads values in this order:

1. **Environment variables** - highest priority
2. **`.env` file** - in project root
3. **Default values** - defined in code (development only)

---

## Quick Reference

### Minimum for Development

```bash title=".env"
SECRET_KEY=dev-secret-key-at-least-32-characters
DB_ENCRYPTION_KEY=dev-encryption-key
ADMIN_EMAIL=admin@cropdash.dev
ADMIN_PASSWORD=changeme123
```

### Minimum for Production

```bash title=".env"
SECRET_KEY=<64-char-random-hex>
REFRESH_SECRET_KEY=<64-char-random-hex>
DB_ENCRYPTION_KEY=<encryption-key>
ADMIN_EMAIL=admin@yourorg.com
ADMIN_PASSWORD=<strong-password>
CORS_ORIGINS=https://yourdomain.com
COOKIE_SECURE=true
```

---

## All Variables

### Security

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_KEY` | (generated) | Signs JWT access tokens. Min 32 chars. |
| `REFRESH_SECRET_KEY` | (generated) | Signs refresh tokens. Min 32 chars. |
| `DB_ENCRYPTION_KEY` | (none) | SQLCipher encryption key. **Cannot be changed or recovered if lost.** |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 30 | How long access tokens last |
| `REFRESH_TOKEN_EXPIRE_DAYS` | 7 | How long refresh tokens last |

!!! warning "Generated Keys"
    If `SECRET_KEY` or `REFRESH_SECRET_KEY` aren't set, random keys are generated on startup. This means all sessions invalidate on restart. Always set these explicitly.

#### Generating Keys

```bash
# Using OpenSSL
openssl rand -hex 32

# Using Python
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Or generate all at once:

```bash
echo "SECRET_KEY=$(openssl rand -hex 32)"
echo "REFRESH_SECRET_KEY=$(openssl rand -hex 32)"
echo "DB_ENCRYPTION_KEY=$(openssl rand -base64 32)"
```

---

### Cookie Settings

Tokens are stored in httpOnly cookies. These settings control cookie behavior:

| Variable | Default | Description |
|----------|---------|-------------|
| `COOKIE_SECURE` | false | Set `true` in production - requires HTTPS |
| `COOKIE_SAMESITE` | lax | Cookie SameSite policy (`lax` or `strict`) |
| `COOKIE_DOMAIN` | (none) | Set to share cookies across subdomains |

```bash title="Production cookie settings"
COOKIE_SECURE=true
COOKIE_SAMESITE=lax
```

---

### Database

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite:///./data/crop_dashboard.db` | Database connection string |
| `DB_ENCRYPTION_KEY` | (none) | SQLCipher encryption key |

!!! danger "Encryption Key Warning"
    Once set, `DB_ENCRYPTION_KEY` cannot be changed. If you lose it, the database is permanently inaccessible. Back it up securely.

---

### Initial Admin

| Variable | Default | Description |
|----------|---------|-------------|
| `ADMIN_EMAIL` | admin@cropdash.dev | Initial admin email |
| `ADMIN_PASSWORD` | changeme123 | Initial admin password |

These are only used on first startup to create the admin user. After that, change the password through the UI.

---

### CORS

| Variable | Default | Description |
|----------|---------|-------------|
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Allowed frontend origins |

=== "Development"

    ```bash
    CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
    ```

=== "Production"

    ```bash
    CORS_ORIGINS=https://dashboard.yourorg.com
    ```

=== "Multiple Domains"

    ```bash
    CORS_ORIGINS=https://dashboard.yourorg.com,https://app.yourorg.com
    ```

!!! note
    In production mode (frontend bundled with backend), CORS isn't needed for the main app - only for external API access.

---

### Box Integration

| Variable | Default | Description |
|----------|---------|-------------|
| `BOX_CLIENT_ID` | (empty) | Box OAuth client ID |
| `BOX_CLIENT_SECRET` | (empty) | Box OAuth client secret |
| `BOX_REDIRECT_URI` | `http://localhost:5173/admin/box/callback` | OAuth redirect URI |

Box integration is optional. If these aren't set, Box features are disabled in the UI.

??? info "Setting Up Box Integration"
    1. Create a Box Developer account at <a href="https://app.box.com/developers/console" target="_blank">app.box.com/developers/console</a>
    2. Create a Custom App with OAuth 2.0 authentication
    3. Copy your Client ID and Client Secret
    4. Set the redirect URI to match your deployment

    ```bash
    BOX_CLIENT_ID=your-client-id
    BOX_CLIENT_SECRET=your-client-secret
    BOX_REDIRECT_URI=https://yourdomain.com/admin/box/callback
    ```

---

### Application

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_NAME` | CSG Flux Dashboard | Application name in UI |
| `DEBUG` | false | Enable debug mode (never in production) |
| `DEMO_MODE` | false | Demo mode - resets database on restart |
| `ENABLE_SPLASH_SCREEN` | false | Show splash screen animation on load |

**Demo mode** is useful for public demos:

- Database deleted and recreated on each restart
- Sample data re-seeded
- Shows "Demo Mode" indicator in UI

---

## Example .env Files

??? example "Development"
    ```bash
    # Development settings
    DEBUG=false
    DEMO_MODE=false

    SECRET_KEY=dev-secret-key-change-in-production-min-32-chars
    REFRESH_SECRET_KEY=dev-refresh-secret-key-change-in-production

    DATABASE_URL=sqlite:///./data/crop_dashboard.db
    # DB_ENCRYPTION_KEY=  # Leave unset for easier debugging, or use dev flag

    ADMIN_EMAIL=admin@cropdash.dev
    ADMIN_PASSWORD=changeme123

    CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
    ```

??? example "Production"
    ```bash
    DEBUG=false
    DEMO_MODE=false

    SECRET_KEY=<64-char-random-hex>
    REFRESH_SECRET_KEY=<64-char-random-hex>

    DATABASE_URL=sqlite:///./data/crop_dashboard.db
    DB_ENCRYPTION_KEY=<encryption-key>

    ADMIN_EMAIL=admin@yourorg.com
    ADMIN_PASSWORD=<strong-password>

    CORS_ORIGINS=https://yourdomain.com
    COOKIE_SECURE=true

    # Box (if using)
    BOX_CLIENT_ID=<client-id>
    BOX_CLIENT_SECRET=<client-secret>
    BOX_REDIRECT_URI=https://yourdomain.com/admin/box/callback
    ```

---

## Troubleshooting

??? failure "Sessions invalidate on restart"
    `SECRET_KEY` isn't set, so a random one is generated each time. Set it explicitly in `.env`.

??? failure "Database won't open"
    The `DB_ENCRYPTION_KEY` doesn't match what was used to create the database. There's no recovery if the key is lost.

??? failure "CORS errors in browser"
    `CORS_ORIGINS` must include the exact frontend origin with protocol and port:

    - `https://app.example.com` (not `http://`)
    - `http://localhost:5173` (not just `localhost:5173`)

??? failure "Settings not updating"
    1. Restart the backend after changing `.env`
    2. Check for typos in variable names
    3. No spaces around `=` in the `.env` file

---

## Next Steps

- [Stack Overview](../the-stack/overview.md) - How the pieces connect
- [Authentication](../features/authentication.md) - How login and permissions work
- [Deployment](../deployment.md) - Deploying to production
