/**
 * WHIP (WebRTC HTTP Ingest Protocol) Routes
 *
 * Implements WHIP endpoints for accepting WebRTC streams from
 * OBS 30+, vMix, and other WHIP-compatible clients.
 *
 * Endpoints:
 * - POST /whip/:roomId/ingest           Create WHIP endpoint
 * - POST /whip/:roomId/ingest/:streamId Accept WHIP offer
 * - PATCH /whip/:roomId/ingest/:streamId Handle ICE candidates (trickle)
 * - DELETE /whip/:roomId/resource/:streamId Teardown stream
 * - GET /whep/:roomId/:streamId          WHEP playback endpoint
 */

import { Router, type Request, type Response, type NextFunction } from 'express'
import { authenticate } from '../middleware/auth.js'
import { whipService } from '../services/whip.service.js'
import { prisma } from '../lib/prisma.js'
import { config } from '../config/index.js'

const router: Router = Router()

// Helper to check room access
async function checkRoomAccess(roomId: string, userId: string): Promise<boolean> {
  const room = await prisma.callRoom.findUnique({
    where: { id: roomId },
    include: {
      organization: {
        include: {
          members: {
            where: { userId },
          },
        },
      },
    },
  })

  if (!room) return false

  // Room creator or org member has access
  return room.createdById === userId || room.organization.members.length > 0
}

// Helper to extract bearer token
function extractBearerToken(req: Request): string | null {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    return null
  }
  return auth.substring(7)
}

/**
 * Create a new WHIP endpoint for a room
 * POST /whip/:roomId/ingest
 */
router.post('/:roomId/ingest', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const roomId = req.params.roomId as string
    const { name } = req.body as { name?: string }

    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    // Check room access
    const hasAccess = await checkRoomAccess(roomId, req.user.sub)
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to room' })
    }

    // Get base URL from config or request
    const protocol = req.secure ? 'https' : 'http'
    const host = req.get('host') || 'localhost:3002'
    const baseUrl = config.publicUrl || `${protocol}://${host}`

    // Create WHIP endpoint
    const { endpoint, stream } = await whipService.createEndpoint(
      roomId,
      name || `WHIP ${new Date().toISOString()}`,
      baseUrl
    )

    res.status(201).json({
      endpoint,
      stream: {
        ...stream,
        createdAt: stream.createdAt.toISOString(),
        connectedAt: stream.connectedAt?.toISOString() || null,
        disconnectedAt: stream.disconnectedAt?.toISOString() || null,
      },
    })
  } catch (error) {
    next(error)
  }
})

/**
 * Handle WHIP offer (Accept WebRTC stream)
 * POST /whip/:roomId/ingest/:streamId
 *
 * This is the main WHIP endpoint that receives the SDP offer
 * and returns an SDP answer.
 */
router.post('/:roomId/ingest/:streamId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { roomId, streamId } = req.params

    // Validate bearer token
    const token = extractBearerToken(req)
    if (!token) {
      return res.status(401).json({ error: 'Bearer token required' })
    }

    const validStreamId = whipService.validateToken(token)
    if (!validStreamId || validStreamId !== streamId) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    // Get the stream
    const stream = whipService.getStream(streamId)
    if (!stream || stream.roomId !== roomId) {
      return res.status(404).json({ error: 'Stream not found' })
    }

    // Check content type
    const contentType = req.headers['content-type']
    if (contentType !== 'application/sdp') {
      return res.status(415).json({ error: 'Content-Type must be application/sdp' })
    }

    // Get client info
    const clientIp = req.ip || req.socket.remoteAddress || null
    const clientUserAgent = req.headers['user-agent'] || null

    // Get SDP offer from request body
    let sdpOffer = ''
    if (typeof req.body === 'string') {
      sdpOffer = req.body
    } else if (Buffer.isBuffer(req.body)) {
      sdpOffer = req.body.toString('utf8')
    } else {
      return res.status(400).json({ error: 'Invalid SDP offer' })
    }

    // Handle the offer
    const { sdpAnswer, resourceUrl } = await whipService.handleOffer(
      streamId,
      sdpOffer,
      clientIp,
      clientUserAgent
    )

    // Return SDP answer per WHIP spec
    res
      .status(201)
      .set('Content-Type', 'application/sdp')
      .set('Location', resourceUrl)
      .set('Access-Control-Expose-Headers', 'Location')
      .send(sdpAnswer)
  } catch (error) {
    console.error('[WHIP] Error handling offer:', error)
    next(error)
  }
})

