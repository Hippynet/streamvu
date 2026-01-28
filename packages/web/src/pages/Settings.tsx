import { useEffect, useState, useCallback } from 'react'
import { useAuthStore } from '../stores/authStore'
import { api, ApiError } from '../services/api'
import InviteMemberModal from '../components/organizations/InviteMemberModal'
import { HippynetPromo } from '../components/promotions/HippynetPromo'
import {
  CloudStorageSettingsPanel,
  WebhookManagementPanel,
  TranscriptionConfigPanel,
} from '../components/settings'
import type {
  Organization,
  OrganizationStats,
  OrganizationMember,
  CloudStorageConfig,
  CloudStorageProvider,
  TranscriptionConfig,
  WebhookEventType,
  TranscriptionProvider,
} from '@streamvu/shared'

type SettingsTab = 'general' | 'storage' | 'webhooks' | 'transcription'

// Internal types for panel data
interface WebhookEndpointUI {
  id: string
  name: string
  url: string
  events: WebhookEventType[]
  enabled: boolean
  lastDeliveryAt: string | null
  lastStatusCode: number | null
  consecutiveFailures: number
}

interface TranscriptionConfigUI extends TranscriptionConfig {
  customVocabulary: string[]
}

export default function Settings() {
  const { user } = useAuthStore()
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [stats, setStats] = useState<OrganizationStats | null>(null)
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')

  // Cloud storage state
  const [cloudStorageConfigs, setCloudStorageConfigs] = useState<CloudStorageConfig[]>([])
  const [cloudStorageLoading, setCloudStorageLoading] = useState(false)

  // Webhooks state
  const [webhooks, setWebhooks] = useState<WebhookEndpointUI[]>([])
  const [webhooksLoading, setWebhooksLoading] = useState(false)

  // Transcription state
  const [transcriptionConfigs, setTranscriptionConfigs] = useState<TranscriptionConfigUI[]>([])
  const [transcriptionLoading, setTranscriptionLoading] = useState(false)

  // Super admin has global access, otherwise check org role from auth context
  const isSuperAdmin = user?.globalRole === 'SUPER_ADMIN'

  const fetchData = async () => {
    try {
      const [orgData, statsData, membersData] = await Promise.all([
        api.organization.get(),
        api.organization.stats(),
        api.organization.members(),
      ])
      setOrganization(orgData)
      setStats(statsData)
      setMembers(membersData)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  // Fetch cloud storage configurations
  const fetchCloudStorageConfigs = useCallback(async () => {
    setCloudStorageLoading(true)
    try {
      const result = await api.cloudStorage.listConfigs()
      setCloudStorageConfigs(result.configs || [])
    } catch (err) {
      console.error('Failed to load cloud storage configs:', err)
      // Don't set error - allow graceful degradation
      setCloudStorageConfigs([])
    } finally {
      setCloudStorageLoading(false)
    }
  }, [])

  // Fetch webhooks
  const fetchWebhooks = useCallback(async () => {
    setWebhooksLoading(true)
    try {
      const result = await api.webhooks.list()
      setWebhooks(
        (result.webhooks || []).map((w) => ({
          id: w.id,
          name: w.url.split('/').pop() || 'Webhook',
          url: w.url,
          events: w.events,
          enabled: w.enabled,
          lastDeliveryAt: w.lastTriggered || null,
          lastStatusCode: null,
          consecutiveFailures: w.failureCount,
        }))
      )
    } catch (err) {
      console.error('Failed to load webhooks:', err)
      setWebhooks([])
    } finally {
      setWebhooksLoading(false)
    }
  }, [])

  // Fetch transcription configurations
  const fetchTranscriptionConfigs = useCallback(async () => {
    setTranscriptionLoading(true)
    try {
      const result = await api.transcription.listConfigs()
      setTranscriptionConfigs(
        (result.configs || []).map((c) => ({
          ...c,
          customVocabulary: c.customVocabulary || [],
        }))
      )
    } catch (err) {
      console.error('Failed to load transcription configs:', err)
      setTranscriptionConfigs([])
    } finally {
      setTranscriptionLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [])

  // Fetch tab-specific data when tab changes
  useEffect(() => {
    if (activeTab === 'storage') {
      fetchCloudStorageConfigs()
    } else if (activeTab === 'webhooks') {
      fetchWebhooks()
    } else if (activeTab === 'transcription') {
      fetchTranscriptionConfigs()
    }
  }, [activeTab, fetchCloudStorageConfigs, fetchWebhooks, fetchTranscriptionConfigs])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center p-6">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-primary-500"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="m-6 rounded-lg border border-red-700 bg-red-900/50 p-4 text-red-300">{error}</div>
    )
  }

  const tabs: { id: SettingsTab; label: string; icon: JSX.Element }[] = [
    {
      id: 'general',
      label: 'General',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 0 1 1.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.559.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.894.149c-.424.07-.764.383-.929.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 0 1-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.398.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 0 1-.12-1.45l.527-.737c.25-.35.272-.806.108-1.204-.165-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 0 1 .12-1.45l.773-.773a1.125 1.125 0 0 1 1.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
      ),
    },
    {
      id: 'storage',
      label: 'Cloud Storage',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 0 0 4.5 4.5H18a3.75 3.75 0 0 0 1.332-7.257 3 3 0 0 0-3.758-3.848 5.25 5.25 0 0 0-10.233 2.33A4.502 4.502 0 0 0 2.25 15Z" />
        </svg>
      ),
    },
    {
      id: 'webhooks',
      label: 'Webhooks',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
        </svg>
      ),
    },
    {
      id: 'transcription',
      label: 'Transcription',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
      ),
    },
  ]

  const renderGeneralTab = () => (
    <div className="space-y-6">
      {/* Organization Overview */}
      <div className="card p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Organization Overview</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-lg bg-gray-900 p-4">
            <p className="text-sm text-gray-400">Organization</p>
            <p className="text-lg font-semibold text-white">{organization?.name}</p>
          </div>
          <div className="rounded-lg bg-gray-900 p-4">
            <p className="text-sm text-gray-400">Streams</p>
            <p className="text-lg font-semibold text-white">
              {stats?.streamCount} / {stats?.maxStreams}
            </p>
          </div>
          <div className="rounded-lg bg-gray-900 p-4">
            <p className="text-sm text-gray-400">Members</p>
            <p className="text-lg font-semibold text-white">
              {stats?.memberCount} / {stats?.maxUsers}
            </p>
          </div>
          <div className="rounded-lg bg-gray-900 p-4">
            <p className="text-sm text-gray-400">API Access</p>
            <p className="text-lg font-semibold text-white">
              {organization?.apiEnabled ? (
                <span className="text-green-400">Enabled</span>
              ) : (
                <span className="text-gray-500">Disabled</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* User Profile */}
      <div className="card p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Your Profile</h2>
        <div className="space-y-4">
          <div>
            <label className="label">Name</label>
            <p className="text-white">{user?.name}</p>
          </div>
          <div>
            <label className="label">Email</label>
            <p className="text-white">{user?.email}</p>
          </div>
          <div>
            <label className="label">Platform Role</label>
            <p className="text-white">
              {user?.globalRole === 'SUPER_ADMIN' ? 'Platform Admin' : 'User'}
            </p>
          </div>
        </div>
      </div>

      {/* Team Members */}
      <div className="card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Team Members</h2>
          <button className="btn btn-primary text-sm" onClick={() => setShowInviteModal(true)}>
            Invite Member
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead>
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-400">
                  Name
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-400">
                  Email
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-400">
                  Role
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-400">
                  Joined
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {members.map((member) => (
                <tr key={member.id}>
                  <td className="px-4 py-3 text-sm text-white">{member.user?.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-300">{member.user?.email}</td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    <span
                      className={`rounded px-2 py-1 text-xs ${
                        member.role === 'OWNER'
                          ? 'bg-yellow-900/50 text-yellow-400'
                          : member.role === 'ADMIN'
                            ? 'bg-blue-900/50 text-blue-400'
                            : 'bg-gray-700 text-gray-300'
                      }`}
                    >
                      {member.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">
                    {new Date(member.joinedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Branding (if enabled) */}
      {organization?.primaryColor && (
        <div className="card p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">Branding</h2>
          <div className="flex items-center gap-4">
            <div>
              <label className="label">Primary Color</label>
              <div className="flex items-center gap-2">
                <div
                  className="h-8 w-8 rounded border border-gray-600"
                  style={{ backgroundColor: organization.primaryColor }}
                />
                <span className="font-mono text-white">{organization.primaryColor}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Info (Super Admin only) */}
      {isSuperAdmin && (
        <div className="card border border-yellow-700/50 bg-yellow-900/20 p-6">
          <h2 className="mb-4 text-lg font-semibold text-yellow-400">Platform Admin</h2>
          <p className="text-gray-300">
            You have platform admin access. You can manage all organizations from the admin panel.
          </p>
        </div>
      )}

      {/* Hippynet Services */}
      <div className="card p-6">
        <HippynetPromo variant="full" />
      </div>
    </div>
  )

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return renderGeneralTab()
      case 'storage':
        return (
          <div className="card p-6">
            <CloudStorageSettingsPanel
              configs={cloudStorageConfigs}
              loading={cloudStorageLoading}
              onSave={async (config) => {
                await api.cloudStorage.createConfig({
                  provider: config.provider as CloudStorageProvider,
                  name: config.name,
                  enabled: config.enabled,
                  isDefault: config.isDefault,
                  bucket: config.bucket,
                  region: config.region,
                  accessKeyId: config.accessKeyId,
                  secretAccessKey: config.secretAccessKey,
                  endpoint: config.endpoint,
                  projectId: config.projectId,
                  credentials: config.credentials,
                  containerName: config.containerName,
                  accountName: config.accountName,
                  accountKey: config.accountKey,
                  teamId: config.teamId,
                  frameioProjectId: config.projectIdFrameio,
                  accessToken: config.accessToken,
                  prefix: config.prefix,
                })
                await fetchCloudStorageConfigs()
              }}
              onDelete={async (configId) => {
                await api.cloudStorage.deleteConfig(configId)
                await fetchCloudStorageConfigs()
              }}
              onTest={async (config) => {
                try {
                  const result = await api.cloudStorage.testConnection({
                    provider: config.provider as CloudStorageProvider,
                    bucket: config.bucket,
                    region: config.region,
                    accessKeyId: config.accessKeyId,
                    secretAccessKey: config.secretAccessKey,
                    endpoint: config.endpoint,
                    projectId: config.projectId,
                    credentials: config.credentials,
                    containerName: config.containerName,
                    accountName: config.accountName,
                    accountKey: config.accountKey,
                    teamId: config.teamId,
                    frameioProjectId: config.projectIdFrameio,
                    accessToken: config.accessToken,
                  })
                  return { success: result.success, message: result.message }
                } catch (err) {
                  return {
                    success: false,
                    message: err instanceof Error ? err.message : 'Connection test failed',
                  }
                }
              }}
            />
          </div>
        )
      case 'webhooks':
        return (
          <div className="card p-6">
            <WebhookManagementPanel
              webhooks={webhooks}
              loading={webhooksLoading}
              onSave={async (webhook) => {
                await api.webhooks.create({
                  name: webhook.name,
                  url: webhook.url,
                  events: webhook.events,
                })
                await fetchWebhooks()
              }}
              onUpdate={async (webhookId, webhook) => {
                await api.webhooks.update(webhookId, {
                  name: webhook.name,
                  url: webhook.url,
                  events: webhook.events,
                  enabled: webhook.enabled,
                })
                await fetchWebhooks()
              }}
              onDelete={async (webhookId) => {
                await api.webhooks.delete(webhookId)
                await fetchWebhooks()
              }}
              onTest={async (webhookId) => {
                try {
                  const result = await api.webhooks.test(webhookId)
                  return { success: result.success, statusCode: 200, error: null }
                } catch (err) {
                  return {
                    success: false,
                    statusCode: null,
                    error: err instanceof Error ? err.message : 'Test failed',
                  }
                }
              }}
            />
          </div>
        )
      case 'transcription':
        return (
          <div className="card p-6">
            <TranscriptionConfigPanel
              configs={transcriptionConfigs}
              loading={transcriptionLoading}
              onSave={async (config) => {
                await api.transcription.createConfig({
                  provider: config.provider as TranscriptionProvider,
                  name: config.name,
                  apiKey: config.apiKey,
                  apiUrl: config.apiUrl,
                  model: config.model,
                  language: config.language,
                  autoDetectLanguage: config.autoDetectLanguage,
                  enableSpeakerDiarization: config.enableSpeakerDiarization,
                  maxSpeakers: config.maxSpeakers,
                  enablePunctuation: config.enablePunctuation,
                  enableProfanityFilter: config.enableProfanityFilter,
                  customVocabulary: config.customVocabulary,
                  enabled: config.enabled,
                  isDefault: config.isDefault,
                })
                await fetchTranscriptionConfigs()
              }}
              onUpdate={async (configId, config) => {
                await api.transcription.updateConfig(configId, {
                  name: config.name,
                  apiKey: config.apiKey,
                  apiUrl: config.apiUrl,
                  model: config.model,
                  language: config.language,
                  autoDetectLanguage: config.autoDetectLanguage,
                  enableSpeakerDiarization: config.enableSpeakerDiarization,
                  maxSpeakers: config.maxSpeakers,
                  enablePunctuation: config.enablePunctuation,
                  enableProfanityFilter: config.enableProfanityFilter,
                  customVocabulary: config.customVocabulary,
                  enabled: config.enabled,
                  isDefault: config.isDefault,
                })
                await fetchTranscriptionConfigs()
              }}
              onDelete={async (configId) => {
                await api.transcription.deleteConfig(configId)
                await fetchTranscriptionConfigs()
              }}
            />
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="max-w-5xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="mt-1 text-gray-400">Manage your organization and integrations</p>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-gray-700">
        <nav className="-mb-px flex space-x-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-400'
                  : 'border-transparent text-gray-400 hover:border-gray-600 hover:text-gray-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {renderTabContent()}

      <InviteMemberModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        onInvited={fetchData}
      />
    </div>
  )
}
