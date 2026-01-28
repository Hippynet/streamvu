import { useState, useCallback, useRef } from 'react'

/**
 * Integration platform types
 */
export type IntegrationType =
  | 'webhook'
  | 'discord'
  | 'slack'
  | 'obs_websocket'
  | 'vmix'
  | 'companion'
  | 'custom_api'

export interface IntegrationConfig {
  id: string
  name: string
  type: IntegrationType
  enabled: boolean
  // Webhook config
  webhookUrl?: string
  webhookSecret?: string
  webhookEvents?: WebhookEventType[]
  // Discord config
  discordWebhookUrl?: string
  discordChannelId?: string
  // Slack config
  slackWebhookUrl?: string
  slackChannelId?: string
  // OBS WebSocket config
  obsHost?: string
  obsPort?: number
  obsPassword?: string
  // vMix config
  vmixHost?: string
  vmixPort?: number
  // Companion config
  companionHost?: string
  companionPort?: number
  // Custom API config
  apiEndpoint?: string
  apiKey?: string
  apiHeaders?: Record<string, string>
}

export type WebhookEventType =
  | 'room.created'
  | 'room.closed'
  | 'participant.joined'
  | 'participant.left'
  | 'recording.started'
  | 'recording.stopped'
  | 'cue.sent'
  | 'rundown.item.changed'
  | 'timer.started'
  | 'timer.ended'
  | 'output.connected'
  | 'output.disconnected'

export interface WebhookPayload {
  event: WebhookEventType
  timestamp: string
  roomId: string
  data: Record<string, unknown>
}

export interface IntegrationStatus {
  id: string
  connected: boolean
  lastPing: string | null
  lastError: string | null
  messagesSent: number
}

interface UsePlatformIntegrationOptions {
  roomId: string
  onError?: (integrationId: string, error: string) => void
}

interface UsePlatformIntegrationReturn {
  integrations: IntegrationConfig[]
  statuses: Map<string, IntegrationStatus>
  addIntegration: (config: Omit<IntegrationConfig, 'id'>) => string
  updateIntegration: (id: string, updates: Partial<IntegrationConfig>) => void
  removeIntegration: (id: string) => void
  testIntegration: (id: string) => Promise<boolean>
  sendEvent: (event: WebhookEventType, data: Record<string, unknown>) => Promise<void>
  // Specific integration helpers
  sendToDiscord: (message: string, integrationId?: string) => Promise<void>
  sendToSlack: (message: string, integrationId?: string) => Promise<void>
  triggerOBSScene: (sceneName: string, integrationId?: string) => Promise<void>
  triggerCompanionButton: (page: number, button: number, integrationId?: string) => Promise<void>
}

/**
 * Hook for managing platform integrations
 */
