import { useState, useRef, useEffect } from 'react'
import { useOrganizationStore } from '../../stores/organizationStore'
import { useAuthStore } from '../../stores/authStore'
import { api } from '../../services/api'

export default function OrgSwitcher() {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const { organizations, currentOrganization, switchOrganization } = useOrganizationStore()
  const { updateTokens } = useAuthStore()

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSwitch = async (orgId: string) => {
    if (orgId === currentOrganization?.id) {
      setIsOpen(false)
      return
    }

    setLoading(true)
    try {
      // Call API to switch organization and get new tokens
      const tokens = await api.auth.switchOrganization(orgId)
      updateTokens(tokens)

      // Update local store
      switchOrganization(orgId)

      // Reload the page to refresh all data with new org context
      window.location.reload()
    } catch (error) {
      console.error('Failed to switch organization:', error)
    } finally {
      setLoading(false)
      setIsOpen(false)
    }
  }

  // Don't show switcher if user has only one org
  if (organizations.length <= 1) {
    return (
      <div className="px-2 py-3">
        <div className="flex items-center gap-3 rounded-lg bg-gray-700/50 px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-sm font-bold text-white">
            {currentOrganization?.name?.charAt(0).toUpperCase() || 'O'}
          </div>
          <div className="flex-1 truncate">
            <p className="truncate text-sm font-medium text-white">
              {currentOrganization?.name || 'Organization'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative px-2 py-3" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={loading}
        className="flex w-full items-center gap-3 rounded-lg bg-gray-700/50 px-3 py-2 transition-colors hover:bg-gray-700"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-sm font-bold text-white">
          {currentOrganization?.name?.charAt(0).toUpperCase() || 'O'}
        </div>
        <div className="flex-1 truncate text-left">
          <p className="truncate text-sm font-medium text-white">
            {currentOrganization?.name || 'Organization'}
          </p>
        </div>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-2 right-2 top-full z-50 mt-1 rounded-lg border border-gray-600 bg-gray-800 py-1 shadow-xl">
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Switch Organization
          </div>
          {organizations.map((org) => (
            <button
              key={org.id}
              onClick={() => handleSwitch(org.id)}
              disabled={loading}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-gray-700 ${
                org.id === currentOrganization?.id ? 'bg-gray-700/50' : ''
              }`}
            >
              <div className="flex h-7 w-7 items-center justify-center rounded bg-gray-600 text-xs font-bold text-white">
                {org.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 truncate">
                <p className="truncate text-sm text-white">{org.name}</p>
                <p className="text-xs text-gray-500">{org.role}</p>
              </div>
              {org.id === currentOrganization?.id && (
                <svg className="h-4 w-4 text-primary-500" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
