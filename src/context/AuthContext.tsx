import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { cleanupPushOnSignOut } from '../lib/pushNotifications'
import { supabase } from '../supabase'

type AuthContextValue = {
  session: Session | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    void supabase.auth.getSession().then(({ data: { session: next } }) => {
      if (cancelled) return
      setSession(next ?? null)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'SIGNED_OUT') {
        void cleanupPushOnSignOut()
      }
      setSession(next)
      setLoading(false)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo(
    () => ({ session, loading }),
    [session, loading],
  )

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
