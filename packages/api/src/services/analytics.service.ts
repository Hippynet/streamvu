/**
 * Analytics Service
 *
 * Collects and aggregates metrics for:
 * - Connection quality history
 * - Contributor reliability scores
 * - Usage patterns (peak times, duration)
 * - Bandwidth consumption
 * - Error rates and causes
 * - Room session statistics
 *
 * Data is persisted to the database for long-term storage and analysis.
 */

import { EventEmitter } from 'events'
import { prisma } from '../lib/prisma.js'
import { SessionIssueType } from '@prisma/client'

// =============================================================================
// Types & Interfaces
// =============================================================================

export interface ConnectionQualityMetric {
  timestamp: Date
  roomId: string
  participantId: string
  participantName: string
  rtt: number // Round-trip time in ms
  jitter: number // Jitter in ms
  packetLoss: number // Percentage 0-100
  bandwidth: number // Estimated bandwidth in kbps
  audioLevel: number // dB
  qualityScore: number // 1-5 (poor to excellent)
  organizationId?: string
}

export interface SessionMetric {
  id: string
  roomId: string
  roomName: string
  startTime: Date
  endTime?: Date
  duration: number // Seconds
  participantCount: number
  peakParticipants: number
  totalAudioDuration: number // Seconds of audio processed
  recordingsCount: number
  avgQualityScore: number
  issues: SessionIssue[]
  organizationId?: string
}

export interface SessionIssue {
  id?: string
  timestamp: Date
  type: 'connection_lost' | 'high_latency' | 'packet_loss' | 'audio_dropout' | 'codec_error'
  participantId?: string
  participantName?: string
  description: string
  duration?: number // Duration of issue in seconds
  resolved: boolean
  organizationId?: string
  roomId?: string
  sessionId?: string
}

export interface ContributorStats {
  participantId: string
  participantName: string
  sessionCount: number
  totalDuration: number // Total time in sessions (seconds)
  avgSessionDuration: number
  avgQualityScore: number
  reliabilityScore: number // 0-100
  issueCount: number
  lastActive: Date
  firstSeen: Date
}

export interface UsagePattern {
  period: string // e.g., "2024-01", "2024-01-15", "Monday", "14:00"
  sessionCount: number
  participantCount: number
  totalDuration: number
  avgDuration: number
  peakConcurrent: number
}

export interface BandwidthStats {
  timestamp: Date
  roomId: string
  ingressBps: number // Bytes per second
  egressBps: number
  peakIngressBps: number
  peakEgressBps: number
  totalBytesIn: number
  totalBytesOut: number
  organizationId?: string
}

export interface ErrorStats {
  period: string
  errorType: string
  count: number
  affectedSessions: number
  affectedParticipants: number
  avgResolutionTime: number // Seconds
}

export interface DashboardSummary {
  period: {
    start: Date
    end: Date
  }
  totalSessions: number
  totalParticipants: number
  totalDuration: number // Hours
  avgSessionDuration: number // Minutes
  avgQualityScore: number
  totalIssues: number
  issueRate: number // Issues per hour
  topContributors: ContributorStats[]
  usageByHour: UsagePattern[]
  usageByDay: UsagePattern[]
  recentIssues: SessionIssue[]
  qualityTrend: Array<{ date: string; avgScore: number }>
}

// Map our string types to Prisma enum
function toSessionIssueType(type: string): SessionIssueType {
  const mapping: Record<string, SessionIssueType> = {
    connection_lost: SessionIssueType.CONNECTION_LOST,
    high_latency: SessionIssueType.HIGH_LATENCY,
    packet_loss: SessionIssueType.PACKET_LOSS,
    audio_dropout: SessionIssueType.AUDIO_DROPOUT,
    codec_error: SessionIssueType.CODEC_ERROR,
  }
  return mapping[type] || SessionIssueType.CONNECTION_LOST
}

function fromSessionIssueType(type: SessionIssueType): SessionIssue['type'] {
  const mapping: Record<SessionIssueType, SessionIssue['type']> = {
    [SessionIssueType.CONNECTION_LOST]: 'connection_lost',
    [SessionIssueType.HIGH_LATENCY]: 'high_latency',
    [SessionIssueType.PACKET_LOSS]: 'packet_loss',
    [SessionIssueType.AUDIO_DROPOUT]: 'audio_dropout',
    [SessionIssueType.CODEC_ERROR]: 'codec_error',
  }
  return mapping[type]
}

