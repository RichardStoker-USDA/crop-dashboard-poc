import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { toast } from '@/stores/toastStore'
import { cn } from '@/lib/utils'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  const { login, isLoading, token, checkAuth } = useAuthStore()
  const { theme, toggleTheme } = useThemeStore()
  const navigate = useNavigate()

  // Only check auth on initial mount if there's already a token (for direct /login visits)
  const [initialToken] = useState(token)
  const [isCheckingAuth, setIsCheckingAuth] = useState(!!initialToken)
  const hasCheckedAuth = useRef(false)

  // Redirect to dashboard if already authenticated (handles direct /login navigation)
  useEffect(() => {
    if (initialToken && !hasCheckedAuth.current) {
      hasCheckedAuth.current = true
      checkAuth().then(() => {
        if (useAuthStore.getState().isAuthenticated) {
          navigate('/dashboard', { replace: true })
        }
      }).finally(() => setIsCheckingAuth(false))
    }
  }, [initialToken, checkAuth, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      await login(email, password)
      toast.success('Welcome back!', 'Successfully signed in')
      navigate('/dashboard')
    } catch {
      setError('Invalid email or password')
      toast.error('Sign in failed', 'Please check your credentials and try again')
    }
  }

  // Show loading while checking if user is already authenticated
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-2xl shadow-xl border border-border p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <img
              src="/logo.png"
              alt="Crop Sensing Group Logo"
              className="h-24 mx-auto mb-4"
            />
            <h1 className="text-2xl font-bold text-foreground">Flux Dashboard</h1>
            <p className="text-muted-foreground mt-1">Crop Sensing Group</p>
            <p className="text-sm text-muted-foreground/70">UC Davis · USDA-ARS</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm"
              >
                {error}
              </motion.div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={cn(
                  'w-full px-4 py-2.5 rounded-lg border border-input bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary',
                  'transition-all duration-200'
                )}
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={cn(
                    'w-full px-4 py-2.5 pr-10 rounded-lg border border-input bg-background',
                    'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary',
                    'transition-all duration-200'
                  )}
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={cn(
                'w-full py-2.5 px-4 rounded-lg font-medium',
                'bg-primary text-primary-foreground',
                'hover:bg-primary/90 transition-all duration-200',
                'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'flex items-center justify-center gap-2'
              )}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 pt-6 border-t border-border text-center">
            <button
              onClick={toggleTheme}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Switch to {theme === 'light' ? 'dark' : 'light'} mode
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
