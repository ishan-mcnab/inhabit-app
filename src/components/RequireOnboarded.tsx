import { useCallback, useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { SplashScreen } from './SplashScreen'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase'

type GateState =
  | { status: 'loading' }
  | { status: 'ready'; onboarded: boolean }
  | { status: 'error'; message: string }

export function RequireOnboarded() {
  const { session } = useAuth()
  const [state, setState] = useState<GateState>({ status: 'loading' })
  const [gateSplashMounted, setGateSplashMounted] = useState(true)

  const load = useCallback(async () => {
    const userId = session?.user.id
    if (!userId) {
      setState({ status: 'ready', onboarded: false })
      return
    }

    setState({ status: 'loading' })

    const { data, error } = await supabase
      .from('users')
      .select('onboarded')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      setState({
        status: 'error',
        message:
          error.code === 'PGRST205' || error.message.includes('schema cache')
            ? 'The users table was not found. Run the SQL migration in supabase/migrations on your Supabase project.'
            : error.message,
      })
      return
    }

    setState({ status: 'ready', onboarded: data?.onboarded === true })
  }, [session?.user.id])

  useEffect(() => {
    void load()
  }, [load])

  if (state.status === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-app-bg px-6">
        <p className="max-w-md text-center text-sm font-medium text-red-400">
          {state.message}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-app-bg"
        >
          Retry
        </button>
      </div>
    )
  }

  if (state.status === 'ready' && !state.onboarded) {
    return <Navigate to="/onboarding" replace />
  }

  return (
    <>
      {state.status === 'ready' && state.onboarded ? <Outlet /> : null}
      {gateSplashMounted ? (
        <SplashScreen
          show={state.status === 'loading'}
          onFadeComplete={() => setGateSplashMounted(false)}
        />
      ) : null}
    </>
  )
}
