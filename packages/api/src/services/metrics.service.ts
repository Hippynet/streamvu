/**
 * Prometheus Metrics Service
 *
 * Exports metrics in Prometheus text format for Grafana dashboards.
 * Uses a simple implementation without external dependencies.
 */

import { prisma } from '../lib/prisma.js'

// Metric types
type MetricType = 'counter' | 'gauge' | 'histogram'

interface Metric {
  name: string
  help: string
  type: MetricType
  getValue: () => Promise<number | Record<string, number>>
}

// Track request counts and latencies
const requestCounts: Record<string, number> = {}
const requestLatencies: Record<string, number[]> = {}

// Track active connections
let activeWebSocketConnections = 0
let activeWebRTCConnections = 0

/**
 * Increment request counter
 */
export function incrementRequestCount(method: string, path: string, status: number): void {
  const key = `${method}:${path}:${status}`
  requestCounts[key] = (requestCounts[key] || 0) + 1
}

/**
 * Record request latency
 */
export function recordRequestLatency(method: string, path: string, latencyMs: number): void {
  const key = `${method}:${path}`
  if (!requestLatencies[key]) {
    requestLatencies[key] = []
  }
  // Keep last 1000 samples
  if (requestLatencies[key].length >= 1000) {
    requestLatencies[key].shift()
  }
  requestLatencies[key].push(latencyMs)
}

/**
 * Update WebSocket connection count
 */
export function setWebSocketConnections(count: number): void {
  activeWebSocketConnections = count
}

/**
 * Update WebRTC connection count
 */
export function setWebRTCConnections(count: number): void {
  activeWebRTCConnections = count
}

/**
 * Define all metrics
 */
const metrics: Metric[] = [
  // System metrics
  {
    name: 'streamvu_process_memory_bytes',
    help: 'Process memory usage in bytes',
    type: 'gauge',
    getValue: async () => {
      const mem = process.memoryUsage()
      return {
        heap_used: mem.heapUsed,
        heap_total: mem.heapTotal,
        external: mem.external,
        rss: mem.rss,
      }
    },
  },
  {
    name: 'streamvu_process_uptime_seconds',
    help: 'Process uptime in seconds',
    type: 'gauge',
    getValue: async () => Math.floor(process.uptime()),
  },

  // Application metrics
  {
    name: 'streamvu_active_rooms_total',
    help: 'Number of active call rooms',
    type: 'gauge',
    getValue: async () => {
      return prisma.callRoom.count()
    },
  },
  {
    name: 'streamvu_active_participants_total',
    help: 'Number of active participants across all rooms',
    type: 'gauge',
    getValue: async () => {
      return prisma.roomParticipant.count({ where: { leftAt: null } })
    },
  },
  {
    name: 'streamvu_active_streams_total',
    help: 'Number of configured streams',
    type: 'gauge',
    getValue: async () => {
      return prisma.stream.count()
    },
  },
  {
    name: 'streamvu_audio_sources_total',
    help: 'Number of audio sources across all rooms',
    type: 'gauge',
    getValue: async () => {
      return prisma.audioSource.count()
    },
  },
  {
    name: 'streamvu_audio_outputs_total',
    help: 'Number of audio outputs across all rooms',
    type: 'gauge',
    getValue: async () => {
      return prisma.audioOutput.count()
    },
  },
  {
    name: 'streamvu_users_total',
    help: 'Total number of registered users',
    type: 'gauge',
    getValue: async () => {
      return prisma.user.count()
    },
  },
  {
    name: 'streamvu_organizations_total',
    help: 'Total number of organizations',
    type: 'gauge',
    getValue: async () => {
      return prisma.organization.count()
    },
  },

  // Connection metrics
  {
    name: 'streamvu_websocket_connections',
    help: 'Number of active WebSocket connections',
    type: 'gauge',
    getValue: async () => activeWebSocketConnections,
  },
  {
    name: 'streamvu_webrtc_connections',
    help: 'Number of active WebRTC connections',
    type: 'gauge',
    getValue: async () => activeWebRTCConnections,
  },

  // Request metrics
  {
    name: 'streamvu_http_requests_total',
    help: 'Total HTTP requests by method, path, and status',
    type: 'counter',
    getValue: async () => ({ ...requestCounts }),
  },
]

/**
 * Format a single metric value in Prometheus format
 */
function formatMetricValue(name: string, value: number, labels?: Record<string, string>): string {
  if (labels && Object.keys(labels).length > 0) {
    const labelStr = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',')
    return `${name}{${labelStr}} ${value}`
  }
  return `${name} ${value}`
}

/**
 * Generate Prometheus-format metrics output
 */
export async function generateMetrics(): Promise<string> {
  const lines: string[] = []

  for (const metric of metrics) {
    try {
      const value = await metric.getValue()

      // Add HELP and TYPE comments
      lines.push(`# HELP ${metric.name} ${metric.help}`)
      lines.push(`# TYPE ${metric.name} ${metric.type}`)

      if (typeof value === 'number') {
        lines.push(formatMetricValue(metric.name, value))
      } else if (typeof value === 'object') {
        // Handle labeled metrics
        for (const [label, val] of Object.entries(value)) {
          if (metric.name === 'streamvu_http_requests_total') {
            // Parse method:path:status format
            const parts = label.split(':')
            if (parts.length >= 3) {
              const method = parts[0] || 'unknown'
              const path = parts[1] || '/'
              const status = parts[2] || '0'
              lines.push(
                formatMetricValue(metric.name, val, {
                  method,
                  path: path.replace(/\/[a-zA-Z0-9-]+/g, '/:id'), // Normalize IDs
                  status,
                })
              )
            }
          } else if (metric.name === 'streamvu_process_memory_bytes') {
            lines.push(formatMetricValue(metric.name, val, { type: label }))
          } else {
            lines.push(formatMetricValue(metric.name, val, { label }))
          }
        }
      }

      lines.push('') // Empty line between metrics
    } catch (error) {
      console.error(`[Metrics] Error collecting metric ${metric.name}:`, error)
    }
  }

  return lines.join('\n')
}

/**
 * Get metrics as JSON (for internal use)
 */
export async function getMetricsJson(): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {}

  for (const metric of metrics) {
    try {
      result[metric.name] = await metric.getValue()
    } catch (error) {
      result[metric.name] = null
    }
  }

  return result
}

export const metricsService = {
  generateMetrics,
  getMetricsJson,
  incrementRequestCount,
  recordRequestLatency,
  setWebSocketConnections,
  setWebRTCConnections,
}
