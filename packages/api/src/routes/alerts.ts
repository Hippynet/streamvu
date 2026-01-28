/**
 * Alerting API Routes
 *
 * Endpoints for managing alert configuration and viewing alert history.
 */

import { Router, type Router as RouterType } from 'express'
import { z } from 'zod'
import {
  alertingService,
  AlertChannel,
  AlertSeverity,
  AlertType,
  type AlertConfig,
} from '../services/alerting.service.js'
import { authenticate, requireOrgRole } from '../middleware/auth.js'
import { OrgMemberRole } from '@streamvu/shared'
import type { ApiResponse } from '@streamvu/shared'

const router: RouterType = Router()

// Schema for alert configuration update
const updateConfigSchema = z.object({
  enabled: z.boolean().optional(),
  channels: z.array(z.nativeEnum(AlertChannel)).optional(),
  minSeverity: z.nativeEnum(AlertSeverity).optional(),
  slack: z.object({
    webhookUrl: z.string().url(),
    channel: z.string().optional(),
    username: z.string().optional(),
    iconEmoji: z.string().optional(),
  }).optional(),
  discord: z.object({
    webhookUrl: z.string().url(),
    username: z.string().optional(),
    avatarUrl: z.string().url().optional(),
  }).optional(),
  pagerduty: z.object({
    routingKey: z.string(),
    serviceId: z.string().optional(),
  }).optional(),
  email: z.object({
    recipients: z.array(z.string().email()),
    smtpHost: z.string().optional(),
    smtpPort: z.number().optional(),
    smtpUser: z.string().optional(),
    smtpPass: z.string().optional(),
    from: z.string().email().optional(),
  }).optional(),
})

// Schema for test alert
const testAlertSchema = z.object({
  severity: z.nativeEnum(AlertSeverity).optional(),
  title: z.string().optional(),
  message: z.string().optional(),
})

/**
 * Get current alert configuration
 * GET /api/alerts/config
 */
router.get(
  '/config',
  authenticate,
  requireOrgRole(OrgMemberRole.ADMIN, OrgMemberRole.OWNER),
  async (_req, res) => {
    const config = alertingService.getConfig()

    // Sanitize sensitive data
    const sanitizedConfig: Partial<AlertConfig> = {
      enabled: config.enabled,
      channels: config.channels,
      minSeverity: config.minSeverity,
    }

    // Include channel configs but mask sensitive fields
    if (config.slack) {
      sanitizedConfig.slack = {
        webhookUrl: config.slack.webhookUrl ? '***configured***' : '',
        channel: config.slack.channel,
        username: config.slack.username,
        iconEmoji: config.slack.iconEmoji,
      }
    }
    if (config.discord) {
      sanitizedConfig.discord = {
        webhookUrl: config.discord.webhookUrl ? '***configured***' : '',
        username: config.discord.username,
        avatarUrl: config.discord.avatarUrl,
      }
    }
    if (config.pagerduty) {
      sanitizedConfig.pagerduty = {
        routingKey: config.pagerduty.routingKey ? '***configured***' : '',
        serviceId: config.pagerduty.serviceId,
      }
    }
    if (config.email) {
      sanitizedConfig.email = {
        recipients: config.email.recipients,
        smtpHost: config.email.smtpHost,
        smtpPort: config.email.smtpPort,
        smtpUser: config.email.smtpUser ? '***configured***' : undefined,
        smtpPass: config.email.smtpPass ? '***configured***' : undefined,
        from: config.email.from,
      }
    }

    const response: ApiResponse<typeof sanitizedConfig> = {
      success: true,
      data: sanitizedConfig,
    }
    res.json(response)
  }
)

/**
 * Update alert configuration
 * PUT /api/alerts/config
 */
router.put(
  '/config',
  authenticate,
  requireOrgRole(OrgMemberRole.OWNER),
  async (req, res, next) => {
    try {
      const data = updateConfigSchema.parse(req.body)
      alertingService.configure(data)

      const response: ApiResponse = {
        success: true,
      }
      res.json(response)
    } catch (error) {
      next(error)
    }
  }
)

/**
 * Get alert history
 * GET /api/alerts/history
 */
router.get(
  '/history',
  authenticate,
  requireOrgRole(OrgMemberRole.ADMIN, OrgMemberRole.OWNER),
  async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500)
    const history = alertingService.getAlertHistory(limit)

    const response: ApiResponse<typeof history> = {
      success: true,
      data: history,
    }
    res.json(response)
  }
)

/**
 * Clear alert history
 * DELETE /api/alerts/history
 */
router.delete(
  '/history',
  authenticate,
  requireOrgRole(OrgMemberRole.OWNER),
  async (_req, res) => {
    alertingService.clearAlertHistory()

    const response: ApiResponse = {
      success: true,
    }
    res.json(response)
  }
)

/**
 * Send a test alert
 * POST /api/alerts/test
 */
router.post(
  '/test',
  authenticate,
  requireOrgRole(OrgMemberRole.ADMIN, OrgMemberRole.OWNER),
  async (req, res, next) => {
    try {
      const data = testAlertSchema.parse(req.body || {})

      await alertingService.sendAlert({
        type: AlertType.SYSTEM_ERROR,
        severity: data.severity || AlertSeverity.INFO,
        title: data.title || 'Test Alert',
        message: data.message || 'This is a test alert from StreamVU.',
        source: 'Test',
        details: {
          triggeredBy: (req.user as { email?: string })?.email || 'unknown',
          timestamp: new Date().toISOString(),
        },
      })

      const response: ApiResponse = {
        success: true,
      }
      res.json(response)
    } catch (error) {
      next(error)
    }
  }
)

export default router
