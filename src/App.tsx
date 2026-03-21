import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { TabPlaceholder } from './components/TabPlaceholder'
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
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/today" replace />} />
        <Route path="today" element={<TabPlaceholder title="Today" />} />
        <Route path="goals" element={<TabPlaceholder title="Goals" />} />
        <Route path="progress" element={<TabPlaceholder title="Progress" />} />
        <Route path="profile" element={<TabPlaceholder title="Profile" />} />
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Route>
    </Routes>
  )
}

export default App
