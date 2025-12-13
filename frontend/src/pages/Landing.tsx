import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import SplashScreen from '@/components/SplashScreen'
import api from '@/lib/api'

export default function Landing() {
  const [splashComplete, setSplashComplete] = useState(false)
  const [splashEnabled, setSplashEnabled] = useState<boolean | null>(null)
  const navigate = useNavigate()
  const { token, checkAuth } = useAuthStore()
  const hasCheckedAuth = useRef(false)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [userName, setUserName] = useState<string | null>(null)

  // Check config and auth status on mount
  useEffect(() => {
    if (hasCheckedAuth.current) return
    hasCheckedAuth.current = true

    // Fetch config to check if splash is enabled
    api.get('/api/config/mode')
      .then(res => {
        setSplashEnabled(res.data.enable_splash_screen)
      })
      .catch(() => {
        setSplashEnabled(false)
      })

    if (token) {
      checkAuth().then(() => {
        const state = useAuthStore.getState()
        setIsAuthenticated(state.isAuthenticated)
        if (state.user?.full_name) {
          setUserName(state.user.full_name.split(' ')[0])
        }
      })
    } else {
      setIsAuthenticated(false)
    }
  }, [token, checkAuth])

  // Handle redirect when splash is disabled or complete
  const doRedirect = () => {
    if (isAuthenticated) {
      toast.success(`Welcome back, ${userName || 'user'}!`, 'Redirecting to dashboard...')
      navigate('/dashboard', { replace: true })
    } else {
      navigate('/login', { replace: true })
    }
  }

  // If splash is disabled, redirect immediately once we know auth status
  useEffect(() => {
    if (splashEnabled === false && isAuthenticated !== null) {
      doRedirect()
    }
  }, [splashEnabled, isAuthenticated])

  const handleSplashComplete = () => {
    setSplashComplete(true)
    doRedirect()
  }

  // Still loading config or auth
  if (splashEnabled === null || isAuthenticated === null) {
    return <div className="min-h-screen bg-white" />
  }

  // Splash disabled - show blank while redirecting
  if (!splashEnabled) {
    return <div className="min-h-screen bg-white" />
  }

  return (
    <div className="min-h-screen bg-white">
      {!splashComplete && (
        <SplashScreen
          onComplete={handleSplashComplete}
          videoDuration={9.8}
          fadeStartOffset={2}
        />
      )}
    </div>
  )
}
