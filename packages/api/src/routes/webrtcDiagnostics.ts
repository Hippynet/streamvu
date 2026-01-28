/**
 * WebRTC Diagnostics Routes
 *
 * Endpoints for validating and diagnosing WebRTC connections,
 * bus routing, and mediasoup state.
 */

import { Router, type Router as RouterType } from 'express'
import { mediasoupService } from '../services/mediasoup.service.js'
import { busEncoderService } from '../services/busEncoder.service.js'
import { authenticate, requireOrgRole } from '../middleware/auth.js'
import { OrgMemberRole } from '@streamvu/shared'
import type { ApiResponse } from '@streamvu/shared'

const router: RouterType = Router()

// Diagnostic response types
interface RoomDiagnostics {
  exists: boolean
  participantCount: number
  producers: Array<{
    participantId: string
    producerId: string
    busType?: string
    isBusOutput: boolean
    closed: boolean
    paused: boolean
  }>
  plainTransports: number
  srtSources: number
}

interface BusProducerInfo {
  busType: string
  available: boolean
  producerId: string | null
  participantId: string | null
  allProducers: Array<{
    producerId: string
    participantId: string
    paused: boolean
  }>
}

interface EncoderInfo {
  outputId: string
  isRunning: boolean
  uptimeSeconds: number
  startedAt: string | null
  retryCount: number
}

interface ValidationResult {
  roomId: string
  timestamp: string
  room: RoomDiagnostics | null
  busProducers: BusProducerInfo[]
  encoders: EncoderInfo[]
  issues: string[]
  recommendations: string[]
}

// Get full diagnostics for a room
router.get(
  '/:roomId/diagnostics',
  authenticate,
  requireOrgRole(OrgMemberRole.ADMIN, OrgMemberRole.OWNER),
  async (req, res, next) => {
    try {
      const roomId = req.params.roomId as string

      // Get room diagnostics
      const roomDiag = mediasoupService.getRoomDiagnostics(roomId)

      // Check all bus types
      const busTypes = ['PGM', 'TB', 'AUX1', 'AUX2', 'AUX3', 'AUX4']
      const busProducers: BusProducerInfo[] = busTypes.map(busType => {
        const producer = mediasoupService.getBusProducer(roomId, busType)
        const allProducers = mediasoupService.getAllBusProducers(roomId, busType)

        return {
          busType,
          available: !!producer,
          producerId: producer?.producerId || null,
          participantId: producer?.participantId || null,
          allProducers,
        }
      })

      // Get encoder stats
      const encoderStats = busEncoderService.getAllEncoderStats()
      const encoders: EncoderInfo[] = []
      for (const [outputId, stats] of encoderStats) {
        encoders.push({
          outputId,
          ...stats,
        })
      }

      // Identify issues and recommendations
      const issues: string[] = []
      const recommendations: string[] = []

      if (!roomDiag) {
        issues.push('Room not found in mediasoup state')
        recommendations.push('Ensure at least one participant has joined the room')
      } else {
        if (roomDiag.participantCount === 0) {
          issues.push('No participants in room')
          recommendations.push('Wait for participants to join before starting outputs')
        }

        // Check for closed/paused producers
        const closedProducers = roomDiag.producers.filter(p => p.closed)
        if (closedProducers.length > 0) {
          issues.push(`${closedProducers.length} producer(s) are closed`)
          recommendations.push('Closed producers should be cleaned up - participants may have disconnected')
        }

        const pausedProducers = roomDiag.producers.filter(p => p.paused && !p.closed)
        if (pausedProducers.length > 0) {
          issues.push(`${pausedProducers.length} producer(s) are paused`)
        }

        // Check bus producer availability
        const pgmProducer = busProducers.find(b => b.busType === 'PGM')
        if (!pgmProducer?.available) {
          issues.push('No PGM bus producer available')
          recommendations.push('Ensure the host client has created a PGM bus output')
        }

        const tbProducer = busProducers.find(b => b.busType === 'TB')
        if (!tbProducer?.available) {
          issues.push('No TB (Talkback) bus producer available')
          recommendations.push('IFB/Talkback will not work without a TB bus producer')
        }

        // Check for multiple producers of same bus type (potential conflict)
        for (const bp of busProducers) {
          if (bp.allProducers.length > 1) {
            issues.push(`Multiple ${bp.busType} bus producers (${bp.allProducers.length}) - only first will be used`)
            recommendations.push(`Consider consolidating ${bp.busType} bus production to a single host`)
          }
        }
      }

      const result: ValidationResult = {
        roomId,
        timestamp: new Date().toISOString(),
        room: roomDiag,
        busProducers,
        encoders,
        issues,
        recommendations,
      }

      const response: ApiResponse<ValidationResult> = {
        success: true,
        data: result,
      }
      res.json(response)
    } catch (error) {
      next(error)
    }
  }
)

