import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { TabPlaceholder } from './components/TabPlaceholder'

function App() {
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
