/**
 * Alerting Service
 *
 * Proactive notification system for operators.
 * Supports multiple alert channels:
 * - Email notifications
 * - Slack/Discord webhooks
 * - PagerDuty integration
 */

// Config import available if needed for future channel integrations
// import { config } from '../config/index.js'

// Alert severity levels
export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

// Alert types
export enum AlertType {
  SYSTEM_ERROR = 'system_error',
  CONNECTION_FAILURE = 'connection_failure',
  RESOURCE_THRESHOLD = 'resource_threshold',
  ENCODER_FAILURE = 'encoder_failure',
  SECURITY_EVENT = 'security_event',
  PARTICIPANT_EVENT = 'participant_event',
  STREAM_EVENT = 'stream_event',
}

// Alert channel types
export enum AlertChannel {
  EMAIL = 'email',
  SLACK = 'slack',
  DISCORD = 'discord',
  PAGERDUTY = 'pagerduty',
  CONSOLE = 'console',
}

// Alert configuration
export interface AlertConfig {
  enabled: boolean
  channels: AlertChannel[]
  minSeverity: AlertSeverity
  // Channel-specific configs
  email?: {
    recipients: string[]
    smtpHost?: string
    smtpPort?: number
    smtpUser?: string
    smtpPass?: string
    from?: string
  }
  slack?: {
    webhookUrl: string
    channel?: string
    username?: string
    iconEmoji?: string
  }
  discord?: {
    webhookUrl: string
    username?: string
    avatarUrl?: string
  }
  pagerduty?: {
    routingKey: string
    serviceId?: string
  }
}

// Alert payload
export interface Alert {
  id: string
  type: AlertType
  severity: AlertSeverity
  title: string
  message: string
  details?: Record<string, unknown>
  roomId?: string
  organizationId?: string
  timestamp: Date
  source?: string
}

// Default configuration
const DEFAULT_CONFIG: AlertConfig = {
  enabled: process.env.ALERTS_ENABLED === 'true',
  channels: [AlertChannel.CONSOLE],
  minSeverity: AlertSeverity.WARNING,
  slack: process.env.SLACK_WEBHOOK_URL
    ? { webhookUrl: process.env.SLACK_WEBHOOK_URL }
    : undefined,
  discord: process.env.DISCORD_WEBHOOK_URL
    ? { webhookUrl: process.env.DISCORD_WEBHOOK_URL }
    : undefined,
  pagerduty: process.env.PAGERDUTY_ROUTING_KEY
    ? { routingKey: process.env.PAGERDUTY_ROUTING_KEY }
    : undefined,
}

// Severity ordering for comparison
const SEVERITY_ORDER = {
  [AlertSeverity.INFO]: 0,
  [AlertSeverity.WARNING]: 1,
  [AlertSeverity.ERROR]: 2,
  [AlertSeverity.CRITICAL]: 3,
}

// Rate limiting to prevent alert storms
const alertCooldowns = new Map<string, number>()
const COOLDOWN_MS = 60000 // 1 minute cooldown per unique alert

/**
 * Alerting Service
 */
class AlertingService {
  private config: AlertConfig = DEFAULT_CONFIG
  private alertHistory: Alert[] = []
  private readonly maxHistorySize = 1000

  constructor() {
    // Auto-configure channels based on environment
    if (this.config.slack?.webhookUrl) {
      this.config.channels.push(AlertChannel.SLACK)
    }
    if (this.config.discord?.webhookUrl) {
      this.config.channels.push(AlertChannel.DISCORD)
    }
    if (this.config.pagerduty?.routingKey) {
      this.config.channels.push(AlertChannel.PAGERDUTY)
    }
  }

