import { useEffect, useState } from 'react'
import type { Organization } from '@streamvu/shared'
import { getApiUrl } from '../../config'

interface OrganizationListItem extends Organization {
  _count?: {
    members: number
    streams: number
    callRooms: number
  }
}

export default function AdminAccounts() {
  const [organizations, setOrganizations] = useState<OrganizationListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchOrganizations = async () => {
      try {
        const response = await fetch(
          `${getApiUrl()}/api/admin/organizations`,
          {
            headers: {
              Authorization: `Bearer ${JSON.parse(localStorage.getItem('streamvu-auth') || '{}')?.state?.tokens?.accessToken}`,
            },
          }
        )
        const data = await response.json()
        if (data.success) {
          setOrganizations(data.data.items)
        } else {
          setError(data.error?.message || 'Failed to load organizations')
        }
      } catch (_err) {
        setError('Failed to load organizations')
      } finally {
        setLoading(false)
      }
    }

    fetchOrganizations()
  }, [])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-primary-500"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-700 bg-red-900/50 p-4 text-red-300">{error}</div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Organizations</h1>
          <p className="mt-1 text-gray-400">Manage customer organizations</p>
        </div>
        <button className="btn btn-primary" disabled>
          Create Organization
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-800">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                Organization
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                Slug
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                Usage
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                Created
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-400">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {organizations.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                  No organizations found.
                </td>
              </tr>
            ) : (
              organizations.map((org) => (
                <tr key={org.id} className="hover:bg-gray-800/50">
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="text-sm font-medium text-white">{org.name}</div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span className="font-mono text-sm text-gray-300">{org.slug}</span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">
                    <div className="space-y-1">
                      <div>
                        {org._count?.members || 0}/{org.maxUsers} members
                      </div>
                      <div>
                        {org._count?.streams || 0}/{org.maxStreams} streams
                      </div>
                      <div>
                        {org._count?.callRooms || 0}/{org.maxCallRooms} rooms
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="flex flex-col gap-1">
                      {org.suspended ? (
                        <span className="inline-flex items-center rounded bg-red-900/50 px-2 py-0.5 text-xs font-medium text-red-400">
                          Suspended
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded bg-green-900/50 px-2 py-0.5 text-xs font-medium text-green-400">
                          Active
                        </span>
                      )}
                      {org.apiEnabled && (
                        <span className="inline-flex items-center rounded bg-blue-900/50 px-2 py-0.5 text-xs font-medium text-blue-400">
                          API
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-400">
                    {new Date(org.createdAt).toLocaleDateString()}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                    <button className="mr-3 text-primary-400 transition-colors hover:text-primary-300">
                      Edit
                    </button>
                    <button className="text-red-400 transition-colors hover:text-red-300">
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
