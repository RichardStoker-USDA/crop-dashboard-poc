import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '@/lib/api'

interface User {
  id: string
  email: string
  full_name: string
  is_admin: boolean
  groups: string[]
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null })
        try {
          // Login sets httpOnly cookies automatically
          await api.post('/api/auth/login', { email, password })

          // Fetch user info (cookies sent automatically)
          const userResponse = await api.get('/api/auth/me')
          set({
            user: userResponse.data,
            isAuthenticated: true,
            isLoading: false
          })
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Login failed'
          set({ error: message, isLoading: false })
          throw error
        }
      },

      logout: async () => {
        // Call backend to invalidate tokens and clear cookies
        try {
          await api.post('/api/auth/logout')
        } catch {
          // Ignore errors - we're logging out anyway
        }

        set({
          user: null,
          isAuthenticated: false,
          error: null
        })
      },

      checkAuth: async () => {
        try {
          // Cookies are sent automatically - if valid, we get user info
          const response = await api.get('/api/auth/me')
          set({ user: response.data, isAuthenticated: true })
        } catch {
          set({ user: null, isAuthenticated: false })
        }
      }
    }),
    {
      name: 'auth-storage',
      // Only persist user info, not auth state (cookies handle auth)
      partialize: (state) => ({ user: state.user })
    }
  )
)
