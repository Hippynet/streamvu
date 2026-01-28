/**
 * WebhookManagementPanel
 *
 * Configuration panel for webhook endpoints.
 * Allows creating, editing, and testing webhook integrations.
 */

import { useState, useEffect } from 'react'
import type { WebhookEventType } from '@streamvu/shared'

interface WebhookEndpoint {
  id: string
  name: string
  url: string
  events: WebhookEventType[]
  enabled: boolean
  lastDeliveryAt: string | null
  lastStatusCode: number | null
  consecutiveFailures: number
}

interface WebhookFormData {
  name: string
  url: string
  events: WebhookEventType[]
  enabled: boolean
}

interface WebhookManagementPanelProps {
  webhooks?: WebhookEndpoint[]
  onSave?: (webhook: WebhookFormData) => Promise<void>
  onUpdate?: (webhookId: string, webhook: WebhookFormData) => Promise<void>
  onDelete?: (webhookId: string) => Promise<void>
  onTest?: (webhookId: string) => Promise<{ success: boolean; statusCode: number | null; error: string | null }>
  loading?: boolean
}

const EVENT_CATEGORIES: {
  label: string
  events: { type: WebhookEventType; label: string }[]
}[] = [
  {
    label: 'Room Events',
    events: [
      { type: 'room.created', label: 'Room Created' },
      { type: 'room.closed', label: 'Room Closed' },
    ],
  },
  {
    label: 'Participant Events',
    events: [
      { type: 'participant.joined', label: 'Participant Joined' },
      { type: 'participant.left', label: 'Participant Left' },
      { type: 'participant.muted', label: 'Participant Muted' },
      { type: 'participant.unmuted', label: 'Participant Unmuted' },
    ],
  },
  {
    label: 'Recording Events',
    events: [
      { type: 'recording.started', label: 'Recording Started' },
      { type: 'recording.stopped', label: 'Recording Stopped' },
      { type: 'recording.completed', label: 'Recording Completed' },
      { type: 'recording.failed', label: 'Recording Failed' },
    ],
  },
  {
    label: 'Cue Events',
    events: [
      { type: 'cue.sent', label: 'Cue Sent' },
      { type: 'cue.cleared', label: 'Cue Cleared' },
    ],
  },
  {
    label: 'Source Events',
    events: [
      { type: 'source.connected', label: 'Source Connected' },
      { type: 'source.disconnected', label: 'Source Disconnected' },
      { type: 'source.error', label: 'Source Error' },
    ],
  },
  {
    label: 'Output Events',
    events: [
      { type: 'output.started', label: 'Output Started' },
      { type: 'output.stopped', label: 'Output Stopped' },
      { type: 'output.error', label: 'Output Error' },
    ],
  },
  {
    label: 'Transcription Events',
    events: [
      { type: 'transcription.started', label: 'Transcription Started' },
      { type: 'transcription.completed', label: 'Transcription Completed' },
      { type: 'transcription.failed', label: 'Transcription Failed' },
    ],
  },
]

