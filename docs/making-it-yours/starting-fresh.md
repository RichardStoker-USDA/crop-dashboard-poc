# Starting Fresh

How to strip out the dashboard and use this platform for a new project.

---

## What's What

### Keep (Infrastructure)

These work for any application:

=== "Backend"

    | Component | Files |
    |-----------|-------|
    | Authentication | `api/auth.py`, `services/auth.py`, `core/security.py` |
    | Users | `api/users.py`, `models/user.py` |
    | Groups | `api/groups.py`, `models/group.py` |
    | Admin | `api/admin.py` |
    | Access control | `core/access_control.py`, `core/dependencies.py` |
    | Audit logging | `models/pipeline.py` (AuditLog, FileArchive, PipelineConfig) |
    | Database | `database.py`, `config.py` |
    | Box integration | `api/box.py`, `services/box_integration.py`, `services/box_worker.py`, `models/box_connection.py` |
    | Pipeline API | `api/pipeline.py` |

=== "Frontend"

    | Component | Files |
    |-----------|-------|
    | Auth state | `stores/authStore.ts`, `lib/api.ts` |
    | Theme | `stores/themeStore.ts` |
    | Toasts | `stores/toastStore.ts`, `components/ui/Toast.tsx` |
    | Admin panel | `pages/admin/*` |
    | Login | `pages/Login.tsx` |
    | Landing | `pages/Landing.tsx` |
    | Routing | `App.tsx` |

### Replace (Domain-Specific)

These are specific to the Crop Sensing Group's dashboard:

=== "Backend"

    | Component | Files |
    |-----------|-------|
    | Sites | `models/site.py`, `api/sites.py` |
    | Sensor data | `models/sensor_data.py`, `api/sensors.py` |
    | Data parsing | `services/data_import.py` (CSV parsing logic) |
    | Pipeline worker | `services/pipeline_worker.py` (keep structure, replace parsing) |

=== "Frontend"

    | Component | Files |
    |-----------|-------|
    | Dashboard | `pages/Dashboard.tsx` |
    | Charts | `components/charts/*` |
    | Types | `types/index.ts` (crop/site specific types) |

---

## Ways to Do It

### Gradual Replacement

Keep the dashboard running while building new features alongside.

1. Add new data models and endpoints
2. Create new frontend pages
3. Test everything
4. Remove crop-specific code when ready

### Clean Slate

Remove crop-specific code first, then build fresh.

1. Delete crop-specific files
2. Clean up imports and routes
3. Build your features
4. Keep the auth and admin as-is

### Keep Both

Run the dashboard AND new features together.

1. Add new features without removing existing
2. Add new navigation items
3. Share auth and admin infrastructure

*If you built the dashboard... this is probably your best option. Just sayin'.*

---

## Clean Slate Guide

Remove the crop dashboard and start with a clean platform.

### Step 1: Backend - Remove Domain Models

Delete these files:

```
backend/models/
├── site.py           # DELETE
└── sensor_data.py    # DELETE

backend/api/
├── sites.py          # DELETE
└── sensors.py        # DELETE

backend/services/
└── data_import.py    # DELETE - domain-specific parsing
```

!!! note "Keep pipeline_worker.py"
    `services/pipeline_worker.py` handles the file upload infrastructure. You can keep it and modify the parsing logic for your data format, or delete it if you don't need file uploads.

### Step 2: Backend - Update Imports

Edit `backend/models/__init__.py`:

```python
# Remove these lines:
from backend.models.site import Crop, Site, GroupSite, EquipmentGroup, Parameter
from backend.models.sensor_data import SensorData

# Also remove from __all__:
# "Crop", "Site", "GroupSite", "EquipmentGroup", "Parameter", "SensorData"
```

Edit `backend/api/__init__.py`:

```python
# Change from:
from backend.api import auth, users, sites, sensors, groups, admin, pipeline, box

# To:
from backend.api import auth, users, groups, admin, pipeline, box

# Remove these router registrations:
api_router.include_router(sites.router, prefix="/sites", tags=["Sites"])
api_router.include_router(sensors.router, prefix="/sensors", tags=["Sensors"])
```

### Step 3: Frontend - Remove Dashboard

Delete these files:

```
frontend/src/
├── pages/
│   └── Dashboard.tsx    # DELETE
├── components/
│   └── charts/          # DELETE entire folder
```

