/**
 * Analytics Routes
 *
 * REST API for analytics and reporting.
 *
 * Endpoints:
 * - GET /analytics/dashboard - Get dashboard summary
 * - GET /analytics/sessions - Get session history
 * - GET /analytics/contributors - Get contributor statistics
 * - GET /analytics/contributors/:id - Get specific contributor stats
 * - GET /analytics/quality - Get quality metrics
 * - GET /analytics/quality/trend - Get quality trend over time
 * - GET /analytics/usage/hourly - Get usage by hour
 * - GET /analytics/usage/daily - Get usage by day
 * - GET /analytics/bandwidth - Get bandwidth statistics
 * - GET /analytics/errors - Get error statistics
 * - GET /analytics/issues - Get recent issues
 * - POST /analytics/export - Export all analytics data
 * - POST /analytics/import - Import analytics data
 */

import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { authenticate } from '../middleware/auth.js'
import { analyticsService } from '../services/analytics.service.js'

const router: Router = Router()

// =============================================================================
// Dashboard & Summary
// =============================================================================

/**
 * GET /analytics/dashboard
 * Get dashboard summary with key metrics
 */
router.get('/dashboard', authenticate, async (req: Request, res: Response) => {
  try {
    const periodDays = parseInt(req.query.days as string) || 30

    const summary = await analyticsService.getDashboardSummary(periodDays)

    res.json(summary)
  } catch (error) {
    console.error('[Analytics] Dashboard error:', error)
    res.status(500).json({
      error: 'Failed to get dashboard summary',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// =============================================================================
// Sessions
// =============================================================================

/**
 * GET /analytics/sessions
 * Get session history
 */
router.get('/sessions', authenticate, async (req: Request, res: Response) => {
  try {
    const { roomId, since } = req.query
    const sinceDate = since ? new Date(since as string) : undefined

    const sessions = await analyticsService.getSessionHistory(
      roomId as string | undefined,
      sinceDate
    )

    res.json({
      count: sessions.length,
      sessions,
    })
  } catch (error) {
    console.error('[Analytics] Sessions error:', error)
    res.status(500).json({
      error: 'Failed to get session history',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// =============================================================================
// Contributors
// =============================================================================

/**
 * GET /analytics/contributors
 * Get all contributor statistics
 */
router.get('/contributors', authenticate, async (_req: Request, res: Response) => {
  try {
    const contributors = await analyticsService.getContributorStats()

    res.json({
      count: contributors.length,
      contributors,
    })
  } catch (error) {
    console.error('[Analytics] Contributors error:', error)
    res.status(500).json({
      error: 'Failed to get contributor statistics',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * GET /analytics/contributors/top
 * Get top contributors by reliability
 */
router.get('/contributors/top', authenticate, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10

    const contributors = await analyticsService.getTopContributors(limit)

    res.json({
      count: contributors.length,
      contributors,
    })
  } catch (error) {
    console.error('[Analytics] Top contributors error:', error)
    res.status(500).json({
      error: 'Failed to get top contributors',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * GET /analytics/contributors/:id
 * Get specific contributor statistics
 */
router.get('/contributors/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const participantId = req.params.id as string

    const stats = await analyticsService.getContributorStats(participantId)

    if (stats.length === 0) {
      res.status(404).json({ error: 'Contributor not found' })
      return
    }

    // Also get their connection history
    const connectionHistory = await analyticsService.getConnectionHistory(participantId, undefined, 100)

    res.json({
      contributor: stats[0],
      connectionHistory,
    })
  } catch (error) {
    console.error('[Analytics] Contributor error:', error)
    res.status(500).json({
      error: 'Failed to get contributor statistics',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// =============================================================================
// Connection Quality
// =============================================================================

/**
 * GET /analytics/quality
 * Get connection quality metrics
 */
router.get('/quality', authenticate, async (req: Request, res: Response) => {
  try {
    const { roomId, participantId, since, limit } = req.query
    const sinceDate = since ? new Date(since as string) : undefined
    const limitNum = parseInt(limit as string) || 1000

    let metrics
    if (participantId) {
      metrics = await analyticsService.getConnectionHistory(
        participantId as string,
        sinceDate,
        limitNum
      )
    } else if (roomId) {
      metrics = await analyticsService.getRoomConnectionHistory(
        roomId as string,
        sinceDate,
        limitNum
      )
    } else {
      // Return aggregated stats
      const summary = await analyticsService.getDashboardSummary(30)
      res.json({
        avgQualityScore: summary.avgQualityScore,
        trend: summary.qualityTrend,
      })
      return
    }

    res.json({
      count: metrics.length,
      metrics,
    })
  } catch (error) {
    console.error('[Analytics] Quality error:', error)
    res.status(500).json({
      error: 'Failed to get quality metrics',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * GET /analytics/quality/trend
 * Get quality score trend over time
 */
router.get('/quality/trend', authenticate, async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30

    const trend = await analyticsService.getQualityTrend(days)

    res.json({
      days,
      trend,
    })
  } catch (error) {
    console.error('[Analytics] Quality trend error:', error)
    res.status(500).json({
      error: 'Failed to get quality trend',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// =============================================================================
// Usage Patterns
// =============================================================================

/**
 * GET /analytics/usage/hourly
 * Get usage patterns by hour
 */
router.get('/usage/hourly', authenticate, async (req: Request, res: Response) => {
  try {
    const { since } = req.query
    const sinceDate = since ? new Date(since as string) : undefined

    const usage = await analyticsService.getUsageByHour(sinceDate)

    res.json({
      usage,
    })
  } catch (error) {
    console.error('[Analytics] Hourly usage error:', error)
    res.status(500).json({
      error: 'Failed to get hourly usage',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * GET /analytics/usage/daily
 * Get usage patterns by day of week
 */
router.get('/usage/daily', authenticate, async (req: Request, res: Response) => {
  try {
    const { since } = req.query
    const sinceDate = since ? new Date(since as string) : undefined

    const usage = await analyticsService.getUsageByDay(sinceDate)

    res.json({
      usage,
    })
  } catch (error) {
    console.error('[Analytics] Daily usage error:', error)
    res.status(500).json({
      error: 'Failed to get daily usage',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// =============================================================================
// Bandwidth
// =============================================================================

/**
 * GET /analytics/bandwidth
 * Get bandwidth statistics
 */
router.get('/bandwidth', authenticate, async (req: Request, res: Response) => {
  try {
    const { roomId, since } = req.query
    const sinceDate = since ? new Date(since as string) : undefined

    const stats = await analyticsService.getBandwidthStats(
      roomId as string | undefined,
      sinceDate
    )

    // Calculate totals
    const totals = stats.reduce(
      (acc, s) => ({
        totalBytesIn: acc.totalBytesIn + s.totalBytesIn,
        totalBytesOut: acc.totalBytesOut + s.totalBytesOut,
        peakIngressBps: Math.max(acc.peakIngressBps, s.peakIngressBps),
        peakEgressBps: Math.max(acc.peakEgressBps, s.peakEgressBps),
      }),
      { totalBytesIn: 0, totalBytesOut: 0, peakIngressBps: 0, peakEgressBps: 0 }
    )

    res.json({
      count: stats.length,
      totals,
      stats,
    })
  } catch (error) {
    console.error('[Analytics] Bandwidth error:', error)
    res.status(500).json({
      error: 'Failed to get bandwidth statistics',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// =============================================================================
// Errors & Issues
// =============================================================================

/**
 * GET /analytics/errors
 * Get error statistics
 */
router.get('/errors', authenticate, async (req: Request, res: Response) => {
  try {
    const { since } = req.query
    const sinceDate = since ? new Date(since as string) : undefined

    const stats = await analyticsService.getErrorStats(sinceDate)

    res.json({
      stats,
    })
  } catch (error) {
    console.error('[Analytics] Errors error:', error)
    res.status(500).json({
      error: 'Failed to get error statistics',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * GET /analytics/issues
 * Get recent issues
 */
router.get('/issues', authenticate, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50

    const issues = await analyticsService.getRecentIssues(limit)

    res.json({
      count: issues.length,
      issues,
    })
  } catch (error) {
    console.error('[Analytics] Issues error:', error)
    res.status(500).json({
      error: 'Failed to get recent issues',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// =============================================================================
// Data Import/Export
// =============================================================================

/**
 * POST /analytics/export
 * Export all analytics data
 */
router.post('/export', authenticate, async (_req: Request, res: Response) => {
  try {
    const data = await analyticsService.exportData()

    res.json({
      exportedAt: new Date().toISOString(),
      data,
    })
  } catch (error) {
    console.error('[Analytics] Export error:', error)
    res.status(500).json({
      error: 'Failed to export analytics data',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * POST /analytics/import
 * Import analytics data
 */
router.post('/import', authenticate, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      data: z.object({
        connectionMetrics: z.array(z.any()).optional(),
        sessions: z.array(z.any()).optional(),
        contributorStats: z.array(z.any()).optional(),
        bandwidthStats: z.array(z.any()).optional(),
        issues: z.array(z.any()).optional(),
      }),
    })

    const { data } = schema.parse(req.body)

    await analyticsService.importData(data)

    res.json({
      success: true,
      message: 'Analytics data imported successfully',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors })
      return
    }
    console.error('[Analytics] Import error:', error)
    res.status(500).json({
      error: 'Failed to import analytics data',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// =============================================================================
// Recording Metrics (POST endpoints for data collection)
// =============================================================================

const connectionQualitySchema = z.object({
  roomId: z.string(),
  participantId: z.string(),
  participantName: z.string(),
  rtt: z.number(),
  jitter: z.number(),
  packetLoss: z.number(),
  bandwidth: z.number(),
  audioLevel: z.number(),
  qualityScore: z.number().min(1).max(5),
})

/**
 * POST /analytics/quality
 * Record a connection quality metric
 */
router.post('/quality', authenticate, async (req: Request, res: Response) => {
  try {
    const metric = connectionQualitySchema.parse(req.body)

    analyticsService.recordConnectionQuality(metric)

    res.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors })
      return
    }
    console.error('[Analytics] Record quality error:', error)
    res.status(500).json({
      error: 'Failed to record quality metric',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

const bandwidthSchema = z.object({
  roomId: z.string(),
  ingressBps: z.number(),
  egressBps: z.number(),
  peakIngressBps: z.number(),
  peakEgressBps: z.number(),
  totalBytesIn: z.number(),
  totalBytesOut: z.number(),
})

/**
 * POST /analytics/bandwidth
 * Record bandwidth statistics
 */
router.post('/bandwidth', authenticate, async (req: Request, res: Response) => {
  try {
    const stats = bandwidthSchema.parse(req.body)

    analyticsService.recordBandwidth(stats)

    res.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors })
      return
    }
    console.error('[Analytics] Record bandwidth error:', error)
    res.status(500).json({
      error: 'Failed to record bandwidth stats',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

export default router
