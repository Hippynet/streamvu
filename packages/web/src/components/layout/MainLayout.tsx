import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Header from './Header'
import Sidebar from './Sidebar'

export default function MainLayout() {
  const [sidebarVisible, setSidebarVisible] = useState(() => {
    // Default to hidden, but respect saved preference
    const saved = localStorage.getItem('streamvu-sidebar')
    return saved === 'true'
  })

  const toggleSidebar = () => {
    const newValue = !sidebarVisible
    setSidebarVisible(newValue)
    localStorage.setItem('streamvu-sidebar', String(newValue))
  }

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