  /**
   * Update alerting configuration
   */
  configure(config: Partial<AlertConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Get current configuration
   */
  getConfig(): AlertConfig {
    return { ...this.config }
  }

  /**
   * Send an alert
   */
  async sendAlert(alert: Omit<Alert, 'id' | 'timestamp'>): Promise<void> {
    if (!this.config.enabled) {
      return
    }

    // Check severity threshold
    if (SEVERITY_ORDER[alert.severity] < SEVERITY_ORDER[this.config.minSeverity]) {
      return
    }

    // Rate limiting
    const alertKey = `${alert.type}:${alert.title}:${alert.roomId || 'global'}`
    const lastSent = alertCooldowns.get(alertKey)
    if (lastSent && Date.now() - lastSent < COOLDOWN_MS) {
      return // Skip duplicate alert within cooldown
    }
    alertCooldowns.set(alertKey, Date.now())

    // Create full alert object
    const fullAlert: Alert = {
      ...alert,
      id: `alert-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date(),
    }

    // Store in history
    this.alertHistory.unshift(fullAlert)
    if (this.alertHistory.length > this.maxHistorySize) {
      this.alertHistory.pop()
    }

    // Send to all configured channels
    const sendPromises = this.config.channels.map(channel =>
      this.sendToChannel(channel, fullAlert).catch(err => {
        console.error(`[Alerting] Failed to send to ${channel}:`, err)
      })
    )

    await Promise.all(sendPromises)
  }

  /**
   * Send alert to a specific channel
   */
  private async sendToChannel(channel: AlertChannel, alert: Alert): Promise<void> {
    switch (channel) {
      case AlertChannel.CONSOLE:
        this.sendToConsole(alert)
        break
      case AlertChannel.SLACK:
        await this.sendToSlack(alert)
        break
      case AlertChannel.DISCORD:
        await this.sendToDiscord(alert)
        break
      case AlertChannel.PAGERDUTY:
        await this.sendToPagerDuty(alert)
        break
      case AlertChannel.EMAIL:
        await this.sendEmail(alert)
        break
    }
  }

  /**
   * Console output (always available)
   */
  private sendToConsole(alert: Alert): void {
    const prefix = `[ALERT:${alert.severity.toUpperCase()}]`
    const message = `${prefix} ${alert.title}: ${alert.message}`

    switch (alert.severity) {
      case AlertSeverity.INFO:
        console.info(message, alert.details || '')
        break
      case AlertSeverity.WARNING:
        console.warn(message, alert.details || '')
        break
      case AlertSeverity.ERROR:
      case AlertSeverity.CRITICAL:
        console.error(message, alert.details || '')
        break
    }
  }

  /**
   * Send to Slack webhook
   */
  private async sendToSlack(alert: Alert): Promise<void> {
    const webhookUrl = this.config.slack?.webhookUrl
    if (!webhookUrl) return

    const colorMap = {
      [AlertSeverity.INFO]: '#2196F3',
      [AlertSeverity.WARNING]: '#FFC107',
      [AlertSeverity.ERROR]: '#F44336',
      [AlertSeverity.CRITICAL]: '#9C27B0',
    }

    const payload = {
      username: this.config.slack?.username || 'StreamVU Alerts',
      icon_emoji: this.config.slack?.iconEmoji || ':warning:',
      channel: this.config.slack?.channel,
      attachments: [
        {
          color: colorMap[alert.severity],
          title: `[${alert.severity.toUpperCase()}] ${alert.title}`,
          text: alert.message,
          fields: [
            ...(alert.roomId ? [{ title: 'Room', value: alert.roomId, short: true }] : []),
            ...(alert.source ? [{ title: 'Source', value: alert.source, short: true }] : []),
            { title: 'Type', value: alert.type, short: true },
            { title: 'Time', value: alert.timestamp.toISOString(), short: true },
          ],
          footer: 'StreamVU Alerting',
          ts: Math.floor(alert.timestamp.getTime() / 1000),
        },
      ],
    }

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }

  /**
   * Send to Discord webhook
   */
  private async sendToDiscord(alert: Alert): Promise<void> {
    const webhookUrl = this.config.discord?.webhookUrl
    if (!webhookUrl) return

    const colorMap = {
      [AlertSeverity.INFO]: 0x2196F3,
      [AlertSeverity.WARNING]: 0xFFC107,
      [AlertSeverity.ERROR]: 0xF44336,
      [AlertSeverity.CRITICAL]: 0x9C27B0,
    }

    const payload = {
      username: this.config.discord?.username || 'StreamVU Alerts',
      avatar_url: this.config.discord?.avatarUrl,
      embeds: [
        {
          title: `[${alert.severity.toUpperCase()}] ${alert.title}`,
          description: alert.message,
          color: colorMap[alert.severity],
          fields: [
            ...(alert.roomId ? [{ name: 'Room', value: alert.roomId, inline: true }] : []),
            ...(alert.source ? [{ name: 'Source', value: alert.source, inline: true }] : []),
            { name: 'Type', value: alert.type, inline: true },
          ],
          footer: { text: 'StreamVU Alerting' },
          timestamp: alert.timestamp.toISOString(),
        },
      ],
    }

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }

  /**
   * Send to PagerDuty Events API v2
   */
  private async sendToPagerDuty(alert: Alert): Promise<void> {
    const routingKey = this.config.pagerduty?.routingKey
    if (!routingKey) return

    // Map severity to PagerDuty severity
    const severityMap = {
      [AlertSeverity.INFO]: 'info',
      [AlertSeverity.WARNING]: 'warning',
      [AlertSeverity.ERROR]: 'error',
      [AlertSeverity.CRITICAL]: 'critical',
    }

    const payload = {
      routing_key: routingKey,
      event_action: 'trigger',
      dedup_key: `streamvu-${alert.type}-${alert.roomId || 'global'}`,
      payload: {
        summary: `[${alert.severity.toUpperCase()}] ${alert.title}: ${alert.message}`,
        severity: severityMap[alert.severity],
        source: alert.source || 'StreamVU',
        component: alert.roomId ? `Room: ${alert.roomId}` : 'System',
        group: alert.type,
        class: alert.type,
        custom_details: {
          ...alert.details,
          room_id: alert.roomId,
          organization_id: alert.organizationId,
          timestamp: alert.timestamp.toISOString(),
        },
      },
    }

    await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }

  /**
   * Send email alert (basic implementation - would use nodemailer in production)
   */
  private async sendEmail(alert: Alert): Promise<void> {
    const emailConfig = this.config.email
    if (!emailConfig?.recipients?.length) return

    // This is a placeholder - in production, you'd use nodemailer or a service like SendGrid
    console.log(`[Alerting] Would send email to ${emailConfig.recipients.join(', ')}:`)
    console.log(`  Subject: [StreamVU ${alert.severity.toUpperCase()}] ${alert.title}`)
    console.log(`  Body: ${alert.message}`)

    // TODO: Implement actual email sending with nodemailer
    // const transporter = nodemailer.createTransport({
    //   host: emailConfig.smtpHost,
    //   port: emailConfig.smtpPort,
    //   auth: { user: emailConfig.smtpUser, pass: emailConfig.smtpPass }
    // })
    // await transporter.sendMail({
    //   from: emailConfig.from,
    //   to: emailConfig.recipients.join(', '),
    //   subject: `[StreamVU ${alert.severity.toUpperCase()}] ${alert.title}`,
    //   text: alert.message,
    //   html: `<p>${alert.message}</p>`
    // })
  }

  /**
   * Get recent alert history
   */
  getAlertHistory(limit = 100): Alert[] {
    return this.alertHistory.slice(0, limit)
  }

  /**
   * Clear alert history
   */
  clearAlertHistory(): void {
    this.alertHistory = []
  }

  // ======= Convenience Methods =======

  /**
   * Send system error alert
   */
  async systemError(title: string, message: string, details?: Record<string, unknown>): Promise<void> {
    await this.sendAlert({
      type: AlertType.SYSTEM_ERROR,
      severity: AlertSeverity.ERROR,
      title,
      message,
      details,
      source: 'System',
    })
  }

  /**
   * Send connection failure alert
   */
  async connectionFailure(
    title: string,
    message: string,
    roomId?: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.sendAlert({
      type: AlertType.CONNECTION_FAILURE,
      severity: AlertSeverity.WARNING,
      title,
      message,
      roomId,
      details,
      source: 'Connection',
    })
  }

  /**
   * Send resource threshold alert
   */
  async resourceThreshold(
    resource: string,
    currentValue: number,
    threshold: number,
    details?: Record<string, unknown>
  ): Promise<void> {
    const severity = currentValue > threshold * 1.2
      ? AlertSeverity.CRITICAL
      : AlertSeverity.WARNING

    await this.sendAlert({
      type: AlertType.RESOURCE_THRESHOLD,
      severity,
      title: `${resource} Threshold Exceeded`,
      message: `${resource} at ${currentValue.toFixed(1)}% (threshold: ${threshold}%)`,
      details: {
        resource,
        current: currentValue,
        threshold,
        ...details,
      },
      source: 'Resources',
    })
  }

  /**
   * Send encoder failure alert
   */
  async encoderFailure(
    outputId: string,
    outputName: string,
    error: string,
    roomId?: string
  ): Promise<void> {
    await this.sendAlert({
      type: AlertType.ENCODER_FAILURE,
      severity: AlertSeverity.ERROR,
      title: `Encoder Failed: ${outputName}`,
      message: error,
      roomId,
      details: { outputId, outputName },
      source: 'Encoder',
    })
  }

  /**
   * Send security event alert
   */
  async securityEvent(
    title: string,
    message: string,
    severity: AlertSeverity = AlertSeverity.WARNING,
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.sendAlert({
      type: AlertType.SECURITY_EVENT,
      severity,
      title,
      message,
      details,
      source: 'Security',
    })
  }

  /**
   * Send participant event alert (join/leave, connection issues)
   */
  async participantEvent(
    title: string,
    message: string,
    roomId: string,
    severity: AlertSeverity = AlertSeverity.INFO,
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.sendAlert({
      type: AlertType.PARTICIPANT_EVENT,
      severity,
      title,
      message,
      roomId,
      details,
      source: 'Participant',
    })
  }

  /**
   * Send stream event alert
   */
  async streamEvent(
    title: string,
    message: string,
    roomId?: string,
    severity: AlertSeverity = AlertSeverity.INFO,
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.sendAlert({
      type: AlertType.STREAM_EVENT,
      severity,
      title,
      message,
      roomId,
      details,
      source: 'Stream',
    })
  }
}

export const alertingService = new AlertingService()
