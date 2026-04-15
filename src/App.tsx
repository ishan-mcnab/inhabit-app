import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from './components/Layout'
import { PageErrorBoundary } from './components/PageErrorBoundary'
import { NotificationProvider } from './context/NotificationContext'
import { RequireAuth } from './components/RequireAuth'
import { RequireGuest } from './components/RequireGuest'
import { RequireOnboarded } from './components/RequireOnboarded'
import { CreateGoal } from './pages/CreateGoal'
import { CreateHabit } from './pages/CreateHabit'
import { GoalDetail } from './pages/GoalDetail'
import { Goals } from './pages/Goals'
import { Login } from './pages/Login'
import { MissionHistory } from './pages/MissionHistory'
import { Onboarding } from './pages/Onboarding'
import { Profile } from './pages/Profile'
import { Progress } from './pages/Progress'
import { Share } from './pages/Share'
import { WeeklyReflection } from './pages/WeeklyReflection'
import { SignUp } from './pages/SignUp'
import { Today } from './pages/Today'
import { supabase } from './supabase'

function App() {
  const location = useLocation()

  useEffect(() => {
    void supabase
      .from('_inhabit_connection_probe_')
      .select('*')
      .limit(0)
      .then(({ error }) => {
        if (!error) {
          return
        }
        // Missing table still means PostgREST responded — URL + anon key work
        if (
          error.code === 'PGRST205' ||
          error.message.includes('schema cache')
        ) {
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
            <Route
              path="today"
              element={
                <PageErrorBoundary key={`${location.pathname}-${location.key}`}>
                  <Today />
                </PageErrorBoundary>
              }
            />
            <Route
              path="history"
              element={
                <PageErrorBoundary key={`${location.pathname}-${location.key}`}>
                  <MissionHistory />
                </PageErrorBoundary>
              }
            />
            <Route
              path="goals"
              element={
                <PageErrorBoundary key={`${location.pathname}-${location.key}`}>
                  <Goals />
                </PageErrorBoundary>
              }
            />
            <Route path="goals/new" element={<CreateGoal />} />
            <Route
              path="goals/:goalId"
              element={
                <PageErrorBoundary key={`${location.pathname}-${location.key}`}>
                  <GoalDetail />
                </PageErrorBoundary>
              }
            />
            <Route path="habits/new" element={<CreateHabit />} />
            <Route
              path="reflection"
              element={
                <PageErrorBoundary key={`${location.pathname}-${location.key}`}>
                  <WeeklyReflection />
                </PageErrorBoundary>
              }
            />
            <Route
              path="progress"
              element={
                <PageErrorBoundary key={`${location.pathname}-${location.key}`}>
                  <Progress />
                </PageErrorBoundary>
              }
            />
            <Route
              path="profile"
              element={
                <PageErrorBoundary key={`${location.pathname}-${location.key}`}>
                  <Profile />
                </PageErrorBoundary>
              }
            />
            <Route path="share" element={<Share />} />
            <Route path="*" element={<Navigate to="/today" replace />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  )
}

export default App
