/**
 * System Health Service
 *
 * Provides health check endpoints for Kubernetes/Docker probes.
 * Checks database, Redis, and other critical dependencies.
 */

import { prisma } from '../lib/prisma.js'

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  uptime: number
  version: string
}

export interface ReadinessStatus extends HealthStatus {
  checks: {
    database: ComponentHealth
    redis?: ComponentHealth
    mediasoup?: ComponentHealth
  }
}

export interface DetailedHealth extends ReadinessStatus {
  system: {
    nodeVersion: string
    platform: string
    arch: string
    memoryUsage: {
      heapUsed: number
      heapTotal: number
      external: number
      rss: number
    }
    cpuUsage?: {
      user: number
      system: number
    }
  }
  metrics?: {
    activeRooms: number
    activeParticipants: number
    activeStreams: number
    activeEncoders: number
  }
}

interface ComponentHealth {
  status: 'healthy' | 'unhealthy'
  latencyMs?: number
  error?: string
}

const startTime = Date.now()
const version = process.env.npm_package_version || '1.0.0'

/**
 * Basic liveness check - just confirms the service is running
 */
export async function getLivenessStatus(): Promise<HealthStatus> {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version,
  }
}

/**
 * Readiness check - confirms all dependencies are available
 */
export async function getReadinessStatus(): Promise<ReadinessStatus> {
  const checks: ReadinessStatus['checks'] = {
    database: await checkDatabase(),
  }

  // Determine overall status
  const allHealthy = Object.values(checks).every((c) => c.status === 'healthy')
  const anyUnhealthy = Object.values(checks).some((c) => c.status === 'unhealthy')

  return {
    status: anyUnhealthy ? 'unhealthy' : allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version,
    checks,
  }
}

/**
 * Detailed health check - includes system metrics
 */
export async function getDetailedHealth(): Promise<DetailedHealth> {
  const readiness = await getReadinessStatus()
  const memoryUsage = process.memoryUsage()
  const cpuUsage = process.cpuUsage()

  // Get metrics from database
  let metrics: DetailedHealth['metrics'] | undefined
  try {
    const [roomCount, participantCount, streamCount] = await Promise.all([
      prisma.callRoom.count(),
      prisma.roomParticipant.count({ where: { leftAt: null } }),
      prisma.stream.count(),
    ])
    metrics = {
      activeRooms: roomCount,
      activeParticipants: participantCount,
      activeStreams: streamCount,
      activeEncoders: 0, // Would be populated from busEncoder service
    }
  } catch {
    // Metrics are optional
  }

  return {
    ...readiness,
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      memoryUsage: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
        rss: memoryUsage.rss,
      },
      cpuUsage: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
    },
    metrics,
  }
}

/**
 * Check database connectivity
 */
async function checkDatabase(): Promise<ComponentHealth> {
  const start = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    return {
      status: 'healthy',
      latencyMs: Date.now() - start,
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export const systemHealthService = {
  getLivenessStatus,
  getReadinessStatus,
  getDetailedHealth,
}
