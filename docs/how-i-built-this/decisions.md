# Decisions

Specific technical decisions and the reasoning behind each choice. Each section covers what problem was being solved, what options existed, and why that choice was made.

---

## Centralized Access Control

**Problem:** Users should only see data for sites they're authorized to access. Checking permissions in every endpoint is error-prone - miss one, and there's a security hole.

**Choice:** A `UserAccessContext` computed once per request and injected via FastAPI dependencies.

```python
# backend/core/access_control.py
@dataclass
class UserAccessContext:
    user: User
    is_admin: bool
    site_ids: set[str]
    site_codes: set[str]
    crop_ids: set[str]

    def require_site_access(self, site_id: str) -> None:
        if not self.is_admin and site_id not in self.site_ids:
            raise HTTPException(403, "Access denied")
```

Every endpoint that needs access control injects `AccessContext`:

```python
@router.get("/data")
def get_data(access: AccessContext, db: DbSession):
    query = db.query(SensorData)
    if not access.is_admin:
        query = query.filter(SensorData.site_id.in_(access.site_ids))
    return query.all()
```

**Why this works:** Single source of truth, impossible to forget checks, easy to audit. The pattern makes security automatic rather than opt-in.

**Tradeoff:** More upfront setup, but eliminates an entire class of security bugs.

---

## JWT in httpOnly Cookies

**Problem:** Where to store authentication tokens securely.

**Options:**

| Method | Security | Tradeoff |
|----------|----------|----------|
| localStorage | Vulnerable to XSS | JavaScript can read tokens |
| httpOnly cookies | XSS-safe | Slightly more complex |
| Server sessions | Requires server state | Harder to scale |

**Choice:** JWT tokens in httpOnly cookies with token versioning for instant revocation.

```python
# User model has token_version
class User(Base):
    token_version: Mapped[int] = mapped_column(Integer, default=1)

# Tokens include version
access_token = create_token({
    "sub": user.id,
    "token_version": user.token_version,
    "exp": now + 30 minutes
})

# On logout or password change, increment version
user.token_version += 1  # All existing tokens now invalid
```

**Why this works:**

- httpOnly cookies can't be read by JavaScript (XSS protection)
- SameSite=lax provides CSRF protection
- Token versioning allows instant revocation without server-side session storage
- Stateless - scales horizontally

**Tradeoff:** More complex than simple sessions, requires a database lookup per request to verify version.

---

## Group-Based Access Control

**Problem:** Different users need access to different sites. Simple role-based (admin/user) isn't granular enough.

**Choice:** Users belong to groups, groups have access to sites.

```
User "Alice" → Group "Vacaville Team" → Site "VAC_001"
                                      → Site "VAC_002"

User "Alice" → Group "Davis Research" → Site "DAV_001"

Alice sees: VAC_001, VAC_002, DAV_001
```

**Why this works:** Maps naturally to organizational structure. Onboarding a new user means adding them to the right groups. Giving a team access to a new site means adding the site to their group.

**Tradeoff:** More complex queries (joining through user_groups and group_sites), can't easily do per-user exceptions.

---

## Separate Pydantic Schemas from SQLAlchemy Models

**Problem:** Database models and API responses often need different shapes. A User model has `password_hash`, but API responses should never include it.

**Choice:** Separate Pydantic schemas for API input/output.

```python
# SQLAlchemy model - what's in the database
class User(Base):
    id: Mapped[str]
    email: Mapped[str]
    password_hash: Mapped[str]  # Never expose!
    full_name: Mapped[str]
    is_admin: Mapped[bool]

# Pydantic schema - what the API returns
class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    is_admin: bool
    groups: list[str]  # Computed from relationships
```

**Why this works:** Security (sensitive fields never accidentally exposed), flexibility (reshape data for API), validation (Pydantic validates requests automatically).

**Tradeoff:** Some duplication between models and schemas.

---

## Zustand for State Management

**Problem:** React components need to share state - auth status, selected filters, theme preference.

**Options:**

| Method | Complexity | When to use |
|----------|------------|-------------|
| React Context | Low | Simple, few consumers |
| Redux | High | Large apps, need devtools |
| Zustand | Low | Type-safe, minimal boilerplate |

**Choice:** Zustand.

```typescript
// frontend/src/stores/authStore.ts
export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isAuthenticated: false,

  login: async (email: string, password: string) => {
    await api.post('/api/auth/login', { email, password })
    const response = await api.get('/api/auth/me')
    set({ user: response.data, isAuthenticated: true })
  },

  logout: async () => {
    await api.post('/api/auth/logout')
    set({ user: null, isAuthenticated: false })
  }
}))
```

**Why this works:** Minimal API, TypeScript-friendly, only re-renders components that use changed state, tiny bundle size.

**Tradeoff:** Less ecosystem than Redux, but for this app size, that's fine.

---

## SQLite over PostgreSQL

**Problem:** Need a database. PostgreSQL is the production standard, but requires running a server.

**Choice:** SQLite with SQLCipher encryption.

**Why this works:**

- Zero configuration - just a file
- Easy backup - copy the file
- Encryption at rest with SQLCipher
- Handles concurrent reads well
- Good enough for read-heavy dashboards

**Tradeoff:** Limited concurrent writes (one writer at a time). Not suitable for high-frequency writes or multiple backend instances.

**When to switch:** If you need multiple backend instances or sustained high write volume, PostgreSQL is a straightforward migration - SQLAlchemy abstracts most differences.

---

## Separate Frontend and Backend

**Problem:** Need a web application. Build it as one thing or two?

**Choice:** Separate applications communicating via REST API.

```
frontend/          # React application
  src/
  package.json

backend/           # FastAPI application
  api/
  models/
  main.py
```

**Why this works:**

- Frontend can be replaced without touching backend
- Backend API can serve multiple clients (web, mobile, scripts)
- Teams can work independently
- Each layer uses optimal tools
- Industry-standard architecture

**Tradeoff:** Two build systems, CORS configuration needed, slightly more complex deployment.

---

## Summary

| Decision | Choice | Key Reason |
|----------|--------|------------|
| Access Control | Centralized AccessContext | Security by default |
| Token Storage | httpOnly cookies + versioning | XSS-safe, instant revocation |
| Permissions | Group-based | Organizational mapping |
| Data Shapes | Separate schemas from models | Security, flexibility |
| State Management | Zustand | Minimal, type-safe |
| Database | SQLite/SQLCipher | Simple, portable, encrypted |
| Architecture | Separate frontend/backend | Flexibility, scalability |

---

## Next Steps

- [Stack Overview](../the-stack/overview.md) - How the pieces connect
- [Backend](../the-stack/backend.md) - FastAPI code structure
- [Authentication](../features/authentication.md) - Deep dive into the auth system