### Step 4: Frontend - Update Routing

Edit `App.tsx`:

```tsx
// Remove this import:
import Dashboard from '@/pages/Dashboard'

// Remove this route:
<Route
  path="/dashboard"
  element={
    <PrivateRoute>
      <Dashboard />
    </PrivateRoute>
  }
/>

// Update AdminRoute redirect (line ~45):
// From: return <Navigate to="/dashboard" replace />
// To:   return <Navigate to="/admin" replace />
```

### Step 5: Reset Database

```bash
rm data/crop_dashboard.db
# Restart backend - creates clean database
```

---

## After Cleanup

You now have:

- Working authentication (login, logout, refresh)
- User management (create, edit, delete users)
- Group management (create groups, assign users/resources)
- Audit logging infrastructure
- Admin panel UI (overview, users, groups, audit log, database, Box integration)
- Theme switching (light/dark)
- File upload infrastructure (if you kept pipeline_worker.py)
- Box.com integration (optional)

---

## Customize for Your Use Case

### 1. Create Your Model

```python title="backend/models/your_thing.py"
from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from backend.database import Base

class YourThing(Base):
    __tablename__ = "your_things"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    # your fields...
```

### 2. Register the Model

Add to `backend/models/__init__.py`:

```python
from backend.models.your_thing import YourThing

__all__ = [
    # ... existing exports
    "YourThing"
]
```

### 3. Create Schema

```python title="backend/schemas/your_thing.py"
from pydantic import BaseModel

class YourThingCreate(BaseModel):
    name: str

class YourThingResponse(BaseModel):
    id: str
    name: str

    class Config:
        from_attributes = True
```

### 4. Create API

```python title="backend/api/your_thing.py"
from fastapi import APIRouter
from backend.core.dependencies import DbSession, AccessContext
from backend.models import YourThing
from backend.schemas.your_thing import YourThingResponse

router = APIRouter()

@router.get("", response_model=list[YourThingResponse])
def list_things(db: DbSession, access: AccessContext):
    # Filter by access if needed
    return db.query(YourThing).all()
```

### 5. Register the Router

Add to `backend/api/__init__.py`:

```python
from backend.api import your_thing  # add import

api_router.include_router(
    your_thing.router,
    prefix="/your-things",
    tags=["Your Things"]
)
```

### 6. Create Frontend Page

```tsx title="frontend/src/pages/YourPage.tsx"
import { useState, useEffect } from 'react'
import api from '@/lib/api'

interface YourThing {
  id: string
  name: string
}

export default function YourPage() {
  const [things, setThings] = useState<YourThing[]>([])

  useEffect(() => {
    api.get('/api/your-things').then(r => setThings(r.data))
  }, [])

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Your Things</h1>
      <ul>
        {things.map(thing => (
          <li key={thing.id}>{thing.name}</li>
        ))}
      </ul>
    </div>
  )
}
```

### 7. Add to Routes

```tsx title="App.tsx"
import YourPage from '@/pages/YourPage'

// Add inside <Routes>:
<Route
  path="/your-page"
  element={
    <PrivateRoute>
      <YourPage />
    </PrivateRoute>
  }
/>
```

---

## Group-Based Access

If your data needs group-based filtering (like sites), follow this pattern:

### Model with Group Link

```python
class YourThing(Base):
    # ... other fields
    group_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("groups.id"), index=True
    )
```

### Filter by Access

```python
@router.get("")
def list_things(db: DbSession, access: AccessContext):
    query = db.query(YourThing)
    if not access.is_admin:
        # Get user's groups
        user_groups = [g.group_id for g in access.user.groups]
        query = query.filter(YourThing.group_id.in_(user_groups))
    return query.all()
```

---

## Example Projects

Ideas for what you could build with this platform:

| Project | Replace Dashboard With |
|---------|----------------------|
| Lab sample tracker | Sample management, test results |
| Equipment maintenance | Equipment list, maintenance logs |
| Inventory system | Items, locations, transactions |
| Document repository | Documents, categories, access control |

All would use the same auth, user management, groups, and admin panel.

---

## Next Steps

- [Adding Features](adding-features.md) - Step-by-step feature guide
- [Understanding the Code](understanding-the-code.md) - Navigate the codebase
- [Backend](../the-stack/backend.md) - Backend architecture
