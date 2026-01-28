import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { api } from '../services/api'

export function useAuth() {
  const { user, tokens, isAuthenticated, setAuth, logout } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    // Verify token is still valid on mount
    const verifyAuth = async () => {
      if (tokens?.accessToken) {
        try {
          const currentUser = await api.auth.me()
          setAuth(currentUser, tokens)
        } catch {
          logout()
          navigate('/login')
        }
      }
    }

    verifyAuth()
  }, [])

  return { user, isAuthenticated, logout }
}
