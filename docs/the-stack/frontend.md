# Frontend

React + TypeScript frontend structure and patterns.

**Official docs:** [React Learn](https://react.dev/learn) | [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/)

---

## Folder Structure

```
frontend/src/
├── components/              # Reusable UI components
│   ├── charts/              # Data visualization (Crop Sensing Group)
│   │   ├── SensorChart.tsx
│   │   └── SiteMap.tsx
│   └── ui/                  # Base UI components
│       ├── Toast.tsx
│       └── Skeleton.tsx
├── pages/                   # Page-level components
│   ├── admin/               # Admin panel pages
│   │   ├── AdminLayout.tsx
│   │   ├── Users.tsx
│   │   ├── Groups.tsx
│   │   └── ...
│   ├── Dashboard.tsx
│   ├── Login.tsx
│   └── Landing.tsx
├── stores/                  # Zustand state stores
│   ├── authStore.ts
│   ├── themeStore.ts
│   └── toastStore.ts
├── lib/                     # Utilities
│   ├── api.ts               # Axios client with auth
│   └── utils.ts             # Helper functions
├── types/                   # TypeScript type definitions
├── App.tsx                  # Root component with routing
└── main.tsx                 # Entry point
```

---

## Core Patterns

### Components

Reusable UI pieces with props and internal state:

```tsx
interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

function Button({ label, onClick, variant = 'primary' }: ButtonProps) {
  return (
    <button
      className={cn(
        'px-4 py-2 rounded font-medium',
        variant === 'primary' ? 'bg-blue-500 text-white' : 'bg-gray-200'
      )}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
```

### Pages

Full-screen components mapped to routes:

```tsx
// pages/Dashboard.tsx
function Dashboard() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto p-4">
        <SiteMap />
        <SensorChart />
      </main>
    </div>
  );
}
```

### Stores (Zustand)

Global state shared across components:

```tsx
// stores/authStore.ts
export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isAuthenticated: false,

  login: async (email, password) => {
    // httpOnly cookies set automatically by browser
    await api.post('/api/auth/login', { email, password });
    const response = await api.get('/api/auth/me');
    set({ user: response.data, isAuthenticated: true });
  },

  logout: async () => {
    await api.post('/api/auth/logout');
    set({ user: null, isAuthenticated: false });
  }
}));

// Usage in any component
const { user, logout } = useAuthStore();
```

!!! note "Token Storage"
    Tokens are stored in httpOnly cookies by the browser, not in JavaScript. This prevents XSS attacks from stealing tokens.

---

## Routing

Routes defined in `App.tsx`:

```tsx
<BrowserRouter>
  <Routes>
    {/* Public */}
    <Route path="/" element={<Landing />} />
    <Route path="/login" element={<Login />} />

    {/* Protected */}
    <Route path="/dashboard" element={
      <PrivateRoute><Dashboard /></PrivateRoute>
    } />

    {/* Admin only */}
    <Route path="/admin" element={
      <PrivateRoute><AdminRoute><AdminLayout /></AdminRoute></PrivateRoute>
    }>
      <Route index element={<Overview />} />
      <Route path="users" element={<Users />} />
      <Route path="groups" element={<Groups />} />
    </Route>
  </Routes>
</BrowserRouter>
```

### Route Guards

```tsx
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();

  if (!user?.is_admin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
```

---

## API Communication

Axios client in `lib/api.ts`:

```tsx
const api = axios.create({
  baseURL: '',
  withCredentials: true,  // Send httpOnly cookies with every request
});

// Auto-refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await api.post('/api/auth/refresh');
      return api(error.config);
    }
    return Promise.reject(error);
  }
);
```

### Using the API

```tsx
import api from '@/lib/api';

function UserList() {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    api.get('/api/users').then(r => setUsers(r.data));
  }, []);

  return <ul>{users.map(u => <li key={u.id}>{u.full_name}</li>)}</ul>;
}
```

---

## State Management

| State Type | Where | Example |
|------------|-------|---------|
| Component state | `useState` | Form inputs, local UI |
| Shared state | Zustand store | Auth, theme, toasts |
| Server data | API + `useState` | User list, sensor data |

---

## Styling with Tailwind

Utility classes directly in JSX:

```tsx
<button className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded">
  Click Me
</button>
```

### Common Patterns

```tsx
// Layout
<div className="flex items-center justify-between">
<div className="grid grid-cols-3 gap-4">

// Spacing
<div className="p-4 m-2">
<div className="space-y-4">

// Dark mode
<div className="bg-white dark:bg-gray-800">

// Responsive
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
```

### The `cn()` Helper

Combines class names conditionally:

```tsx
import { cn } from '@/lib/utils';

<button className={cn(
  'px-4 py-2 rounded',
  isActive && 'bg-blue-500 text-white',
  isDisabled && 'opacity-50'
)}>
```

---

## Charts and Maps

### Plotly Charts (Crop Sensing Group)

```tsx
import Plot from 'react-plotly.js';

function SensorChart({ data, parameter }: ChartProps) {
  return (
    <Plot
      data={[{
        x: data.map(d => d.timestamp),
        y: data.map(d => d.value),
        type: 'scatter',
        mode: 'lines+markers',
      }]}
      layout={{ title: parameter }}
    />
  );
}
```

### Leaflet Maps

```tsx
import { MapContainer, TileLayer, Marker } from 'react-leaflet';

function SiteMap({ sites }: { sites: Site[] }) {
  return (
    <MapContainer center={[38.5, -121.5]} zoom={7}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {sites.map(site => (
        <Marker key={site.id} position={[site.latitude, site.longitude]} />
      ))}
    </MapContainer>
  );
}
```

---

## Development

### Run Dev Server

```bash
cd frontend
npm run dev
```

Runs at `http://localhost:5173` with hot module replacement.

### Build for Production

```bash
npm run build
```

Output goes to `frontend/dist/`.

---

## File Reference

| File | Purpose |
|------|---------|
| `main.tsx` | Entry point |
| `App.tsx` | Root component, routes |
| `stores/authStore.ts` | Auth state |
| `stores/themeStore.ts` | Light/dark theme |
| `lib/api.ts` | Axios client |
| `lib/utils.ts` | Helper functions |
| `pages/Dashboard.tsx` | Main dashboard |
| `pages/Login.tsx` | Login form |
| `pages/admin/*` | Admin panel |

---

## Next Steps

- [Backend](backend.md) - API structure
- [Authentication](../features/authentication.md) - Auth flow
- [Decisions](../how-i-built-this/decisions.md) - Why these patterns