/**
 * Handle ICE candidates (trickle ICE)
 * PATCH /whip/:roomId/ingest/:streamId
 *
 * Per WHIP spec, ICE candidates can be sent via PATCH
 */
router.patch('/:roomId/ingest/:streamId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { streamId } = req.params

    // Validate bearer token
    const token = extractBearerToken(req)
    if (!token) {
      return res.status(401).json({ error: 'Bearer token required' })
    }

    const validStreamId = whipService.validateToken(token)
    if (!validStreamId || validStreamId !== streamId) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    // Check content type for ICE candidate
    const contentType = req.headers['content-type']
    if (contentType !== 'application/trickle-ice-sdpfrag') {
      return res.status(415).json({ error: 'Content-Type must be application/trickle-ice-sdpfrag' })
    }

    // Parse ICE candidate from body
    const body = typeof req.body === 'string' ? req.body : req.body.toString('utf8')
    const lines = body.split('\r\n')

    for (const line of lines) {
      if (line.startsWith('a=candidate:')) {
        await whipService.handleIceCandidate(streamId, {
          candidate: line.substring(2), // Remove 'a='
          sdpMid: '0',
          sdpMLineIndex: 0,
        })
      }
    }

    res.status(204).send()
  } catch (error) {
    console.error('[WHIP] Error handling ICE candidate:', error)
    next(error)
  }
})

/**
 * Teardown WHIP stream
 * DELETE /whip/:roomId/resource/:streamId
 *
 * Per WHIP spec, this endpoint tears down the stream
 */
router.delete('/:roomId/resource/:streamId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { roomId, streamId } = req.params

    // Validate bearer token
    const token = extractBearerToken(req)
    if (!token) {
      return res.status(401).json({ error: 'Bearer token required' })
    }

    const validStreamId = whipService.validateToken(token)
    if (!validStreamId || validStreamId !== streamId) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    // Get the stream
    const stream = whipService.getStream(streamId)
    if (!stream || stream.roomId !== roomId) {
      return res.status(404).json({ error: 'Stream not found' })
    }

    // Delete the stream
    await whipService.deleteStream(streamId)

    res.status(204).send()
  } catch (error) {
    console.error('[WHIP] Error deleting stream:', error)
    next(error)
  }
})

/**
 * Get WHIP streams for a room
 * GET /whip/:roomId/streams
 */
router.get('/:roomId/streams', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const roomId = req.params.roomId as string

    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    // Check room access
    const hasAccess = await checkRoomAccess(roomId, req.user.sub)
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to room' })
    }

    // Get streams
    const streams = whipService.getStreamsForRoom(roomId)

    res.json({
      streams: streams.map((s) => ({
        ...s,
        createdAt: s.createdAt.toISOString(),
        connectedAt: s.connectedAt?.toISOString() || null,
        disconnectedAt: s.disconnectedAt?.toISOString() || null,
      })),
    })
  } catch (error) {
    next(error)
  }
})

/**
 * WHEP playback endpoint (for playback clients)
 * GET /whep/:roomId/:streamId
 *
 * WHEP spec: https://datatracker.ietf.org/doc/draft-murillo-whep/
 */
router.get('/whep/:roomId/:streamId', async (_req: Request, res: Response) => {
  // WHEP playback would require a consumer to be created
  // This is a placeholder for future implementation
  res.status(501).json({
    error: 'WHEP playback not yet implemented',
    message: 'WHEP playback is planned for future release',
  })
})

// OPTIONS handler for CORS preflight
router.options('*', (_req: Request, res: Response) => {
  res
    .set('Access-Control-Allow-Origin', '*')
    .set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    .set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    .set('Access-Control-Max-Age', '86400')
    .status(204)
    .send()
})

export default router
