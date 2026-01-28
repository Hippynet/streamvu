/**
 * CloudStorageSettingsPanel
 *
 * Configuration panel for cloud storage integrations.
 * Supports S3, GCS, Azure Blob, and Frame.io.
 */

import { useState, useEffect } from 'react'
import type {
  CloudStorageProvider,
  CloudStorageConfig,
} from '@streamvu/shared'

interface CloudStorageFormData {
  provider: CloudStorageProvider
  name: string
  enabled: boolean
  isDefault: boolean
  // S3 / S3-compatible
  bucket?: string
  region?: string
  accessKeyId?: string
  secretAccessKey?: string
  endpoint?: string
  // GCS
  projectId?: string
  credentials?: string
  // Azure
  containerName?: string
  accountName?: string
  accountKey?: string
  connectionString?: string
  // Frame.io
  teamId?: string
  projectIdFrameio?: string
  accessToken?: string
  // Common
  prefix?: string
}

interface CloudStorageSettingsPanelProps {
  configs?: CloudStorageConfig[]
  onSave?: (config: CloudStorageFormData) => Promise<void>
  onDelete?: (configId: string) => Promise<void>
  onTest?: (config: CloudStorageFormData) => Promise<{ success: boolean; message: string }>
  loading?: boolean
}

const PROVIDERS: { value: CloudStorageProvider; label: string; description: string }[] = [
  { value: 's3', label: 'Amazon S3', description: 'AWS S3 or S3-compatible storage' },
  { value: 'gcs', label: 'Google Cloud Storage', description: 'GCS bucket storage' },
  { value: 'azure', label: 'Azure Blob Storage', description: 'Microsoft Azure containers' },
  { value: 'frameio', label: 'Frame.io', description: 'Media asset management' },
]

const REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'eu-west-1', 'eu-west-2', 'eu-central-1',
  'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1',
]

