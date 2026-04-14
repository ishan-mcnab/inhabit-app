import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { NotificationProvider } from './context/NotificationContext'
import { RequireAuth } from './components/RequireAuth'
import { RequireGuest } from './components/RequireGuest'
import { RequireOnboarded } from './components/RequireOnboarded'
import { CreateGoal } from './pages/CreateGoal'
import { CreateHabit } from './pages/CreateHabit'
import { GoalDetail } from './pages/GoalDetail'
import { Goals } from './pages/Goals'
import { Login } from './pages/Login'
import { Onboarding } from './pages/Onboarding'
import { Profile } from './pages/Profile'
import { Progress } from './pages/Progress'
import { Share } from './pages/Share'
import { WeeklyReflection } from './pages/WeeklyReflection'
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
          <Route
            element={
              <NotificationProvider>
                <Layout />
              </NotificationProvider>
            }
          >
            <Route index element={<Navigate to="/today" replace />} />
            <Route path="today" element={<Today />} />
            <Route path="goals" element={<Goals />} />
            <Route path="goals/new" element={<CreateGoal />} />
            <Route path="goals/:goalId" element={<GoalDetail />} />
            <Route path="habits/new" element={<CreateHabit />} />
            <Route path="reflection" element={<WeeklyReflection />} />
            <Route path="progress" element={<Progress />} />
            <Route path="profile" element={<Profile />} />
            <Route path="share" element={<Share />} />
            <Route path="*" element={<Navigate to="/today" replace />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  )
}

export default App
