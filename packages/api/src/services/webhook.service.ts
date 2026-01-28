/**
 * Webhook Service
 *
 * Manages webhook notifications for external system integration.
 * Supports:
 * - Room events (participant join/leave, cue changes)
 * - Audio events (level changes, routing changes)
 * - Recording events (start/stop)
 * - Tally events (on-air state changes)
 */

import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'

export interface WebhookEndpoint {
  id: string
  url: string
  secret?: string
  events: WebhookEventType[]
  enabled: boolean
  createdAt: Date
  lastTriggered?: Date
  failureCount: number
  roomId?: string // If null, applies to all rooms
}

export type WebhookEventType =
  | 'room.participant.joined'
  | 'room.participant.left'
  | 'room.cue.changed'
  | 'room.routing.changed'
  | 'room.recording.started'
  | 'room.recording.stopped'
  | 'room.tally.changed'
  | 'audio.levels'
  | 'audio.peak.alert'

export interface WebhookPayload {
  event: WebhookEventType
  timestamp: string
  roomId: string
  data: Record<string, unknown>
}

interface WebhookDelivery {
  id: string
  webhookId: string
  payload: WebhookPayload
  status: 'pending' | 'success' | 'failed'
  statusCode?: number
  error?: string
  attemptCount: number
  createdAt: Date
  deliveredAt?: Date
}

class WebhookService extends EventEmitter {
  private endpoints: Map<string, WebhookEndpoint> = new Map()
  private deliveryQueue: WebhookDelivery[] = []
  private isProcessing = false
  private readonly MAX_RETRIES = 3
  private readonly RETRY_DELAYS = [1000, 5000, 30000] // 1s, 5s, 30s

  constructor() {
    super()
    // Start processing queue
    this.processQueue()
  }

  /**
   * Register a new webhook endpoint
   */
  registerEndpoint(
    url: string,
    events: WebhookEventType[],
    options: {
      secret?: string
      roomId?: string
    } = {}
  ): WebhookEndpoint {
    const endpoint: WebhookEndpoint = {
      id: randomUUID(),
      url,
      secret: options.secret,
      events,
      enabled: true,
      createdAt: new Date(),
      failureCount: 0,
      roomId: options.roomId,
    }

    this.endpoints.set(endpoint.id, endpoint)
    this.emit('endpointRegistered', endpoint)

    return endpoint
  }

  /**
   * Remove a webhook endpoint
   */
  removeEndpoint(endpointId: string): boolean {
    const removed = this.endpoints.delete(endpointId)
    if (removed) {
      this.emit('endpointRemoved', { id: endpointId })
    }
    return removed
  }

  /**
   * Update endpoint configuration
   */
  updateEndpoint(
    endpointId: string,
    updates: Partial<Pick<WebhookEndpoint, 'url' | 'events' | 'secret' | 'enabled'>>
  ): WebhookEndpoint | undefined {
    const endpoint = this.endpoints.get(endpointId)
    if (!endpoint) return undefined

    Object.assign(endpoint, updates)
    this.emit('endpointUpdated', endpoint)

    return endpoint
  }

  /**
   * Get all endpoints
   */
  getEndpoints(roomId?: string): WebhookEndpoint[] {
    const endpoints = Array.from(this.endpoints.values())
    if (roomId) {
      return endpoints.filter((e) => !e.roomId || e.roomId === roomId)
    }
    return endpoints
  }

  /**
   * Get endpoint by ID
   */
  getEndpoint(endpointId: string): WebhookEndpoint | undefined {
    return this.endpoints.get(endpointId)
  }

  /**
   * Trigger webhook for an event
   */
  trigger(event: WebhookEventType, roomId: string, data: Record<string, unknown>): void {
    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      roomId,
      data,
    }

    // Find matching endpoints
    const matchingEndpoints = Array.from(this.endpoints.values()).filter(
      (endpoint) =>
        endpoint.enabled &&
        endpoint.events.includes(event) &&
        (!endpoint.roomId || endpoint.roomId === roomId)
    )

    // Queue deliveries
    for (const endpoint of matchingEndpoints) {
      const delivery: WebhookDelivery = {
        id: randomUUID(),
        webhookId: endpoint.id,
        payload,
        status: 'pending',
        attemptCount: 0,
        createdAt: new Date(),
      }

      this.deliveryQueue.push(delivery)
    }

