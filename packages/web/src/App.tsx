import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { NotificationContainer } from './components/common/NotificationToast'
import MainLayout from './components/layout/MainLayout'
import Login from './pages/Login'
import AcceptInvite from './pages/AcceptInvite'
import Dashboard from './pages/Dashboard'
import Streams from './pages/Streams'
import CallCenter from './pages/CallCenter'
import Room from './pages/Room'
import JoinRoom from './pages/JoinRoom'
import PreFlight from './pages/PreFlight'
import MultiviewerPage from './pages/MultiviewerPage'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'
import AdminAccounts from './pages/admin/Accounts'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (user?.globalRole !== 'SUPER_ADMIN') {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <NotificationContainer position="top-right" />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/invite/:token" element={<AcceptInvite />} />
        <Route path="/join/:inviteToken" element={<JoinRoom />} />
        <Route path="/preflight" element={<PreFlight />} />
        <Route path="/preflight/:roomId" element={<PreFlight />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="streams" element={<Streams />} />
          <Route path="call-center" element={<CallCenter />} />
          <Route path="call-center/room/:roomId" element={<Room />} />
          <Route path="call-center/multiviewer/:roomId" element={<MultiviewerPage />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="settings" element={<Settings />} />

          {/* Admin routes */}
          <Route
            path="admin/accounts"
            element={
              <AdminRoute>
                <AdminAccounts />
              </AdminRoute>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
