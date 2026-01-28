/**
 * Prometheus Metrics Routes
 *
 * Exposes metrics in Prometheus text format for scraping.
 *
 * GET /metrics      - Prometheus-format metrics (for Grafana/Prometheus)
 * GET /metrics/json - JSON format metrics (for internal dashboards)
 */

import { Router, type Router as RouterType } from 'express'
import { metricsService } from '../services/metrics.service.js'
import { authenticate } from '../middleware/auth.js'

const router: RouterType = Router()

/**
 * Prometheus metrics endpoint
 * Returns metrics in Prometheus text exposition format
 */
router.get('/', async (_req, res) => {
  try {
    const metrics = await metricsService.generateMetrics()
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
    res.send(metrics)
  } catch (error) {
    console.error('[Metrics] Error generating metrics:', error)
    res.status(500).send('# Error generating metrics\n')
  }
})

/**
 * JSON metrics endpoint (authenticated)
 * Returns metrics as JSON for internal dashboards
 */
router.get('/json', authenticate, async (_req, res) => {
  try {
    const metrics = await metricsService.getMetricsJson()
    res.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Metrics] Error generating JSON metrics:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to generate metrics',
    })
  }
})

export default router