// Default organization ID for analytics (can be overridden per-call)
const DEFAULT_ORG_ID = 'default-org'

// =============================================================================
// Analytics Service
// =============================================================================

class AnalyticsService extends EventEmitter {
  // In-memory cache for active sessions (faster updates)
  private activeSessions: Map<string, SessionMetric> = new Map()

  // Batch write queue for high-frequency metrics
  private connectionMetricQueue: Array<Omit<ConnectionQualityMetric, 'timestamp'> & { timestamp?: Date }> = []
  private bandwidthQueue: Array<Omit<BandwidthStats, 'timestamp'> & { timestamp?: Date }> = []
  private flushInterval: NodeJS.Timeout | null = null

  constructor() {
    super()
    // Start batch flush interval (every 5 seconds)
    this.flushInterval = setInterval(() => {
      this.flushMetrics().catch((err) => console.error('[Analytics] Flush error:', err))
    }, 5000)
  }

  // ===========================================================================
  // Batch Flushing
  // ===========================================================================

  private async flushMetrics(): Promise<void> {
    // Flush connection metrics
    if (this.connectionMetricQueue.length > 0) {
      const metrics = this.connectionMetricQueue.splice(0, this.connectionMetricQueue.length)
      try {
        await prisma.connectionQualityMetric.createMany({
          data: metrics.map((m) => ({
            organizationId: m.organizationId || DEFAULT_ORG_ID,
            roomId: m.roomId,
            participantId: m.participantId,
            participantName: m.participantName,
            rtt: Math.round(m.rtt),
            jitter: Math.round(m.jitter),
            packetLoss: m.packetLoss,
            bandwidth: Math.round(m.bandwidth),
            audioLevel: m.audioLevel,
            qualityScore: Math.round(m.qualityScore),
            timestamp: m.timestamp || new Date(),
          })),
        })
        console.log(`[Analytics] Flushed ${metrics.length} connection metrics`)
      } catch (err) {
        console.error('[Analytics] Failed to flush connection metrics:', err)
        // Re-queue failed metrics with size limit to prevent memory issues
        // 1000 items ~= 400KB, reasonable for temporary retry buffer
        const MAX_RETRY_QUEUE = 1000
        const availableSpace = MAX_RETRY_QUEUE - this.connectionMetricQueue.length
        if (availableSpace > 0) {
          // Only re-queue what fits, drop oldest data first
          const toRequeue = metrics.slice(-availableSpace)
          this.connectionMetricQueue.push(...toRequeue)
          if (toRequeue.length < metrics.length) {
            console.warn(`[Analytics] Dropped ${metrics.length - toRequeue.length} metrics due to queue overflow`)
          }
        } else {
          console.warn(`[Analytics] Queue full, dropped ${metrics.length} metrics`)
        }
      }
    }

    // Flush bandwidth stats
    if (this.bandwidthQueue.length > 0) {
      const stats = this.bandwidthQueue.splice(0, this.bandwidthQueue.length)
      try {
        await prisma.bandwidthStats.createMany({
          data: stats.map((s) => ({
            organizationId: s.organizationId || DEFAULT_ORG_ID,
            roomId: s.roomId,
            ingressBps: BigInt(s.ingressBps),
            egressBps: BigInt(s.egressBps),
            peakIngressBps: BigInt(s.peakIngressBps),
            peakEgressBps: BigInt(s.peakEgressBps),
            totalBytesIn: BigInt(s.totalBytesIn),
            totalBytesOut: BigInt(s.totalBytesOut),
            timestamp: s.timestamp || new Date(),
          })),
        })
        console.log(`[Analytics] Flushed ${stats.length} bandwidth stats`)
      } catch (err) {
        console.error('[Analytics] Failed to flush bandwidth stats:', err)
      }
    }
  }

  // ===========================================================================
  // Data Collection
  // ===========================================================================