export function CloudStorageSettingsPanel({
  configs = [],
  onSave,
  onDelete,
  onTest,
  loading = false,
}: CloudStorageSettingsPanelProps) {
  const [editingConfig, setEditingConfig] = useState<string | 'new' | null>(null)
  const [formData, setFormData] = useState<CloudStorageFormData>({
    provider: 's3',
    name: '',
    enabled: true,
    isDefault: false,
  })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Reset form when closing
  useEffect(() => {
    if (!editingConfig) {
      setFormData({
        provider: 's3',
        name: '',
        enabled: true,
        isDefault: false,
      })
      setTestResult(null)
      setError(null)
    }
  }, [editingConfig])

  const handleSave = async () => {
    if (!onSave) return
    setSaving(true)
    setError(null)
    try {
      await onSave(formData)
      setEditingConfig(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!onTest) return
    setTesting(true)
    setTestResult(null)
    try {
      const result = await onTest(formData)
      setTestResult(result)
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Test failed',
      })
    } finally {
      setTesting(false)
    }
  }

  const handleDelete = async (configId: string) => {
    if (!onDelete) return
    if (!confirm('Are you sure you want to delete this storage configuration?')) return
    try {
      await onDelete(configId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const renderProviderFields = () => {
    switch (formData.provider) {
      case 's3':
        return (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Bucket Name *</label>
                <input
                  type="text"
                  className="input"
                  value={formData.bucket || ''}
                  onChange={(e) => setFormData({ ...formData, bucket: e.target.value })}
                  placeholder="my-recordings-bucket"
                />
              </div>
              <div>
                <label className="label">Region *</label>
                <select
                  className="input"
                  value={formData.region || ''}
                  onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                >
                  <option value="">Select region...</option>
                  {REGIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Access Key ID *</label>
                <input
                  type="text"
                  className="input font-mono"
                  value={formData.accessKeyId || ''}
                  onChange={(e) => setFormData({ ...formData, accessKeyId: e.target.value })}
                  placeholder="AKIA..."
                />
              </div>
              <div>
                <label className="label">Secret Access Key *</label>
                <input
                  type="password"
                  className="input font-mono"
                  value={formData.secretAccessKey || ''}
                  onChange={(e) => setFormData({ ...formData, secretAccessKey: e.target.value })}
                  placeholder="••••••••"
                />
              </div>
            </div>
            <div>
              <label className="label">Custom Endpoint (S3-compatible)</label>
              <input
                type="text"
                className="input"
                value={formData.endpoint || ''}
                onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
                placeholder="https://s3.example.com (optional)"
              />
              <p className="mt-1 text-xs text-gray-500">
                For S3-compatible services like MinIO, Backblaze B2, DigitalOcean Spaces
              </p>
            </div>
          </>
        )

      case 'gcs':
        return (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Bucket Name *</label>
                <input
                  type="text"
                  className="input"
                  value={formData.bucket || ''}
                  onChange={(e) => setFormData({ ...formData, bucket: e.target.value })}
                  placeholder="my-gcs-bucket"
                />
              </div>
              <div>
                <label className="label">Project ID *</label>
                <input
                  type="text"
                  className="input"
                  value={formData.projectId || ''}
                  onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                  placeholder="my-gcp-project"
                />
              </div>
            </div>
            <div>
              <label className="label">Service Account JSON Key *</label>
              <textarea
                className="input h-24 font-mono text-xs"
                value={formData.credentials || ''}
                onChange={(e) => setFormData({ ...formData, credentials: e.target.value })}
                placeholder='{"type": "service_account", ...}'
              />
              <p className="mt-1 text-xs text-gray-500">
                Paste the entire JSON key file contents
              </p>
            </div>
          </>
        )

      case 'azure':
        return (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Container Name *</label>
                <input
                  type="text"
                  className="input"
                  value={formData.containerName || ''}
                  onChange={(e) => setFormData({ ...formData, containerName: e.target.value })}
                  placeholder="recordings"
                />
              </div>
              <div>
                <label className="label">Account Name *</label>
                <input
                  type="text"
                  className="input"
                  value={formData.accountName || ''}
                  onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
                  placeholder="mystorageaccount"
                />
              </div>
            </div>
            <div>
              <label className="label">Account Key *</label>
              <input
                type="password"
                className="input font-mono"
                value={formData.accountKey || ''}
                onChange={(e) => setFormData({ ...formData, accountKey: e.target.value })}
                placeholder="••••••••"
              />
            </div>
          </>
        )

      case 'frameio':
        return (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Team ID *</label>
                <input
                  type="text"
                  className="input font-mono"
                  value={formData.teamId || ''}
                  onChange={(e) => setFormData({ ...formData, teamId: e.target.value })}
                  placeholder="team-xxx"
                />
              </div>
              <div>
                <label className="label">Project ID *</label>
                <input
                  type="text"
                  className="input font-mono"
                  value={formData.projectIdFrameio || ''}
                  onChange={(e) => setFormData({ ...formData, projectIdFrameio: e.target.value })}
                  placeholder="project-xxx"
                />
              </div>
            </div>
            <div>
              <label className="label">Access Token *</label>
              <input
                type="password"
                className="input font-mono"
                value={formData.accessToken || ''}
                onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })}
                placeholder="fio-u-..."
              />
              <p className="mt-1 text-xs text-gray-500">
                Get your token from Frame.io Developer Settings
              </p>
            </div>
          </>
        )

      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-primary-500" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Cloud Storage</h3>
          <p className="text-sm text-gray-400">
            Configure cloud storage for automatic recording uploads
          </p>
        </div>
        {!editingConfig && (
          <button
            className="btn btn-primary text-sm"
            onClick={() => setEditingConfig('new')}
          >
            Add Storage
          </button>
        )}
      </div>

      {/* Existing Configs */}
      {!editingConfig && configs.length > 0 && (
        <div className="space-y-2">
          {configs.map((config) => (
            <div
              key={config.id}
              className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800/50 p-4"
            >
              <div className="flex items-center gap-4">
                <div className={`h-3 w-3 rounded-full ${config.enabled ? 'bg-green-500' : 'bg-gray-500'}`} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{config.name}</span>
                    {config.isDefault && (
                      <span className="rounded bg-primary-900/50 px-2 py-0.5 text-xs text-primary-400">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-400">
                    {PROVIDERS.find((p) => p.value === config.provider)?.label || config.provider}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded px-3 py-1 text-sm text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
                  onClick={() => {
                    setFormData({
                      provider: config.provider,
                      name: config.name,
                      enabled: config.enabled,
                      isDefault: config.isDefault,
                    })
                    setEditingConfig(config.id)
                  }}
                >
                  Edit
                </button>
                <button
                  className="rounded px-3 py-1 text-sm text-red-400 transition-colors hover:bg-red-900/30 hover:text-red-300"
                  onClick={() => handleDelete(config.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!editingConfig && configs.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-700 p-8 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 15a4.5 4.5 0 0 0 4.5 4.5H18a3.75 3.75 0 0 0 1.332-7.257 3 3 0 0 0-3.758-3.848 5.25 5.25 0 0 0-10.233 2.33A4.502 4.502 0 0 0 2.25 15Z"
            />
          </svg>
          <p className="mt-2 text-gray-400">No cloud storage configured</p>
          <p className="text-sm text-gray-500">
            Add a storage provider to automatically upload recordings
          </p>
        </div>
      )}

      {/* Edit/Create Form */}
      {editingConfig && (
        <div className="space-y-4 rounded-lg border border-gray-700 bg-gray-800/30 p-4">
          <h4 className="font-medium text-white">
            {editingConfig === 'new' ? 'Add Storage Configuration' : 'Edit Configuration'}
          </h4>

          {/* Provider Selection */}
          <div>
            <label className="label">Provider *</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PROVIDERS.map((provider) => (
                <button
                  key={provider.value}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    formData.provider === provider.value
                      ? 'border-primary-500 bg-primary-900/30'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                  onClick={() => setFormData({ ...formData, provider: provider.value })}
                >
                  <span className="block text-sm font-medium text-white">{provider.label}</span>
                  <span className="block text-xs text-gray-400">{provider.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Configuration Name *</label>
              <input
                type="text"
                className="input"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Production Storage"
              />
            </div>
            <div>
              <label className="label">Path Prefix</label>
              <input
                type="text"
                className="input"
                value={formData.prefix || ''}
                onChange={(e) => setFormData({ ...formData, prefix: e.target.value })}
                placeholder="recordings/ (optional)"
              />
            </div>
          </div>

          {/* Provider-specific fields */}
          {renderProviderFields()}

          {/* Options */}
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-600 bg-gray-700"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
              />
              <span className="text-sm text-gray-300">Enabled</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-600 bg-gray-700"
                checked={formData.isDefault}
                onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
              />
              <span className="text-sm text-gray-300">Set as default</span>
            </label>
          </div>

          {/* Test Result */}
          {testResult && (
            <div
              className={`rounded-lg border p-3 ${
                testResult.success
                  ? 'border-green-700 bg-green-900/30 text-green-300'
                  : 'border-red-700 bg-red-900/30 text-red-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {testResult.success ? (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                )}
                <span>{testResult.message}</span>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-700 bg-red-900/30 p-3 text-red-300">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2">
            <button
              className="btn btn-secondary text-sm"
              onClick={() => setEditingConfig(null)}
              disabled={saving}
            >
              Cancel
            </button>
            {onTest && (
              <button
                className="btn btn-secondary text-sm"
                onClick={handleTest}
                disabled={testing || saving}
              >
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
            )}
            <button
              className="btn btn-primary text-sm"
              onClick={handleSave}
              disabled={saving || !formData.name}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
