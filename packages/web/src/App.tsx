import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { NotificationContainer } from './components/common/NotificationToast'
import MainLayout from './components/layout/MainLayout'
import Monitor from './pages/Monitor'
import Streams from './pages/Streams'
import Settings from './pages/Settings'

export default function App() {
  return (
    <BrowserRouter>
      <NotificationContainer position="top-right" />
      <Routes>
        {/* Main app */}
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Monitor />} />
          <Route path="streams" element={<Streams />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