  /**
   * Record a connection quality metric (batched for performance)
   */
  recordConnectionQuality(metric: Omit<ConnectionQualityMetric, 'timestamp'>): void {
    const record = { ...metric, timestamp: new Date() }

    // Add to queue for batch insert
    this.connectionMetricQueue.push(record)

    this.emit('connectionQuality', record)

    // Update contributor stats asynchronously
    this.updateContributorQuality(metric.participantId, metric.participantName, metric.qualityScore, metric.organizationId)
      .catch((err) => console.error('[Analytics] updateContributorQuality error:', err))

    // Check for quality issues
    if (metric.qualityScore < 3) {
      this.recordIssue({
        timestamp: new Date(),
        type: metric.packetLoss > 5 ? 'packet_loss' : 'high_latency',
        participantId: metric.participantId,
        participantName: metric.participantName,
        description: `Poor connection quality (score: ${metric.qualityScore}, RTT: ${metric.rtt}ms, loss: ${metric.packetLoss}%)`,
        resolved: false,
        organizationId: metric.organizationId,
        roomId: metric.roomId,
      })
    }
  }

  /**
   * Start tracking a session
   */
  async startSession(roomId: string, roomName: string, organizationId?: string): Promise<string> {
    const orgId = organizationId || DEFAULT_ORG_ID

    const session = await prisma.analyticsSession.create({
      data: {
        organizationId: orgId,
        roomId,
        roomName,
        startTime: new Date(),
        duration: 0,
        participantCount: 0,
        peakParticipants: 0,
        totalAudioDuration: 0,
        recordingsCount: 0,
        avgQualityScore: 5,
      },
    })

    // Cache in memory for fast updates
    this.activeSessions.set(session.id, {
      id: session.id,
      roomId,
      roomName,
      startTime: session.startTime,
      duration: 0,
      participantCount: 0,
      peakParticipants: 0,
      totalAudioDuration: 0,
      recordingsCount: 0,
      avgQualityScore: 5,
      issues: [],
      organizationId: orgId,
    })

    this.emit('sessionStarted', session)
    return session.id
  }

  /**
   * End a session
   */
  async endSession(sessionId: string): Promise<SessionMetric | undefined> {
    const cached = this.activeSessions.get(sessionId)
    if (!cached) {
      // Try to find in database
      const dbSession = await prisma.analyticsSession.findUnique({ where: { id: sessionId } })
      if (!dbSession) return undefined
    }

    const endTime = new Date()
    const startTime = cached?.startTime || new Date()
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000)

    const updated = await prisma.analyticsSession.update({
      where: { id: sessionId },
      data: {
        endTime,
        duration,
      },
      include: { issues: true },
    })

    this.activeSessions.delete(sessionId)

    const result: SessionMetric = {
      id: updated.id,
      roomId: updated.roomId,
      roomName: updated.roomName,
      startTime: updated.startTime,
      endTime: updated.endTime || undefined,
      duration: updated.duration,
      participantCount: updated.participantCount,
      peakParticipants: updated.peakParticipants,
      totalAudioDuration: updated.totalAudioDuration,
      recordingsCount: updated.recordingsCount,
      avgQualityScore: updated.avgQualityScore,
      issues: updated.issues.map((i) => ({
        id: i.id,
        timestamp: i.timestamp,
        type: fromSessionIssueType(i.type),
        participantId: i.participantId || undefined,
        participantName: i.participantName || undefined,
        description: i.description,
        duration: i.duration || undefined,
        resolved: i.resolved,
      })),
    }