export function WebhookManagementPanel({
  webhooks = [],
  onSave,
  onUpdate,
  onDelete,
  onTest,
  loading = false,
}: WebhookManagementPanelProps) {
  const [editingWebhook, setEditingWebhook] = useState<string | 'new' | null>(null)
  const [formData, setFormData] = useState<WebhookFormData>({
    name: '',
    url: '',
    events: [],
    enabled: true,
  })
  const [saving, setSaving] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{
    webhookId: string
    success: boolean
    statusCode: number | null
    error: string | null
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Reset form when closing
  useEffect(() => {
    if (!editingWebhook) {
      setFormData({
        name: '',
        url: '',
        events: [],
        enabled: true,
      })
      setError(null)
    }
  }, [editingWebhook])

  const handleSave = async () => {
    if (!formData.name || !formData.url || formData.events.length === 0) {
      setError('Please fill in all required fields and select at least one event')
      return
    }

    setSaving(true)
    setError(null)
    try {
      if (editingWebhook === 'new' && onSave) {
        await onSave(formData)
      } else if (editingWebhook && onUpdate) {
        await onUpdate(editingWebhook, formData)
      }
      setEditingWebhook(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save webhook')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async (webhookId: string) => {
    if (!onTest) return
    setTestingId(webhookId)
    setTestResult(null)
    try {
      const result = await onTest(webhookId)
      setTestResult({ webhookId, ...result })
    } catch (err) {
      setTestResult({
        webhookId,
        success: false,
        statusCode: null,
        error: err instanceof Error ? err.message : 'Test failed',
      })
    } finally {
      setTestingId(null)
    }
  }

  const handleDelete = async (webhookId: string) => {
    if (!onDelete) return
    if (!confirm('Are you sure you want to delete this webhook?')) return
    try {
      await onDelete(webhookId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const toggleEvent = (event: WebhookEventType) => {
    setFormData((prev) => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter((e) => e !== event)
        : [...prev.events, event],
    }))
  }

  const toggleCategory = (events: WebhookEventType[]) => {
    const allSelected = events.every((e) => formData.events.includes(e))
    setFormData((prev) => ({
      ...prev,
      events: allSelected
        ? prev.events.filter((e) => !events.includes(e))
        : [...new Set([...prev.events, ...events])],
    }))
  }

  const getStatusBadge = (webhook: WebhookEndpoint) => {
    if (!webhook.enabled) {
      return <span className="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-400">Disabled</span>
    }
    if (webhook.consecutiveFailures >= 3) {
      return <span className="rounded bg-red-900/50 px-2 py-0.5 text-xs text-red-400">Failing</span>
    }
    if (webhook.lastStatusCode && webhook.lastStatusCode >= 200 && webhook.lastStatusCode < 300) {
      return <span className="rounded bg-green-900/50 px-2 py-0.5 text-xs text-green-400">Healthy</span>
    }
    return <span className="rounded bg-yellow-900/50 px-2 py-0.5 text-xs text-yellow-400">Pending</span>
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
          <h3 className="text-lg font-semibold text-white">Webhooks</h3>
          <p className="text-sm text-gray-400">
            Receive HTTP notifications when events occur
          </p>
        </div>
        {!editingWebhook && (
          <button
            className="btn btn-primary text-sm"
            onClick={() => setEditingWebhook('new')}
          >
            Add Webhook
          </button>
        )}
      </div>

      {/* Existing Webhooks */}
      {!editingWebhook && webhooks.length > 0 && (
        <div className="space-y-2">
          {webhooks.map((webhook) => (
            <div
              key={webhook.id}
              className="rounded-lg border border-gray-700 bg-gray-800/50 p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{webhook.name}</span>
                    {getStatusBadge(webhook)}
                  </div>
                  <p className="mt-1 font-mono text-sm text-gray-400">{webhook.url}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {webhook.events.slice(0, 5).map((event) => (
                      <span
                        key={event}
                        className="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-300"
                      >
                        {event}
                      </span>
                    ))}
                    {webhook.events.length > 5 && (
                      <span className="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-400">
                        +{webhook.events.length - 5} more
                      </span>
                    )}
                  </div>
                  {webhook.lastDeliveryAt && (
                    <p className="mt-2 text-xs text-gray-500">
                      Last delivery: {new Date(webhook.lastDeliveryAt).toLocaleString()}
                      {webhook.lastStatusCode && ` (${webhook.lastStatusCode})`}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {onTest && (
                    <button
                      className="rounded px-3 py-1 text-sm text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
                      onClick={() => handleTest(webhook.id)}
                      disabled={testingId === webhook.id}
                    >
                      {testingId === webhook.id ? 'Testing...' : 'Test'}
                    </button>
                  )}
                  <button
                    className="rounded px-3 py-1 text-sm text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
                    onClick={() => {
                      setFormData({
                        name: webhook.name,
                        url: webhook.url,
                        events: webhook.events,
                        enabled: webhook.enabled,
                      })
                      setEditingWebhook(webhook.id)
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="rounded px-3 py-1 text-sm text-red-400 transition-colors hover:bg-red-900/30 hover:text-red-300"
                    onClick={() => handleDelete(webhook.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Test Result */}
              {testResult?.webhookId === webhook.id && (
                <div
                  className={`mt-3 rounded-lg border p-2 ${
                    testResult.success
                      ? 'border-green-700 bg-green-900/30 text-green-300'
                      : 'border-red-700 bg-red-900/30 text-red-300'
                  }`}
                >
                  <span className="text-sm">
                    {testResult.success
                      ? `Test successful (${testResult.statusCode})`
                      : `Test failed: ${testResult.error || 'Unknown error'}`}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!editingWebhook && webhooks.length === 0 && (
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
              d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
            />
          </svg>
          <p className="mt-2 text-gray-400">No webhooks configured</p>
          <p className="text-sm text-gray-500">
            Create a webhook to receive event notifications
          </p>
        </div>
      )}

      {/* Edit/Create Form */}
      {editingWebhook && (
        <div className="space-y-4 rounded-lg border border-gray-700 bg-gray-800/30 p-4">
          <h4 className="font-medium text-white">
            {editingWebhook === 'new' ? 'Add Webhook' : 'Edit Webhook'}
          </h4>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Name *</label>
              <input
                type="text"
                className="input"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="My Integration"
              />
            </div>
            <div>
              <label className="label">Endpoint URL *</label>
              <input
                type="url"
                className="input font-mono"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder="https://example.com/webhook"
              />
            </div>
          </div>

          {/* Event Selection */}
          <div>
            <label className="label">Events *</label>
            <p className="mb-2 text-xs text-gray-500">
              Select the events that will trigger this webhook
            </p>
            <div className="space-y-3">
              {EVENT_CATEGORIES.map((category) => {
                const categoryEvents = category.events.map((e) => e.type)
                const allSelected = categoryEvents.every((e) => formData.events.includes(e))
                const someSelected = categoryEvents.some((e) => formData.events.includes(e))

                return (
                  <div key={category.label} className="rounded-lg border border-gray-700 p-3">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-600 bg-gray-700"
                        checked={allSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someSelected && !allSelected
                        }}
                        onChange={() => toggleCategory(categoryEvents)}
                      />
                      <span className="text-sm font-medium text-white">{category.label}</span>
                    </label>
                    <div className="mt-2 ml-6 flex flex-wrap gap-2">
                      {category.events.map((event) => (
                        <label
                          key={event.type}
                          className="flex cursor-pointer items-center gap-1"
                        >
                          <input
                            type="checkbox"
                            className="h-3 w-3 rounded border-gray-600 bg-gray-700"
                            checked={formData.events.includes(event.type)}
                            onChange={() => toggleEvent(event.type)}
                          />
                          <span className="text-xs text-gray-400">{event.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Options */}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-600 bg-gray-700"
              checked={formData.enabled}
              onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
            />
            <span className="text-sm text-gray-300">Enabled</span>
          </label>

          {/* Info */}
          <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-3">
            <p className="text-xs text-gray-400">
              <strong>Security:</strong> Webhook requests include an HMAC signature in the{' '}
              <code className="rounded bg-gray-800 px-1">X-StreamVU-Signature</code> header.
              Use this to verify that requests are coming from StreamVU.
            </p>
          </div>

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
              onClick={() => setEditingWebhook(null)}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary text-sm"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
