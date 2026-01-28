/**
 * Webhook Types
 *
 * Types for webhook configuration and event delivery
 * for external system integration.
 */

/** Webhook event types that can trigger notifications */
export type WebhookEventType =
  | 'room.created'
  | 'room.closed'
  | 'participant.joined'
  | 'participant.left'
  | 'participant.muted'
  | 'participant.unmuted'
  | 'recording.started'
  | 'recording.stopped'
  | 'recording.completed'
  | 'recording.failed'
  | 'cue.sent'
  | 'cue.cleared'
  | 'source.connected'
  | 'source.disconnected'
  | 'source.error'
  | 'output.started'
  | 'output.stopped'
  | 'output.error'
  | 'transcription.started'
  | 'transcription.completed'
  | 'transcription.failed'

/** Webhook endpoint configuration */
export interface WebhookEndpoint {
  id: string
  organizationId: string
  name: string
  url: string
  secret: string
  events: WebhookEventType[]
  enabled: boolean
  createdAt: string
  updatedAt: string
  lastDeliveryAt: string | null
  lastDeliveryStatus: WebhookDeliveryStatus | null
}

/** Status of webhook delivery attempt */
export type WebhookDeliveryStatus = 'pending' | 'success' | 'failed' | 'retrying'

/** Webhook delivery log entry */
export interface WebhookDelivery {
  id: string
  webhookId: string
  event: WebhookEventType
  payload: WebhookPayload
  status: WebhookDeliveryStatus
  statusCode: number | null
  responseBody: string | null
  error: string | null
  attempts: number
  createdAt: string
  deliveredAt: string | null
}

/** Base webhook payload structure */
export interface WebhookPayload {
  event: WebhookEventType
  timestamp: string
  organizationId: string
  roomId?: string
  data: Record<string, unknown>
}

/** Room event payload */
export interface RoomEventPayload extends WebhookPayload {
  event: 'room.created' | 'room.closed'
  data: {
    roomId: string
    roomName: string
    createdById: string
  }
}

/** Participant event payload */
export interface ParticipantEventPayload extends WebhookPayload {
  event: 'participant.joined' | 'participant.left' | 'participant.muted' | 'participant.unmuted'
  data: {
    participantId: string
    displayName: string
    userId?: string
  }
}

/** Recording event payload */
export interface RecordingEventPayload extends WebhookPayload {
  event: 'recording.started' | 'recording.stopped' | 'recording.completed' | 'recording.failed'
  data: {
    recordingId: string
    type: 'individual' | 'mix'
    participantId?: string
    duration?: number
    fileUrl?: string
    error?: string
  }
}

/** Create webhook request */
export interface CreateWebhookRequest {
  name: string
  url: string
  events: WebhookEventType[]
  enabled?: boolean
}

/** Update webhook request */
export interface UpdateWebhookRequest {
  name?: string
  url?: string
  events?: WebhookEventType[]
  enabled?: boolean
}

/** Webhook list response */
export interface WebhookListResponse {
  webhooks: WebhookEndpoint[]
  total: number
}

/** Webhook delivery history response */
export interface WebhookDeliveryHistoryResponse {
  deliveries: WebhookDelivery[]
  total: number
  page: number
  pageSize: number
}

/** Test webhook request */
export interface TestWebhookRequest {
  event?: WebhookEventType
}

/** Test webhook response */
export interface TestWebhookResponse {
  success: boolean
  statusCode: number | null
  responseTime: number
  error: string | null
}
