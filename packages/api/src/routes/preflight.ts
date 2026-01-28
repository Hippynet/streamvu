/**
 * Pre-Flight Check Routes
 *
 * API endpoints for contributor self-service equipment verification.
 * Allows contributors to test their setup before joining a call room.
 *
 * Endpoints:
 * - GET /preflight/room/:roomId         Get room info for preflight
 * - POST /preflight/validate-token      Validate invite token
 * - POST /preflight/network-test        Run network quality test
 * - POST /preflight/report              Submit preflight results
 */

import { Router, type Request, type Response } from 'express'
import { prisma } from '../lib/prisma.js'

const router: Router = Router()

interface PreflightReport {
  roomId: string
  participantName: string
  token?: string
  results: {
    browser: {
      passed: boolean
      userAgent: string
      webrtcSupported: boolean
      audioSupported: boolean
      videoSupported: boolean
    }
    audio: {
      passed: boolean
      deviceId?: string
      deviceLabel?: string
      level?: number
    }
    network: {
      passed: boolean
      latency?: number
      jitter?: number
      packetLoss?: number
    }
  }
  timestamp: Date
}

/**
 * GET /preflight/room/:roomId
 * Get room information for preflight check
 * No authentication required - uses invite token or public room check
 */
router.get('/room/:roomId', async (req: Request<{ roomId: string }>, res: Response) => {
  try {
    const { roomId } = req.params
    const token = typeof req.query.token === 'string' ? req.query.token : undefined

    // Find the room with organization
    const room = await prisma.callRoom.findUnique({
      where: { id: roomId },
      include: {
        organization: true,
      },
    })

    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }

    // If token provided, validate it matches the room's invite token
    let tokenValid = false
    if (token && room.inviteToken === token) {
      tokenValid = true
    }

    // Return room info (limited fields for security)
    return res.json({
      room: {
        id: room.id,
        name: room.name,
        isActive: room.isActive,
        visibility: room.visibility,
        organizationName: room.organization.name,
        hasReturnFeed: !!room.returnFeedUrl,
      },
      tokenValid,
      requirements: {
        webrtc: true,
        audio: true,
        video: false, // Audio-only by default
        minBandwidth: 1, // Mbps
        maxLatency: 200, // ms
      },
    })
  } catch (error) {
    console.error('[Preflight] Error fetching room:', error)
    return res.status(500).json({ error: 'Failed to fetch room information' })
  }
})

/**
 * POST /preflight/validate-token
 * Validate an invite token for a room
 */
router.post('/validate-token', async (req: Request, res: Response) => {
  try {
    const { roomId, token } = req.body

    if (!roomId || !token) {
      return res.status(400).json({ error: 'Room ID and token are required' })
    }

    const room = await prisma.callRoom.findUnique({
      where: { id: roomId },
      select: {
        id: true,
        name: true,
        inviteToken: true,
        isActive: true,
        visibility: true,
      },
    })

    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }

    const valid = room.inviteToken === token

    if (!valid) {
      return res.status(401).json({
        valid: false,
        error: 'Invalid invite token',
      })
    }

    return res.json({
      valid: true,
      roomName: room.name,
      roomActive: room.isActive,
    })
  } catch (error) {
    console.error('[Preflight] Error validating token:', error)
    return res.status(500).json({ error: 'Failed to validate token' })
  }
})

/**
 * POST /preflight/network-test
 * Echo endpoint for network quality testing
 * Client sends data, server echoes it back for latency measurement
 */
router.post('/network-test', async (req: Request, res: Response) => {
  try {
    const { timestamp, payload } = req.body

    // Echo back with server timestamp for latency calculation
    return res.json({
      clientTimestamp: timestamp,
      serverTimestamp: Date.now(),
      payloadSize: payload ? payload.length : 0,
      echo: true,
    })
  } catch (error) {
    console.error('[Preflight] Error in network test:', error)
    return res.status(500).json({ error: 'Network test failed' })
  }
})

/**
 * POST /preflight/bandwidth-test
 * Endpoint for bandwidth estimation
 * Returns a chunk of data for download speed testing
 */
