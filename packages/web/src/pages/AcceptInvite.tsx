import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useOrganizationStore } from '../stores/organizationStore'
import { api, ApiError } from '../services/api'
import type { OrganizationInvite, Organization } from '@streamvu/shared'

type InviteWithOrg = OrganizationInvite & { organization: Organization }

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuthStore()
  const { setOrganizations, organizations } = useOrganizationStore()

  const [invite, setInvite] = useState<InviteWithOrg | null>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const fetchInvite = async () => {
      if (!token) {
        setError('Invalid invite link')
        setLoading(false)
        return
      }

      try {
        const data = await api.invites.get(token)
        setInvite(data)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Invalid or expired invite')
      } finally {
        setLoading(false)
      }
    }

    fetchInvite()
  }, [token])

  const handleAccept = async () => {
    if (!token) return

    setAccepting(true)
    setError('')

    try {
      const membership = await api.invites.accept(token)

      // Update organizations list
      if (invite) {
        setOrganizations([
          ...organizations,
          {
            id: invite.organization.id,
            name: invite.organization.name,
            slug: invite.organization.slug,
            role: membership.role,
          },
        ])
      }

      setSuccess(true)

      // Redirect to dashboard after a delay
      setTimeout(() => {
        navigate('/')
      }, 2000)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to accept invite')
    } finally {
      setAccepting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-primary-500"></div>
      </div>
    )
  }

  // User needs to sign in first
  if (!isAuthenticated && invite) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 px-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-4xl font-bold text-primary-500">StreamVU</h1>
            <p className="mt-2 text-gray-400">You've been invited!</p>
          </div>

          <div className="card p-8 text-center">
            <div className="mb-6">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-600/20">
                <svg
                  className="h-8 w-8 text-primary-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-white">
                Join {invite.organization.name}
              </h2>
              <p className="mt-2 text-gray-400">
                You've been invited to join as a{' '}
                <span className="font-medium text-white">{invite.role}</span>
              </p>
            </div>

            <p className="mb-6 text-sm text-gray-400">
              Sign in or create an account to accept this invitation.
            </p>

            <Link to="/login" className="btn btn-primary w-full">
              Sign in to Continue
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-primary-500">StreamVU</h1>
        </div>

        <div className="card p-8 text-center">
          {error && !invite ? (
            <>
              <div className="mb-6">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-600/20">
                  <svg
                    className="h-8 w-8 text-red-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                    />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-white">Invalid Invite</h2>
                <p className="mt-2 text-gray-400">{error}</p>
              </div>
              <Link to="/login" className="btn btn-primary w-full">
                Go to Login
              </Link>
            </>
          ) : success ? (
            <>
              <div className="mb-6">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-600/20">
                  <svg
                    className="h-8 w-8 text-green-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-white">Welcome!</h2>
                <p className="mt-2 text-gray-400">
                  You've joined {invite?.organization.name}. Redirecting...
                </p>
              </div>
            </>
          ) : invite ? (
            <>
              <div className="mb-6">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-600/20">
                  <svg
                    className="h-8 w-8 text-primary-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
                    />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-white">
                  Join {invite.organization.name}
                </h2>
                <p className="mt-2 text-gray-400">
                  You've been invited to join as a{' '}
                  <span className="font-medium text-white">{invite.role}</span>
                </p>
              </div>

              {error && (
                <div className="mb-4 rounded-lg border border-red-700 bg-red-900/50 p-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              <button
                onClick={handleAccept}
                disabled={accepting}
                className="btn btn-primary w-full"
              >
                {accepting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Accepting...
                  </span>
                ) : (
                  'Accept Invitation'
                )}
              </button>

              <Link to="/" className="mt-4 block text-sm text-gray-400 hover:text-white">
                Skip for now
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
