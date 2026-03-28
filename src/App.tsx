import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { RequireAuth } from './components/RequireAuth'
import { RequireGuest } from './components/RequireGuest'
import { RequireOnboarded } from './components/RequireOnboarded'
import { TabPlaceholder } from './components/TabPlaceholder'
import { CreateGoal } from './pages/CreateGoal'
import { Goals } from './pages/Goals'
import { Login } from './pages/Login'
import { Onboarding } from './pages/Onboarding'
import { SignUp } from './pages/SignUp'
import { Today } from './pages/Today'
import { supabase } from './supabase'

function App() {
  useEffect(() => {
    void supabase
      .from('_inhabit_connection_probe_')
      .select('*')
      .limit(0)
      .then(({ error }) => {
        if (!error) {
          console.log('Supabase connected')
          return
        }
        // Missing table still means PostgREST responded — URL + anon key work
        if (
          error.code === 'PGRST205' ||
          error.message.includes('schema cache')
        ) {
          console.log('Supabase connected')
          return
        }
        console.error('Supabase connection test failed', error)
      })
  }, [])

  return (
    <Routes>
      <Route element={<RequireGuest />}>
        <Route path="login" element={<Login />} />
        <Route path="signup" element={<SignUp />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route path="onboarding" element={<Onboarding />} />
        <Route element={<RequireOnboarded />}>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/today" replace />} />
            <Route path="today" element={<Today />} />
            <Route path="goals" element={<Goals />} />
            <Route path="goals/new" element={<CreateGoal />} />
            <Route
              path="progress"
              element={<TabPlaceholder title="Progress" />}
            />
            <Route
              path="profile"
              element={<TabPlaceholder title="Profile" />}
            />
            <Route path="*" element={<Navigate to="/today" replace />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  )
}

export default App