router.post('/bandwidth-test', async (req: Request, res: Response) => {
  try {
    const { size = 100000 } = req.body // Default 100KB

    // Limit max size to 1MB for safety
    const actualSize = Math.min(size, 1000000)

    // Generate random data
    const data = Buffer.alloc(actualSize, 'x')

    res.set('Content-Type', 'application/octet-stream')
    res.set('Content-Length', actualSize.toString())
    res.set('X-Test-Size', actualSize.toString())
    res.set('X-Server-Timestamp', Date.now().toString())

    return res.send(data)
  } catch (error) {
    console.error('[Preflight] Error in bandwidth test:', error)
    return res.status(500).json({ error: 'Bandwidth test failed' })
  }
})

/**
 * POST /preflight/report
 * Submit preflight check results
 * Stores results for producer review and analytics
 */
router.post('/report', async (req: Request, res: Response) => {
  try {
    const report: PreflightReport = req.body

    if (!report.roomId) {
      return res.status(400).json({ error: 'Room ID is required' })
    }

    // Verify room exists
    const room = await prisma.callRoom.findUnique({
      where: { id: report.roomId },
    })

    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }

    // Store the preflight report
    const preflightRecord = await prisma.preflightReport.create({
      data: {
        roomId: report.roomId,
        participantName: report.participantName,
        browserPassed: report.results.browser.passed,
        browserInfo: report.results.browser as object,
        audioPassed: report.results.audio.passed,
        audioInfo: report.results.audio as object,
        networkPassed: report.results.network.passed,
        networkInfo: report.results.network as object,
        allPassed:
          report.results.browser.passed &&
          report.results.audio.passed &&
          report.results.network.passed,
      },
    })

    // Determine overall status
    const allPassed =
      report.results.browser.passed &&
      report.results.audio.passed &&
      report.results.network.passed

    const warnings: string[] = []
    const errors: string[] = []

    if (!report.results.browser.passed) {
      errors.push('Browser compatibility issues detected')
    }
    if (!report.results.audio.passed) {
      errors.push('Audio device issues detected')
    }
    if (!report.results.network.passed) {
      warnings.push('Network quality may affect call quality')
    }

    return res.json({
      success: true,
      reportId: preflightRecord.id,
      status: allPassed ? 'passed' : errors.length > 0 ? 'failed' : 'warning',
      canJoin: report.results.browser.passed && report.results.audio.passed,
      warnings,
      errors,
    })
  } catch (error) {
    console.error('[Preflight] Error submitting report:', error)
    return res.status(500).json({ error: 'Failed to submit preflight report' })
  }
})

/**
 * GET /preflight/reports/:roomId
 * Get preflight reports for a room (producer only)
 */
router.get('/reports/:roomId', async (req: Request<{ roomId: string }>, res: Response) => {
  try {
    const { roomId } = req.params

    // Note: In production, add authentication to verify producer access
    const reports = await prisma.preflightReport.findMany({
      where: { roomId: roomId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return res.json({
      reports: reports.map((r) => ({
        id: r.id,
        participantName: r.participantName,
        allPassed: r.allPassed,
        browserPassed: r.browserPassed,
        audioPassed: r.audioPassed,
        networkPassed: r.networkPassed,
        createdAt: r.createdAt,
      })),
    })
  } catch (error) {
    console.error('[Preflight] Error fetching reports:', error)
    return res.status(500).json({ error: 'Failed to fetch preflight reports' })
  }
})

/**
 * GET /preflight/ice-servers
 * Get ICE server configuration for WebRTC testing
 */
router.get('/ice-servers', async (_req: Request, res: Response) => {
  try {
    // Return STUN/TURN server configuration
    // In production, these should be configured via environment variables
    interface IceServer {
      urls: string
      username?: string
      credential?: string
    }

    const iceServers: IceServer[] = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]

    // Add TURN servers if configured
    if (process.env.TURN_HOST) {
      iceServers.push({
        urls: `turn:${process.env.TURN_HOST}:${process.env.TURN_PORT || 3478}`,
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_PASSWORD,
      })
    }

    return res.json({ iceServers })
  } catch (error) {
    console.error('[Preflight] Error fetching ICE servers:', error)
    return res.status(500).json({ error: 'Failed to fetch ICE servers' })
  }
})

export default router