    this.emit('triggered', { event, roomId, matchCount: matchingEndpoints.length })
  }

  /**
   * Process the delivery queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return

    this.isProcessing = true

    while (true) {
      const delivery = this.deliveryQueue.shift()
      if (!delivery) {
        // Wait before checking again
        await new Promise((resolve) => setTimeout(resolve, 100))
        continue
      }

      const endpoint = this.endpoints.get(delivery.webhookId)
      if (!endpoint || !endpoint.enabled) {
        continue
      }

      try {
        await this.deliver(delivery, endpoint)
        delivery.status = 'success'
        delivery.deliveredAt = new Date()
        endpoint.lastTriggered = new Date()
        endpoint.failureCount = 0

        this.emit('delivered', { deliveryId: delivery.id, webhookId: endpoint.id })
      } catch (error) {
        delivery.attemptCount++
        delivery.error = error instanceof Error ? error.message : 'Unknown error'

        if (delivery.attemptCount < this.MAX_RETRIES) {
          // Re-queue with delay
          const delay = this.RETRY_DELAYS[delivery.attemptCount - 1] || 30000
          setTimeout(() => {
            this.deliveryQueue.push(delivery)
          }, delay)
        } else {
          delivery.status = 'failed'
          endpoint.failureCount++

          // Disable endpoint after too many failures
          if (endpoint.failureCount >= 10) {
            endpoint.enabled = false
            this.emit('endpointDisabled', {
              id: endpoint.id,
              reason: 'Too many failures',
            })
          }

          this.emit('deliveryFailed', {
            deliveryId: delivery.id,
            webhookId: endpoint.id,
            error: delivery.error,
          })
        }
      }
    }
  }

  /**
   * Deliver webhook to endpoint
   */
  private async deliver(delivery: WebhookDelivery, endpoint: WebhookEndpoint): Promise<void> {
    const body = JSON.stringify(delivery.payload)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-ID': delivery.id,
      'X-Webhook-Timestamp': delivery.payload.timestamp,
    }

    // Add signature if secret is configured
    if (endpoint.secret) {
      const signature = await this.generateSignature(body, endpoint.secret)
      headers['X-Webhook-Signature'] = signature
    }

    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10000), // 10s timeout
    })

    delivery.statusCode = response.status

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
  }

  /**
   * Generate HMAC signature for webhook payload
   */
  private async generateSignature(body: string, secret: string): Promise<string> {
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )

    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
    const signatureArray = Array.from(new Uint8Array(signature))
    return 'sha256=' + signatureArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  /**
   * Get recent deliveries for debugging
   */
  getRecentDeliveries(limit = 100): WebhookDelivery[] {
    // In a real implementation, these would be persisted
    return this.deliveryQueue.slice(-limit)
  }

  // Convenience methods for common events

  triggerParticipantJoined(roomId: string, participantId: string, name: string): void {
    this.trigger('room.participant.joined', roomId, { participantId, name })
  }

  triggerParticipantLeft(roomId: string, participantId: string, name: string): void {
    this.trigger('room.participant.left', roomId, { participantId, name })
  }

  triggerCueChanged(
    roomId: string,
    participantId: string,
    cueState: string,
    previousState?: string
  ): void {
    this.trigger('room.cue.changed', roomId, { participantId, cueState, previousState })
  }

  triggerRoutingChanged(
    roomId: string,
    sourceId: string,
    busId: string,
    enabled: boolean
  ): void {
    this.trigger('room.routing.changed', roomId, { sourceId, busId, enabled })
  }

  triggerRecordingStarted(roomId: string, recordingId: string, filename?: string): void {
    this.trigger('room.recording.started', roomId, { recordingId, filename })
  }

  triggerRecordingStopped(
    roomId: string,
    recordingId: string,
    duration?: number,
    fileSize?: number
  ): void {
    this.trigger('room.recording.stopped', roomId, { recordingId, duration, fileSize })
  }

  triggerTallyChanged(roomId: string, participantId: string, isOnAir: boolean): void {
    this.trigger('room.tally.changed', roomId, { participantId, isOnAir })
  }

  triggerPeakAlert(roomId: string, sourceId: string, peakLevel: number): void {
    this.trigger('audio.peak.alert', roomId, { sourceId, peakLevel })
  }
}

export const webhookService = new WebhookService()
