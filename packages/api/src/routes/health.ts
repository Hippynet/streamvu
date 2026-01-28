/**
 * Health Check Routes
 *
 * Provides endpoints for Kubernetes/Docker health probes.
 *
 * GET /health          - Basic liveness check (always returns 200 if service is running)
 * GET /health/ready    - Readiness check (checks database, returns 503 if not ready)
 * GET /health/detailed - Full system status (authenticated, includes metrics)
 */

import { Router, type Router as RouterType } from 'express'
import { systemHealthService } from '../services/systemHealth.service.js'
import { authenticate } from '../middleware/auth.js'

const router: RouterType = Router()

/**
 * Liveness probe - confirms the service is running
 * Used by Kubernetes for restart decisions
 */
router.get('/', async (_req, res) => {
  try {
    const status = await systemHealthService.getLivenessStatus()
    res.status(200).json(status)
  } catch (error) {
    // Even on error, return 200 if the service can respond
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: 0,
      version: 'unknown',
    })
  }
})

/**
 * Readiness probe - confirms all dependencies are available
 * Used by Kubernetes to determine if traffic should be sent to this pod
 */
router.get('/ready', async (_req, res) => {
  try {
    const status = await systemHealthService.getReadinessStatus()
    const httpStatus = status.status === 'healthy' ? 200 : status.status === 'degraded' ? 200 : 503
    res.status(httpStatus).json(status)
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * Detailed health check - includes system metrics
 * Requires authentication, intended for monitoring dashboards
 */
router.get('/detailed', authenticate, async (_req, res) => {
  try {
    const status = await systemHealthService.getDetailedHealth()
    res.status(200).json(status)
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

export default router
