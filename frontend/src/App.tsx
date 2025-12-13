import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import Login from '@/pages/Login'
import Landing from '@/pages/Landing'
import Dashboard from '@/pages/Dashboard'
import { AdminLayout, Overview, Users, Groups, Sites, AuditLog, Pipeline, DatabaseManagement, BoxIntegration } from '@/pages/admin'
import ToastContainer from '@/components/ui/Toast'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, checkAuth, token } = useAuthStore()
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    // Only check auth if we have a stored token
    if (token) {
      checkAuth().finally(() => setIsChecking(false))
    } else {
      setIsChecking(false)
    }
  }, [checkAuth, token])

  // Show loading while checking auth
  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore()

  if (!user?.is_admin) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

function App() {
  const { theme } = useThemeStore()

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(theme)
  }, [theme])

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <PrivateRoute>
              <AdminRoute>
                <AdminLayout />
              </AdminRoute>
            </PrivateRoute>
          }
        >
          <Route index element={<Overview />} />
          <Route path="users" element={<Users />} />
          <Route path="groups" element={<Groups />} />
          <Route path="sites" element={<Sites />} />
          <Route path="pipeline" element={<Pipeline />} />
          <Route path="box" element={<BoxIntegration />} />
          <Route path="box/callback" element={<BoxIntegration />} />
          <Route path="database" element={<DatabaseManagement />} />
          <Route path="audit" element={<AuditLog />} />
        </Route>
        <Route path="/" element={<Landing />} />
      </Routes>
      <ToastContainer />
    </BrowserRouter>
  )
}

export default App