export function usePlatformIntegration({
  roomId,
  onError,
}: UsePlatformIntegrationOptions): UsePlatformIntegrationReturn {
  const [integrations, setIntegrations] = useState<IntegrationConfig[]>([])
  const [statuses, setStatuses] = useState<Map<string, IntegrationStatus>>(new Map())
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  // Add a new integration
  const addIntegration = useCallback((config: Omit<IntegrationConfig, 'id'>): string => {
    const id = `integration-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const newIntegration: IntegrationConfig = { ...config, id }

    setIntegrations((prev) => [...prev, newIntegration])
    setStatuses((prev) => {
      const updated = new Map(prev)
      updated.set(id, {
        id,
        connected: false,
        lastPing: null,
        lastError: null,
        messagesSent: 0,
      })
      return updated
    })

    return id
  }, [])

  // Update an integration
  const updateIntegration = useCallback((id: string, updates: Partial<IntegrationConfig>) => {
    setIntegrations((prev) =>
      prev.map((integration) =>
        integration.id === id ? { ...integration, ...updates } : integration
      )
    )
  }, [])

  // Remove an integration
  const removeIntegration = useCallback((id: string) => {
    setIntegrations((prev) => prev.filter((integration) => integration.id !== id))
    setStatuses((prev) => {
      const updated = new Map(prev)
      updated.delete(id)
      return updated
    })
  }, [])

  // Update status
  const updateStatus = useCallback((id: string, updates: Partial<IntegrationStatus>) => {
    setStatuses((prev) => {
      const updated = new Map(prev)
      const existing = updated.get(id) || {
        id,
        connected: false,
        lastPing: null,
        lastError: null,
        messagesSent: 0,
      }
      updated.set(id, { ...existing, ...updates })
      return updated
    })
  }, [])

  // Test an integration
  const testIntegration = useCallback(async (id: string): Promise<boolean> => {
    const integration = integrations.find((i) => i.id === id)
    if (!integration) return false

    try {
      switch (integration.type) {
        case 'webhook':
          if (integration.webhookUrl) {
            const response = await fetch(integration.webhookUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(integration.webhookSecret && {
                  'X-Webhook-Secret': integration.webhookSecret,
                }),
              },
              body: JSON.stringify({
                event: 'test',
                timestamp: new Date().toISOString(),
                roomId,
                data: { message: 'Integration test' },
              }),
            })
            const success = response.ok
            updateStatus(id, {
              connected: success,
              lastPing: new Date().toISOString(),
              lastError: success ? null : `HTTP ${response.status}`,
            })
            return success
          }
          break

        case 'discord':
          if (integration.discordWebhookUrl) {
            const response = await fetch(integration.discordWebhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                content: '🔊 StreamVU Integration Test - Connection successful!',
              }),
            })
            const success = response.ok
            updateStatus(id, {
              connected: success,
              lastPing: new Date().toISOString(),
              lastError: success ? null : `HTTP ${response.status}`,
            })
            return success
          }
          break

        case 'slack':
          if (integration.slackWebhookUrl) {
            const response = await fetch(integration.slackWebhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: '🔊 StreamVU Integration Test - Connection successful!',
              }),
            })
            const success = response.ok
            updateStatus(id, {
              connected: success,
              lastPing: new Date().toISOString(),
              lastError: success ? null : `HTTP ${response.status}`,
            })
            return success
          }
          break

        // OBS, vMix, Companion would require WebSocket connections
        // which need to be handled differently (persistent connections)
        default:
          // Test not implemented for this integration type
          return false
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      updateStatus(id, {
        connected: false,
        lastPing: new Date().toISOString(),
        lastError: errorMessage,
      })
      onErrorRef.current?.(id, errorMessage)
      return false
    }

    return false
  }, [integrations, roomId, updateStatus])

  // Send event to all enabled integrations
  const sendEvent = useCallback(async (
    event: WebhookEventType,
    data: Record<string, unknown>
  ): Promise<void> => {
    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      roomId,
      data,
    }

    const enabledWebhooks = integrations.filter(
      (i) =>
        i.enabled &&
        i.type === 'webhook' &&
        i.webhookUrl &&
        (!i.webhookEvents || i.webhookEvents.includes(event))
    )

    await Promise.all(
      enabledWebhooks.map(async (integration) => {
        try {
          await fetch(integration.webhookUrl!, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(integration.webhookSecret && {
                'X-Webhook-Secret': integration.webhookSecret,
              }),
            },
            body: JSON.stringify(payload),
          })
          updateStatus(integration.id, {
            messagesSent: (statuses.get(integration.id)?.messagesSent || 0) + 1,
          })
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Send failed'
          updateStatus(integration.id, { lastError: errorMessage })
          onErrorRef.current?.(integration.id, errorMessage)
        }
      })
    )
  }, [integrations, roomId, statuses, updateStatus])

  // Send to Discord
  const sendToDiscord = useCallback(async (
    message: string,
    integrationId?: string
  ): Promise<void> => {
    const discordIntegrations = integrations.filter(
      (i) =>
        i.enabled &&
        i.type === 'discord' &&
        i.discordWebhookUrl &&
        (integrationId ? i.id === integrationId : true)
    )

    await Promise.all(
      discordIntegrations.map(async (integration) => {
        try {
          await fetch(integration.discordWebhookUrl!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: message }),
          })
          updateStatus(integration.id, {
            messagesSent: (statuses.get(integration.id)?.messagesSent || 0) + 1,
          })
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Send failed'
          updateStatus(integration.id, { lastError: errorMessage })
        }
      })
    )
  }, [integrations, statuses, updateStatus])

  // Send to Slack
  const sendToSlack = useCallback(async (
    message: string,
    integrationId?: string
  ): Promise<void> => {
    const slackIntegrations = integrations.filter(
      (i) =>
        i.enabled &&
        i.type === 'slack' &&
        i.slackWebhookUrl &&
        (integrationId ? i.id === integrationId : true)
    )

    await Promise.all(
      slackIntegrations.map(async (integration) => {
        try {
          await fetch(integration.slackWebhookUrl!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: message }),
          })
          updateStatus(integration.id, {
            messagesSent: (statuses.get(integration.id)?.messagesSent || 0) + 1,
          })
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Send failed'
          updateStatus(integration.id, { lastError: errorMessage })
        }
      })
    )
  }, [integrations, statuses, updateStatus])

  // Trigger OBS scene change (placeholder - would need WebSocket)
  const triggerOBSScene = useCallback(async (
    _sceneName: string,
    _integrationId?: string
  ): Promise<void> => {
    // OBS WebSocket implementation would go here
    // This is a placeholder for future implementation
  }, [])

  // Trigger Companion button (placeholder - would need WebSocket)
  const triggerCompanionButton = useCallback(async (
    _page: number,
    _button: number,
    _integrationId?: string
  ): Promise<void> => {
    // Companion implementation would go here
    // This is a placeholder for future implementation
  }, [])

  return {
    integrations,
    statuses,
    addIntegration,
    updateIntegration,
    removeIntegration,
    testIntegration,
    sendEvent,
    sendToDiscord,
    sendToSlack,
    triggerOBSScene,
    triggerCompanionButton,
  }
}

/**
 * Get icon for integration type
 */
export function getIntegrationIcon(type: IntegrationType): string {
  switch (type) {
    case 'webhook':
      return '🔗'
    case 'discord':
      return '💬'
    case 'slack':
      return '📱'
    case 'obs_websocket':
      return '🎬'
    case 'vmix':
      return '📺'
    case 'companion':
      return '🎛️'
    case 'custom_api':
      return '⚡'
    default:
      return '🔌'
  }
}

/**
 * Get display name for integration type
 */
export function getIntegrationName(type: IntegrationType): string {
  switch (type) {
    case 'webhook':
      return 'Webhook'
    case 'discord':
      return 'Discord'
    case 'slack':
      return 'Slack'
    case 'obs_websocket':
      return 'OBS WebSocket'
    case 'vmix':
      return 'vMix'
    case 'companion':
      return 'Bitfocus Companion'
    case 'custom_api':
      return 'Custom API'
    default:
      return 'Unknown'
  }
}