// Validate a specific producer
router.get(
  '/:roomId/producer/:producerId/validate',
  authenticate,
  async (req, res, next) => {
    try {
      const roomId = req.params.roomId as string
      const producerId = req.params.producerId as string

      const validation = mediasoupService.validateProducer(roomId, producerId)

      const response: ApiResponse<typeof validation> = {
        success: true,
        data: validation,
      }
      res.json(response)
    } catch (error) {
      next(error)
    }
  }
)

// Check if bus producer is available (quick check)
router.get(
  '/:roomId/bus/:busType/available',
  authenticate,
  async (req, res, next) => {
    try {
      const roomId = req.params.roomId as string
      const busType = req.params.busType as string

      const producer = mediasoupService.getBusProducer(roomId, busType.toUpperCase())
      const allProducers = mediasoupService.getAllBusProducers(roomId, busType.toUpperCase())

      const response: ApiResponse<{
        available: boolean
        producerId: string | null
        participantId: string | null
        totalCount: number
      }> = {
        success: true,
        data: {
          available: !!producer,
          producerId: producer?.producerId || null,
          participantId: producer?.participantId || null,
          totalCount: allProducers.length,
        },
      }
      res.json(response)
    } catch (error) {
      next(error)
    }
  }
)

// Wait for bus producer to become available
router.post(
  '/:roomId/bus/:busType/wait',
  authenticate,
  requireOrgRole(OrgMemberRole.ADMIN, OrgMemberRole.OWNER),
  async (req, res, next) => {
    try {
      const roomId = req.params.roomId as string
      const busType = req.params.busType as string
      const { maxRetries = 10, intervalMs = 2000 } = req.body || {}

      const producer = await busEncoderService.waitForBusProducer(
        roomId,
        busType.toUpperCase(),
        maxRetries,
        intervalMs
      )

      if (producer) {
        const response: ApiResponse<{
          found: true
          producerId: string
          participantId: string
        }> = {
          success: true,
          data: {
            found: true,
            producerId: producer.producerId,
            participantId: producer.participantId,
          },
        }
        res.json(response)
      } else {
        const response: ApiResponse<{ found: false }> = {
          success: true,
          data: { found: false },
        }
        res.json(response)
      }
    } catch (error) {
      next(error)
    }
  }
)

// Run comprehensive validation test
router.post(
  '/:roomId/validate',
  authenticate,
  requireOrgRole(OrgMemberRole.ADMIN, OrgMemberRole.OWNER),
  async (req, res, next) => {
    try {
      const roomId = req.params.roomId as string
      const { testBuses = ['PGM', 'TB'] } = req.body || {}

      const results: {
        busType: string
        producerFound: boolean
        producerValid: boolean
        reason?: string
      }[] = []

      for (const busType of testBuses) {
        const producer = mediasoupService.getBusProducer(roomId, busType)

        if (!producer) {
          results.push({
            busType,
            producerFound: false,
            producerValid: false,
            reason: 'Producer not found',
          })
          continue
        }

        const validation = mediasoupService.validateProducer(roomId, producer.producerId)
        results.push({
          busType,
          producerFound: true,
          producerValid: validation.valid,
          reason: validation.reason,
        })
      }

      const allValid = results.every(r => r.producerFound && r.producerValid)
      const anyFound = results.some(r => r.producerFound)

      const response: ApiResponse<{
        allBusesValid: boolean
        anyBusFound: boolean
        results: typeof results
        summary: string
      }> = {
        success: true,
        data: {
          allBusesValid: allValid,
          anyBusFound: anyFound,
          results,
          summary: allValid
            ? 'All requested buses have valid producers'
            : anyFound
              ? 'Some buses are missing or have invalid producers'
              : 'No bus producers found - ensure host is connected',
        },
      }
      res.json(response)
    } catch (error) {
      next(error)
    }
  }
)

// Get encoder health for all outputs in a room
router.get(
  '/:roomId/encoders',
  authenticate,
  async (_req, res, next) => {
    try {
      const stats = busEncoderService.getAllEncoderStats()

      const encoders: Array<{
        outputId: string
        isRunning: boolean
        uptimeSeconds: number
        startedAt: string | null
        retryCount: number
      }> = []

      for (const [outputId, stat] of stats) {
        encoders.push({
          outputId,
          ...stat,
        })
      }

      const response: ApiResponse<typeof encoders> = {
        success: true,
        data: encoders,
      }
      res.json(response)
    } catch (error) {
      next(error)
    }
  }
)

export default router