    this.emit('sessionEnded', result)
    return result
  }

  /**
   * Update session participant count
   */
  async updateSessionParticipants(sessionId: string, count: number): Promise<void> {
    const cached = this.activeSessions.get(sessionId)
    if (cached) {
      cached.participantCount = count
      if (count > cached.peakParticipants) {
        cached.peakParticipants = count
      }
    }

    // Update database
    await prisma.analyticsSession.update({
      where: { id: sessionId },
      data: {
        participantCount: count,
        peakParticipants: cached ? cached.peakParticipants : count,
      },
    })
  }

  /**
   * Record an issue
   */
  recordIssue(issue: SessionIssue): void {
    // Fire and forget database write
    prisma.analyticsSessionIssue.create({
      data: {
        sessionId: issue.sessionId || null,
        organizationId: issue.organizationId || DEFAULT_ORG_ID,
        roomId: issue.roomId || null,
        type: toSessionIssueType(issue.type),
        participantId: issue.participantId || null,
        participantName: issue.participantName || null,
        description: issue.description,
        duration: issue.duration || null,
        resolved: issue.resolved,
        timestamp: issue.timestamp,
      },
    })
      .then((created) => {
        this.emit('issue', { ...issue, id: created.id })

        // Update contributor stats if participant involved
        if (issue.participantId) {
          this.incrementContributorIssueCount(issue.participantId, issue.organizationId)
            .catch((err) => console.error('[Analytics] incrementContributorIssueCount error:', err))
        }
      })
      .catch((err) => console.error('[Analytics] recordIssue error:', err))
  }

  /**
   * Resolve an issue
   */
  async resolveIssue(issueId: string): Promise<void> {
    const issue = await prisma.analyticsSessionIssue.findUnique({ where: { id: issueId } })
    if (!issue || issue.resolved) return

    const duration = Math.round((Date.now() - issue.timestamp.getTime()) / 1000)

    await prisma.analyticsSessionIssue.update({
      where: { id: issueId },
      data: {
        resolved: true,
        resolvedAt: new Date(),
        duration,
      },
    })

    this.emit('issueResolved', { id: issueId, duration })
  }

  /**
   * Record bandwidth stats (batched for performance)
   */
  recordBandwidth(stats: Omit<BandwidthStats, 'timestamp'>): void {
    const record = { ...stats, timestamp: new Date() }
    this.bandwidthQueue.push(record)
    this.emit('bandwidth', record)
  }

  /**
   * Track contributor participation
   */
  async trackContributor(participantId: string, participantName: string, sessionDuration: number, organizationId?: string): Promise<void> {
    const orgId = organizationId || DEFAULT_ORG_ID

    // Upsert contributor stats
    await prisma.contributorStats.upsert({
      where: {
        organizationId_participantId: {
          organizationId: orgId,
          participantId,
        },
      },
      create: {
        organizationId: orgId,
        participantId,
        participantName,
        sessionCount: 1,
        totalDuration: sessionDuration,
        avgSessionDuration: sessionDuration,
        avgQualityScore: 5,
        reliabilityScore: 100,
        issueCount: 0,
        firstSeen: new Date(),
        lastActive: new Date(),
      },
      update: {
        participantName,
        sessionCount: { increment: 1 },
        totalDuration: { increment: sessionDuration },
        lastActive: new Date(),
        // avgSessionDuration will be recalculated
      },
    })

    // Recalculate average session duration
    const stats = await prisma.contributorStats.findUnique({
      where: {
        organizationId_participantId: {
          organizationId: orgId,
          participantId,
        },
      },
    })

    if (stats) {
      await prisma.contributorStats.update({
        where: { id: stats.id },
        data: {
          avgSessionDuration: stats.totalDuration / stats.sessionCount,
        },
      })
    }

    this.emit('contributorUpdated', stats)
  }

  // ===========================================================================
  // Data Retrieval & Aggregation
  // ===========================================================================

  /**
   * Get connection quality history for a participant
   */
  async getConnectionHistory(
    participantId: string,
    since?: Date,
    limit: number = 100
  ): Promise<ConnectionQualityMetric[]> {
    const metrics = await prisma.connectionQualityMetric.findMany({
      where: {
        participantId,
        ...(since && { timestamp: { gte: since } }),
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
    })

    return metrics.map((m) => ({
      timestamp: m.timestamp,
      roomId: m.roomId,
      participantId: m.participantId,
      participantName: m.participantName,
      rtt: m.rtt,
      jitter: m.jitter,
      packetLoss: m.packetLoss,
      bandwidth: m.bandwidth,
      audioLevel: m.audioLevel,
      qualityScore: m.qualityScore,
    }))
  }

  /**
   * Get connection quality history for a room
   */
  async getRoomConnectionHistory(
    roomId: string,
    since?: Date,
    limit: number = 1000
  ): Promise<ConnectionQualityMetric[]> {
    const metrics = await prisma.connectionQualityMetric.findMany({
      where: {
        roomId,
        ...(since && { timestamp: { gte: since } }),
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
    })

    return metrics.map((m) => ({
      timestamp: m.timestamp,
      roomId: m.roomId,
      participantId: m.participantId,
      participantName: m.participantName,
      rtt: m.rtt,
      jitter: m.jitter,
      packetLoss: m.packetLoss,
      bandwidth: m.bandwidth,
      audioLevel: m.audioLevel,
      qualityScore: m.qualityScore,
    }))
  }

  /**
   * Get session history
   */
  async getSessionHistory(roomId?: string, since?: Date): Promise<SessionMetric[]> {
    const sessions = await prisma.analyticsSession.findMany({
      where: {
        ...(roomId && { roomId }),
        ...(since && { startTime: { gte: since } }),
      },
      include: { issues: true },
      orderBy: { startTime: 'desc' },
    })

    return sessions.map((s) => ({
      id: s.id,
      roomId: s.roomId,
      roomName: s.roomName,
      startTime: s.startTime,
      endTime: s.endTime || undefined,
      duration: s.duration,
      participantCount: s.participantCount,
      peakParticipants: s.peakParticipants,
      totalAudioDuration: s.totalAudioDuration,
      recordingsCount: s.recordingsCount,
      avgQualityScore: s.avgQualityScore,
      issues: s.issues.map((i) => ({
        id: i.id,
        timestamp: i.timestamp,
        type: fromSessionIssueType(i.type),
        participantId: i.participantId || undefined,
        participantName: i.participantName || undefined,
        description: i.description,
        duration: i.duration || undefined,
        resolved: i.resolved,
      })),
    }))
  }

  /**
   * Get contributor statistics
   */
  async getContributorStats(participantId?: string): Promise<ContributorStats[]> {
    const stats = await prisma.contributorStats.findMany({
      where: participantId ? { participantId } : undefined,
      orderBy: { totalDuration: 'desc' },
    })

    return stats.map((s) => ({
      participantId: s.participantId,
      participantName: s.participantName,
      sessionCount: s.sessionCount,
      totalDuration: s.totalDuration,
      avgSessionDuration: s.avgSessionDuration,
      avgQualityScore: s.avgQualityScore,
      reliabilityScore: s.reliabilityScore,
      issueCount: s.issueCount,
      lastActive: s.lastActive,
      firstSeen: s.firstSeen,
    }))
  }

  /**
   * Get top contributors by reliability
   */
  async getTopContributors(limit: number = 10): Promise<ContributorStats[]> {
    const stats = await prisma.contributorStats.findMany({
      where: { sessionCount: { gte: 3 } },
      orderBy: { reliabilityScore: 'desc' },
      take: limit,
    })

    return stats.map((s) => ({
      participantId: s.participantId,
      participantName: s.participantName,
      sessionCount: s.sessionCount,
      totalDuration: s.totalDuration,
      avgSessionDuration: s.avgSessionDuration,
      avgQualityScore: s.avgQualityScore,
      reliabilityScore: s.reliabilityScore,
      issueCount: s.issueCount,
      lastActive: s.lastActive,
      firstSeen: s.firstSeen,
    }))
  }

  /**
   * Get usage patterns by hour
   */
  async getUsageByHour(since?: Date): Promise<UsagePattern[]> {
    const sessions = await prisma.analyticsSession.findMany({
      where: since ? { startTime: { gte: since } } : undefined,
    })

    const hourlyStats: Map<number, UsagePattern> = new Map()

    for (let i = 0; i < 24; i++) {
      hourlyStats.set(i, {
        period: `${i.toString().padStart(2, '0')}:00`,
        sessionCount: 0,
        participantCount: 0,
        totalDuration: 0,
        avgDuration: 0,
        peakConcurrent: 0,
      })
    }

    for (const session of sessions) {
      const hour = session.startTime.getHours()
      const stats = hourlyStats.get(hour)!
      stats.sessionCount++
      stats.participantCount += session.peakParticipants
      stats.totalDuration += session.duration
      if (session.peakParticipants > stats.peakConcurrent) {
        stats.peakConcurrent = session.peakParticipants
      }
    }

    for (const stats of hourlyStats.values()) {
      if (stats.sessionCount > 0) {
        stats.avgDuration = stats.totalDuration / stats.sessionCount
      }
    }

    return Array.from(hourlyStats.values())
  }

  /**
   * Get usage patterns by day of week
   */
  async getUsageByDay(since?: Date): Promise<UsagePattern[]> {
    const sessions = await prisma.analyticsSession.findMany({
      where: since ? { startTime: { gte: since } } : undefined,
    })

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const dailyStats: Map<number, UsagePattern> = new Map()

    for (let i = 0; i < 7; i++) {
      dailyStats.set(i, {
        period: days[i]!,
        sessionCount: 0,
        participantCount: 0,
        totalDuration: 0,
        avgDuration: 0,
        peakConcurrent: 0,
      })
    }

    for (const session of sessions) {
      const day = session.startTime.getDay()
      const stats = dailyStats.get(day)!
      stats.sessionCount++
      stats.participantCount += session.peakParticipants
      stats.totalDuration += session.duration
      if (session.peakParticipants > stats.peakConcurrent) {
        stats.peakConcurrent = session.peakParticipants
      }
    }

    for (const stats of dailyStats.values()) {
      if (stats.sessionCount > 0) {
        stats.avgDuration = stats.totalDuration / stats.sessionCount
      }
    }

    return Array.from(dailyStats.values())
  }

  /**
   * Get error statistics
   */
  async getErrorStats(since?: Date): Promise<ErrorStats[]> {
    const issues = await prisma.analyticsSessionIssue.findMany({
      where: since ? { timestamp: { gte: since } } : undefined,
    })

    const errorMap: Map<string, ErrorStats> = new Map()

    for (const issue of issues) {
      const typeStr = fromSessionIssueType(issue.type)
      if (!errorMap.has(typeStr)) {
        errorMap.set(typeStr, {
          period: since?.toISOString().slice(0, 10) || 'all-time',
          errorType: typeStr,
          count: 0,
          affectedSessions: 0,
          affectedParticipants: 0,
          avgResolutionTime: 0,
        })
      }

      const stats = errorMap.get(typeStr)!
      stats.count++

      if (issue.resolved && issue.duration) {
        stats.avgResolutionTime =
          (stats.avgResolutionTime * (stats.count - 1) + issue.duration) / stats.count
      }
    }

    return Array.from(errorMap.values()).sort((a, b) => b.count - a.count)
  }

  /**
   * Get recent issues
   */
  async getRecentIssues(limit: number = 20): Promise<SessionIssue[]> {
    const issues = await prisma.analyticsSessionIssue.findMany({
      orderBy: { timestamp: 'desc' },
      take: limit,
    })

    return issues.map((i) => ({
      id: i.id,
      timestamp: i.timestamp,
      type: fromSessionIssueType(i.type),
      participantId: i.participantId || undefined,
      participantName: i.participantName || undefined,
      description: i.description,
      duration: i.duration || undefined,
      resolved: i.resolved,
      sessionId: i.sessionId || undefined,
      roomId: i.roomId || undefined,
    }))
  }

  /**
   * Get bandwidth statistics
   */
  async getBandwidthStats(roomId?: string, since?: Date): Promise<BandwidthStats[]> {
    const stats = await prisma.bandwidthStats.findMany({
      where: {
        ...(roomId && { roomId }),
        ...(since && { timestamp: { gte: since } }),
      },
      orderBy: { timestamp: 'desc' },
    })

    return stats.map((s) => ({
      timestamp: s.timestamp,
      roomId: s.roomId,
      ingressBps: Number(s.ingressBps),
      egressBps: Number(s.egressBps),
      peakIngressBps: Number(s.peakIngressBps),
      peakEgressBps: Number(s.peakEgressBps),
      totalBytesIn: Number(s.totalBytesIn),
      totalBytesOut: Number(s.totalBytesOut),
    }))
  }

  /**
   * Get quality score trend
   */
  async getQualityTrend(days: number = 30): Promise<Array<{ date: string; avgScore: number }>> {
    const since = new Date()
    since.setDate(since.getDate() - days)

    const metrics = await prisma.connectionQualityMetric.findMany({
      where: { timestamp: { gte: since } },
      select: { timestamp: true, qualityScore: true },
    })

    const trend: Map<string, { total: number; count: number }> = new Map()

    for (const metric of metrics) {
      const date = metric.timestamp.toISOString().slice(0, 10)
      if (!trend.has(date)) {
        trend.set(date, { total: 0, count: 0 })
      }
      const day = trend.get(date)!
      day.total += metric.qualityScore
      day.count++
    }

    return Array.from(trend.entries())
      .map(([date, { total, count }]) => ({
        date,
        avgScore: count > 0 ? total / count : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  /**
   * Get dashboard summary
   */
  async getDashboardSummary(periodDays: number = 30): Promise<DashboardSummary> {
    const since = new Date()
    since.setDate(since.getDate() - periodDays)

    const [sessions, qualityMetrics, issues, topContributors, usageByHour, usageByDay, qualityTrend] =
      await Promise.all([
        prisma.analyticsSession.findMany({ where: { startTime: { gte: since } } }),
        prisma.connectionQualityMetric.findMany({
          where: { timestamp: { gte: since } },
          select: { qualityScore: true, participantId: true },
        }),
        prisma.analyticsSessionIssue.findMany({ where: { timestamp: { gte: since } } }),
        this.getTopContributors(5),
        this.getUsageByHour(since),
        this.getUsageByDay(since),
        this.getQualityTrend(periodDays),
      ])

    const totalDuration = sessions.reduce((sum, s) => sum + s.duration, 0)
    const totalParticipants = new Set(qualityMetrics.map((m) => m.participantId)).size
    const avgQualityScore =
      qualityMetrics.length > 0
        ? qualityMetrics.reduce((sum, m) => sum + m.qualityScore, 0) / qualityMetrics.length
        : 5

    const recentIssues = await this.getRecentIssues(10)

    return {
      period: {
        start: since,
        end: new Date(),
      },
      totalSessions: sessions.length,
      totalParticipants,
      totalDuration: totalDuration / 3600, // Convert to hours
      avgSessionDuration: sessions.length > 0 ? totalDuration / sessions.length / 60 : 0, // Minutes
      avgQualityScore: Math.round(avgQualityScore * 10) / 10,
      totalIssues: issues.length,
      issueRate: totalDuration > 0 ? issues.length / (totalDuration / 3600) : 0,
      topContributors,
      usageByHour,
      usageByDay,
      recentIssues,
      qualityTrend,
    }
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private async updateContributorQuality(
    participantId: string,
    participantName: string,
    qualityScore: number,
    organizationId?: string
  ): Promise<void> {
    const orgId = organizationId || DEFAULT_ORG_ID

    // Upsert with rolling average update
    const existing = await prisma.contributorStats.findUnique({
      where: {
        organizationId_participantId: {
          organizationId: orgId,
          participantId,
        },
      },
    })

    if (existing) {
      // Rolling average: 90% old, 10% new
      const newAvg = existing.avgQualityScore * 0.9 + qualityScore * 0.1

      await prisma.contributorStats.update({
        where: { id: existing.id },
        data: {
          avgQualityScore: newAvg,
          lastActive: new Date(),
          reliabilityScore: this.calculateReliabilityScore({
            ...existing,
            avgQualityScore: newAvg,
          }),
        },
      })
    } else {
      await prisma.contributorStats.create({
        data: {
          organizationId: orgId,
          participantId,
          participantName,
          sessionCount: 0,
          totalDuration: 0,
          avgSessionDuration: 0,
          avgQualityScore: qualityScore,
          reliabilityScore: 100,
          issueCount: 0,
          firstSeen: new Date(),
          lastActive: new Date(),
        },
      })
    }
  }

  private async incrementContributorIssueCount(participantId: string, organizationId?: string): Promise<void> {
    const orgId = organizationId || DEFAULT_ORG_ID

    const existing = await prisma.contributorStats.findUnique({
      where: {
        organizationId_participantId: {
          organizationId: orgId,
          participantId,
        },
      },
    })

    if (existing) {
      const newIssueCount = existing.issueCount + 1
      await prisma.contributorStats.update({
        where: { id: existing.id },
        data: {
          issueCount: newIssueCount,
          reliabilityScore: this.calculateReliabilityScore({
            ...existing,
            issueCount: newIssueCount,
          }),
        },
      })
    }
  }

  private calculateReliabilityScore(stats: {
    issueCount: number
    avgQualityScore: number
    sessionCount: number
  }): number {
    // Base score
    let score = 100

    // Deduct for issues (up to 50 points)
    const issueDeduction = Math.min(50, stats.issueCount * 5)
    score -= issueDeduction

    // Add for quality (up to 20 points)
    const qualityBonus = (stats.avgQualityScore / 5) * 20
    score += qualityBonus - 20 // Neutral at 5.0

    // Add for experience (up to 10 points)
    const experienceBonus = Math.min(10, stats.sessionCount)
    score += experienceBonus

    return Math.max(0, Math.min(100, Math.round(score)))
  }

  /**
   * Export all data for backup (from database)
   */
  async exportData(): Promise<{
    connectionMetrics: ConnectionQualityMetric[]
    sessions: SessionMetric[]
    contributorStats: ContributorStats[]
    bandwidthStats: BandwidthStats[]
    issues: SessionIssue[]
  }> {
    const [sessions, contributorStats, bandwidthStats, issues, allMetrics] = await Promise.all([
      this.getSessionHistory(),
      this.getContributorStats(),
      this.getBandwidthStats(),
      this.getRecentIssues(100000),
      // For connectionMetrics, we need a different query since we can't get all with empty participantId
      prisma.connectionQualityMetric.findMany({ take: 100000 }),
    ])

    return {
      connectionMetrics: allMetrics.map((m) => ({
        timestamp: m.timestamp,
        roomId: m.roomId,
        participantId: m.participantId,
        participantName: m.participantName,
        rtt: m.rtt,
        jitter: m.jitter,
        packetLoss: m.packetLoss,
        bandwidth: m.bandwidth,
        audioLevel: m.audioLevel,
        qualityScore: m.qualityScore,
      })),
      sessions,
      contributorStats,
      bandwidthStats,
      issues,
    }
  }

  /**
   * Import data from backup
   */
  async importData(data: {
    connectionMetrics?: ConnectionQualityMetric[]
    sessions?: SessionMetric[]
    contributorStats?: ContributorStats[]
    bandwidthStats?: BandwidthStats[]
    issues?: SessionIssue[]
  }): Promise<void> {
    // Import in batches to avoid timeouts
    if (data.connectionMetrics && data.connectionMetrics.length > 0) {
      await prisma.connectionQualityMetric.createMany({
        data: data.connectionMetrics.map((m) => ({
          organizationId: DEFAULT_ORG_ID,
          roomId: m.roomId,
          participantId: m.participantId,
          participantName: m.participantName,
          rtt: Math.round(m.rtt),
          jitter: Math.round(m.jitter),
          packetLoss: m.packetLoss,
          bandwidth: Math.round(m.bandwidth),
          audioLevel: m.audioLevel,
          qualityScore: Math.round(m.qualityScore),
          timestamp: m.timestamp,
        })),
        skipDuplicates: true,
      })
    }

    if (data.sessions && data.sessions.length > 0) {
      for (const s of data.sessions) {
        await prisma.analyticsSession.upsert({
          where: { id: s.id },
          create: {
            id: s.id,
            organizationId: DEFAULT_ORG_ID,
            roomId: s.roomId,
            roomName: s.roomName,
            startTime: s.startTime,
            endTime: s.endTime || null,
            duration: s.duration,
            participantCount: s.participantCount,
            peakParticipants: s.peakParticipants,
            totalAudioDuration: s.totalAudioDuration,
            recordingsCount: s.recordingsCount,
            avgQualityScore: s.avgQualityScore,
          },
          update: {},
        })
      }
    }

    if (data.contributorStats && data.contributorStats.length > 0) {
      for (const c of data.contributorStats) {
        await prisma.contributorStats.upsert({
          where: {
            organizationId_participantId: {
              organizationId: DEFAULT_ORG_ID,
              participantId: c.participantId,
            },
          },
          create: {
            organizationId: DEFAULT_ORG_ID,
            participantId: c.participantId,
            participantName: c.participantName,
            sessionCount: c.sessionCount,
            totalDuration: c.totalDuration,
            avgSessionDuration: c.avgSessionDuration,
            avgQualityScore: c.avgQualityScore,
            reliabilityScore: c.reliabilityScore,
            issueCount: c.issueCount,
            firstSeen: c.firstSeen,
            lastActive: c.lastActive,
          },
          update: {},
        })
      }
    }

    if (data.bandwidthStats && data.bandwidthStats.length > 0) {
      await prisma.bandwidthStats.createMany({
        data: data.bandwidthStats.map((s) => ({
          organizationId: DEFAULT_ORG_ID,
          roomId: s.roomId,
          ingressBps: BigInt(s.ingressBps),
          egressBps: BigInt(s.egressBps),
          peakIngressBps: BigInt(s.peakIngressBps),
          peakEgressBps: BigInt(s.peakEgressBps),
          totalBytesIn: BigInt(s.totalBytesIn),
          totalBytesOut: BigInt(s.totalBytesOut),
          timestamp: s.timestamp,
        })),
        skipDuplicates: true,
      })
    }

    console.log('[Analytics] Data imported successfully')
  }

  /**
   * Cleanup - flush pending metrics before shutdown
   */
  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
      this.flushInterval = null
    }
    await this.flushMetrics()
    console.log('[Analytics] Shutdown complete')
  }
}

export const analyticsService = new AnalyticsService()
