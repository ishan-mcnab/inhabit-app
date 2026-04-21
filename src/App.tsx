import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { SplashScreen } from './components/SplashScreen'
import { useAuth } from './context/AuthContext'
import { Layout } from './components/Layout'
import { PageErrorBoundary } from './components/PageErrorBoundary'
import { TabRouteStub } from './components/TabRouteStub'
import { NotificationProvider } from './context/NotificationContext'
import { RequireAuth } from './components/RequireAuth'
import { RequireGuest } from './components/RequireGuest'
import { RequireOnboarded } from './components/RequireOnboarded'
import { CreateGoal } from './pages/CreateGoal'
import { CustomPlanBuilder } from './pages/CustomPlanBuilder'
import { CreateHabit } from './pages/CreateHabit'
import { GoalDetail } from './pages/GoalDetail'
import { Login } from './pages/Login'
import { MissionHistory } from './pages/MissionHistory'
import { Onboarding } from './pages/Onboarding'
import { Share } from './pages/Share'
import { WeeklyReflection } from './pages/WeeklyReflection'
import { SignUp } from './pages/SignUp'
import { supabase } from './supabase'

function App() {
  const location = useLocation()
  const { loading: authLoading } = useAuth()
  const [minSplashMsElapsed, setMinSplashMsElapsed] = useState(false)
  const [splashMounted, setSplashMounted] = useState(true)

  useEffect(() => {
    const t = window.setTimeout(() => setMinSplashMsElapsed(true), 1500)
    return () => window.clearTimeout(t)
  }, [])

  const showAuthSplash = authLoading || !minSplashMsElapsed

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
    <>
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
            <Route path="today" element={<TabRouteStub />} />
            <Route
              path="history"
              element={
                <PageErrorBoundary key={`${location.pathname}-${location.key}`}>
                  <MissionHistory />
                </PageErrorBoundary>
              }
            />
            <Route path="goals" element={<TabRouteStub />} />
            <Route path="goals/new" element={<CreateGoal />} />
            <Route
              path="goals/:goalId/plan"
              element={
                <PageErrorBoundary key={`${location.pathname}-${location.key}`}>
                  <CustomPlanBuilder />
                </PageErrorBoundary>
              }
            />
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
            <Route path="progress" element={<TabRouteStub />} />
            <Route path="profile" element={<TabRouteStub />} />
            <Route path="share" element={<Share />} />
            <Route path="*" element={<Navigate to="/today" replace />} />
          </Route>
        </Route>
      </Route>
    </Routes>
    {splashMounted ? (
      <SplashScreen
        show={showAuthSplash}
        onFadeComplete={() => setSplashMounted(false)}
      />
    ) : null}
    </>
  )
}

export default App
