/**
 * Audit Logging Service
 *
 * Tracks significant actions for compliance and security monitoring.
 * Provides async logging to avoid blocking request handlers.
 */

import { prisma } from '../lib/prisma.js'
import { AuditAction, Prisma } from '@prisma/client'
import type { Request } from 'express'

export { AuditAction }

type JsonValue = Prisma.InputJsonValue

interface AuditLogEntry {
  userId?: string | null
  organizationId?: string | null
  action: AuditAction
  resourceType: string
  resourceId?: string | null
  details?: Record<string, unknown> | null
  ipAddress?: string | null
  userAgent?: string | null
  success?: boolean
  errorMessage?: string | null
}

/**
 * Log an audit event
 * This is intentionally fire-and-forget to avoid blocking the request
 */
export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId,
        organizationId: entry.organizationId,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        details: entry.details ? (entry.details as JsonValue) : undefined,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        success: entry.success ?? true,
        errorMessage: entry.errorMessage,
      },
    })
  } catch (error) {
    // Log to console but don't throw - audit logging should never break the app
    console.error('[AuditLog] Failed to write audit log:', error)
  }
}

/**
 * Log an audit event from a request context
 * Extracts user info, IP, and user agent from the request
 */
export async function logAuditFromRequest(
  req: Request,
  action: AuditAction,
  resourceType: string,
  resourceId?: string | null,
  details?: Record<string, unknown> | null,
  success = true,
  errorMessage?: string | null
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = req.user as any
  const ipAddress = getClientIp(req)
  const userAgent = req.headers['user-agent'] || null

  await logAuditEvent({
    userId: user?.id || null,
    organizationId: user?.organizationId || null,
    action,
    resourceType,
    resourceId,
    details,
    ipAddress,
    userAgent,
    success,
    errorMessage,
  })
}

/**
 * Get client IP address from request
 * Handles various proxy scenarios
 */
function getClientIp(req: Request): string | null {
  // Check for forwarded headers (when behind proxy)
  const forwardedFor = req.headers['x-forwarded-for']
  if (forwardedFor) {
    const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor.split(',')[0]
    return ips?.trim() || null
  }

  // Check for real IP header (some proxies use this)
  const realIp = req.headers['x-real-ip']
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] ?? null : realIp
  }

  // Fall back to direct connection IP
  return req.socket?.remoteAddress || null
}

/**
 * Query audit logs with filtering
 */
interface AuditLogQuery {
  organizationId?: string
  userId?: string
  action?: AuditAction
  resourceType?: string
  resourceId?: string
  startDate?: Date
  endDate?: Date
  limit?: number
  offset?: number
}

export async function queryAuditLogs(query: AuditLogQuery) {
  const {
    organizationId,
    userId,
    action,
    resourceType,
    resourceId,
    startDate,
    endDate,
    limit = 100,
    offset = 0,
  } = query

  const where: Record<string, unknown> = {}

  if (organizationId) where.organizationId = organizationId
  if (userId) where.userId = userId
  if (action) where.action = action
  if (resourceType) where.resourceType = resourceType
  if (resourceId !== undefined) where.resourceId = resourceId ?? null

  if (startDate || endDate) {
    where.createdAt = {}
    if (startDate) (where.createdAt as Record<string, Date>).gte = startDate
    if (endDate) (where.createdAt as Record<string, Date>).lte = endDate
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    }),
    prisma.auditLog.count({ where }),
  ])

  return { logs, total, limit, offset }
}

/**
 * Delete old audit logs (for data retention)
 */
export async function purgeOldAuditLogs(retentionDays: number): Promise<number> {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

  const result = await prisma.auditLog.deleteMany({
    where: {
      createdAt: {
        lt: cutoffDate,
      },
    },
  })

  console.log(`[AuditLog] Purged ${result.count} audit logs older than ${retentionDays} days`)
  return result.count
}

export const auditLogService = {
  logEvent: logAuditEvent,
  logFromRequest: logAuditFromRequest,
  query: queryAuditLogs,
  purgeOld: purgeOldAuditLogs,
}
