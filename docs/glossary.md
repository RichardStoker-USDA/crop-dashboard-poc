# Glossary

Technical terms used throughout this documentation.

---

## Authentication & Security

| Term | Definition |
|------|------------|
| **Access Token** | Short-lived JWT (30 min) sent with API requests to prove user is logged in |
| **Refresh Token** | Long-lived token (7 days) used to obtain new access tokens |
| **Token Version** | Version number in user record; increment to invalidate all tokens |
| **JWT** | JSON Web Token - self-contained token with user data and signature |
| **bcrypt** | Password hashing algorithm; intentionally slow to prevent brute force |
| **Salt** | Random data added to password before hashing; makes identical passwords produce different hashes |
| **httpOnly Cookie** | Cookie inaccessible to JavaScript; protects against XSS attacks |
| **SameSite** | Cookie attribute controlling when cookies are sent; helps prevent CSRF attacks |
| **CORS** | Cross-Origin Resource Sharing; controls which websites can call your API |
| **CSRF** | Cross-Site Request Forgery - tricking users into making unintended requests |
| **XSS** | Cross-Site Scripting - injecting malicious scripts into web pages |
| **OAuth2** | Industry-standard authorization protocol; used for Box.com integration |
| **RBAC** | Role-Based Access Control - permissions based on user roles (admin, user) |
| **2FA** | Two-Factor Authentication - requiring a second verification method beyond password |
| **Rate Limiting** | Restricting how many requests a client can make in a time period |

---

## Database

| Term | Definition |
|------|------------|
| **SQLite** | Lightweight file-based database; no server needed |
| **SQLCipher** | SQLite with encryption; protects data at rest |
| **ORM** | Object-Relational Mapping; interact with database using Python objects |
| **SQLAlchemy** | Python ORM used in this app |
| **Migration** | Version-controlled database structure change |
| **Foreign Key** | Field linking one table to another |

---

## Backend

| Term | Definition |
|------|------------|
| **FastAPI** | Python web framework for building APIs |
| **Uvicorn** | ASGI server that runs FastAPI |
| **ASGI** | Asynchronous Server Gateway Interface - Python standard for async web servers |
| **Pydantic** | Data validation using type hints |
| **Router** | FastAPI way to organize related endpoints |
| **Dependency Injection** | Dependencies provided to functions rather than created inside them |
| **Endpoint** | URL path that handles a specific operation |
| **Middleware** | Code that runs between request and response |
| **Lifespan** | FastAPI pattern for startup/shutdown code |

---

## Frontend

| Term | Definition |
|------|------------|
| **React** | JavaScript library for building user interfaces |
| **TypeScript** | JavaScript with static type checking |
| **SPA** | Single Page Application - entire app loads once, navigation handled in browser |
| **Component** | Reusable piece of user interface |
| **State** | Data a component remembers between renders |
| **Props** | Data passed from parent to child component |
| **Zustand** | Lightweight state management library |
| **Tailwind CSS** | Utility-first CSS framework |
| **JSX** | HTML-like syntax in JavaScript/TypeScript |
| **Vite** | Build tool and development server |
| **Hook** | React function for using state and other features in components |

---

## HTTP

### Methods

| Method | Purpose |
|--------|---------|
| `GET` | Retrieve data |
| `POST` | Create new data |
| `PUT` | Update existing data |
| `DELETE` | Remove data |

### Status Codes

| Code | Meaning |
|------|---------|
| `200` | OK - success |
| `201` | Created - resource created |
| `204` | No Content - success, nothing to return |
| `400` | Bad Request - invalid input |
| `401` | Unauthorized - not logged in |
| `403` | Forbidden - logged in but not permitted |
| `404` | Not Found - resource doesn't exist |
| `500` | Internal Server Error |

---

## Application-Specific

| Term | Definition |
|------|------------|
| **Site** | Physical location where sensors are deployed |
| **Crop** | Plant type being monitored; sites belong to a crop |
| **Group** | Organizational unit controlling access; users belong to groups |
| **UserGroup** | Association between a user and a group with a role (viewer, editor, admin) |
| **GroupSite** | Association granting a group access to a site |
| **Audit Log** | Record of who did what, when, and from where |
| **Pipeline** | Process for importing and processing data files |
| **AccessContext** | Object containing user's permissions and accessible sites |
| **Box.com** | Cloud storage service; used for automated file sync |
| **Demo Mode** | Configuration that resets database on restart; for demonstrations only |

---

## Infrastructure

| Term | Definition |
|------|------------|
| **Environment Variable** | Configuration stored outside code (secrets, settings) |
| **Docker** | Platform for running applications in isolated containers |
| **Container** | Isolated environment for running an application with its dependencies |
| **Volume** | Persistent storage that survives container restarts |
| **Hot Reload** | Automatic restart when code changes |
| **Port** | Number identifying a process (backend: 8000, frontend: 5173) |
| **Localhost** | Your own computer as a server (`http://localhost:8000`) |
| **Reverse Proxy** | Server that forwards requests to another server; handles SSL, load balancing |
| **Caddy** | Web server with automatic HTTPS |
| **systemd** | Linux service manager for running background processes |
| **VPS** | Virtual Private Server - a virtual machine you rent from a provider |

---

## Patterns

### REST (Representational State Transfer)

API design style using HTTP methods on resources:

```
GET    /api/users      # List users
POST   /api/users      # Create user
GET    /api/users/123  # Get user 123
PUT    /api/users/123  # Update user 123
DELETE /api/users/123  # Delete user 123
```

### CRUD

Four basic data operations: **C**reate, **R**ead, **U**pdate, **D**elete.

### Model vs Schema

- **Model** (SQLAlchemy): Database table structure
- **Schema** (Pydantic): API request/response structure

```python
# Model - what's stored
class User(Base):
    password_hash: str  # In database

# Schema - what's sent
class UserResponse(BaseModel):
    email: str  # No password_hash
```
