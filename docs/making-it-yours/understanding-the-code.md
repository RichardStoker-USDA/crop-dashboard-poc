# Understanding the Code

How to navigate and make sense of this codebase.

---

## What This Codebase Is

This is a production-ready full-stack web application. It handles authentication, access control, database management, and serves a dashboard. The dashboard visualization comes from the [Crop Sensing Group](https://github.com/crop-sensing/crop-dashboard). This documentation focuses on the infrastructure layer that wraps it:

- Complete authentication with tokens, refresh flows, instant revocation
- Centralized access control that filters data by user groups
- Admin panel for managing users, groups, and sites
- Audit logging for compliance and troubleshooting
- Database encryption for sensitive data
- Clean separation between frontend and backend

**This is a foundation, not a finished product.** The infrastructure works regardless of what data you're displaying.

---

## Reading Strategy

### Start with the Flow

Pick a user action and trace it through the code:

```
"User logs in"

1. Frontend: Login.tsx calls api.post('/api/auth/login')
2. Backend: api/auth.py receives request
3. Service: services/auth.py verifies credentials
4. Database: models/user.py defines User table
5. Response: Tokens set as httpOnly cookies
6. Frontend: authStore.ts updates state
```

Following a flow teaches you more than reading files in isolation.

### Suggested Flows to Trace

| Flow | Start Here | Key Files |
|------|------------|-----------|
| Login | `frontend/src/pages/Login.tsx` | api/auth.py, authStore.ts, core/security.py |
| View dashboard | `frontend/src/pages/Dashboard.tsx` | api/sites.py, api/sensors.py, core/access_control.py |
| Admin creates user | `frontend/src/pages/admin/Users.tsx` | api/users.py, schemas/user.py (UserCreate) |
| File upload | `frontend/src/pages/admin/Pipeline.tsx` | api/pipeline.py, services/pipeline_worker.py |

---

## Key Patterns

### Backend: Dependency Injection

FastAPI uses dependency injection to provide database sessions and verify authentication:

```python
@router.get("/users")
def list_users(db: DbSession, admin: AdminUser):
    # db is automatically provided and closed after request
    # admin is verified - non-admins get 403
    return db.query(User).all()
```

Follow `DbSession` and `AdminUser` to `core/dependencies.py` to see how they work.

### Backend: Schemas vs Models

- **Models** (`models/*.py`): Database structure - what's stored
- **Schemas** (`schemas/*.py`): API structure - what's sent/received

```python
# Model has password_hash (stored in DB)
class User(Base):
    password_hash: Mapped[str]

# Schema excludes it (sent to client)
class UserResponse(BaseModel):
    id: str
    email: str
    # no password_hash
```

### Frontend: Zustand Stores

Global state lives in stores, not component state:

```typescript
// Any component can access auth state
const { user, logout } = useAuthStore();
```

Stores are in `frontend/src/stores/`. Start with `authStore.ts`.

### Frontend: Route Guards

Protected routes wrap components:

```tsx
<Route path="/dashboard" element={
  <PrivateRoute>
    <Dashboard />
  </PrivateRoute>
} />
```

Follow `PrivateRoute` in `App.tsx` to see how it checks authentication.

---

## Finding Things

### By Feature

| Feature | Backend | Frontend |
|---------|---------|----------|
| Auth | `api/auth.py`, `services/auth.py` | `stores/authStore.ts`, `pages/Login.tsx` |
| Users | `api/users.py`, `models/user.py` | `pages/admin/Users.tsx` |
| Groups | `api/groups.py`, `models/group.py` | `pages/admin/Groups.tsx` |
| Sites | `api/sites.py`, `models/site.py` | `pages/admin/Sites.tsx` |
| Dashboard | `api/sensors.py` | `pages/Dashboard.tsx`, `components/charts/` |
| File upload | `api/pipeline.py` | `pages/admin/Pipeline.tsx` |
| Box sync | `api/box.py`, `services/box_*.py` | `pages/admin/BoxIntegration.tsx` |

### By Layer

| Layer | Location | Purpose |
|-------|----------|---------|
| Routes | `backend/api/` | HTTP endpoints |
| Business logic | `backend/services/` | Complex operations |
| Data access | `backend/models/` | Database tables |
| Validation | `backend/schemas/` | Request/response shapes |
| Config | `backend/config.py` | Environment settings |
| UI pages | `frontend/src/pages/` | Full screens |
| UI components | `frontend/src/components/` | Reusable pieces |
| State | `frontend/src/stores/` | Global state |
| API client | `frontend/src/lib/api.ts` | HTTP calls |

---

## Debugging Tips

### Backend

**See what's happening:**
```python
print(f"User: {user.email}, Groups: {user.groups}")
# or use logging
import logging
logger = logging.getLogger(__name__)
logger.info(f"Processing file: {filename}")
```

**Interactive docs:** Open `http://localhost:8000/docs` to test endpoints directly.

**Check the database:**
```bash
# If using unencrypted SQLite
sqlite3 data/crop_dashboard.db
.tables
SELECT * FROM users;
```

### Frontend

**React DevTools:** Install the browser extension to inspect component state.

**Console logging:**
```typescript
console.log('User state:', user);
console.log('API response:', response.data);
```

**Network tab:** Browser DevTools → Network to see API requests/responses.

---

## Common Questions

??? question "Where does authentication happen?"
    - Token creation: `backend/services/auth.py`
    - Token verification: `backend/core/dependencies.py`
    - Cookie setting: `backend/api/auth.py`
    - Frontend state: `frontend/src/stores/authStore.ts`

??? question "How does access control work?"
    - Context creation: `backend/core/access_control.py`
    - Used in routes: `access: AccessContext` parameter
    - Filters data by user's groups automatically

??? question "Where are environment variables loaded?"
    - Config definition: `backend/config.py`
    - Loaded from `.env` file or environment
    - Access via `from backend.config import settings`

??? question "How do I add a new API endpoint?"
    See [Adding Features](adding-features.md) for a step-by-step guide.

---

## What You Can Do With It

### Use it as-is
If you need the dashboard with user management, you're done. Configure it and load data.

### Keep the infrastructure, replace the dashboard
The auth, access control, and admin functionality work regardless of what data you display. The dashboard components can be replaced entirely.

### Take pieces you like
The code is modular. Extract the auth system, the access control pattern, or the admin panel structure.

### Use it as a learning reference
Trace through how FastAPI talks to React, how JWT tokens work, how group-based access control is implemented.

---

## Next Steps

- [Adding Features](adding-features.md) - Step-by-step guide to extending the app
- [Starting Fresh](starting-fresh.md) - Strip it down for a new project
- [Backend](../the-stack/backend.md) - Detailed backend structure
- [Frontend](../the-stack/frontend.md) - Detailed frontend structure
