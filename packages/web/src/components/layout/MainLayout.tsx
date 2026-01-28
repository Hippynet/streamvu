import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Header from './Header'
import Sidebar from './Sidebar'
import { connectSocket, disconnectSocket } from '../../services/socket'
import MCRDashboard from '../../pages/MCRDashboard'

export default function MainLayout() {
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const location = useLocation()

  useEffect(() => {
    connectSocket()
    return () => {
      disconnectSocket()
    }
  }, [])

  // Load sidebar preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('streamvu-sidebar')
    if (saved !== null) {
      setSidebarVisible(saved === 'true')
    }
  }, [])

  const toggleSidebar = () => {
    const newValue = !sidebarVisible
    setSidebarVisible(newValue)
    localStorage.setItem('streamvu-sidebar', String(newValue))
  }

  // Check if we're on a room page - these get custom headers
  const isRoomPage = location.pathname.startsWith('/call-center/room/')

  // Use MCR Dashboard for the main route
  if (location.pathname === '/') {
    return (
      <div className="min-h-screen bg-gray-950">
        {sidebarVisible && <Sidebar />}
        <div className={sidebarVisible ? 'lg:pl-64' : ''}>
          <MCRDashboard onToggleSidebar={toggleSidebar} sidebarVisible={sidebarVisible} />
        </div>
      </div>
    )
  }

  // Room pages get their own custom header (like MCRDashboard)
  if (isRoomPage) {
    return (
      <div className="min-h-screen bg-gray-950">
        {sidebarVisible && <Sidebar />}
        <div className={sidebarVisible ? 'lg:pl-64' : ''}>
          <Outlet context={{ onToggleSidebar: toggleSidebar, sidebarVisible }} />
        </div>
      </div>
    )
  }

  // Standard layout for other pages
  return (
    <div className="min-h-screen bg-gray-900">
      {sidebarVisible && <Sidebar />}
      <div className={sidebarVisible ? 'lg:pl-64' : ''}>
        <Header onToggleSidebar={toggleSidebar} sidebarVisible={sidebarVisible} />
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
