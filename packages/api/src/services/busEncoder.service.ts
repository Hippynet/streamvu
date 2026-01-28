import { spawn, ChildProcess } from 'child_process'
import { mediasoupService } from './mediasoup.service.js'
import { audioOutputService } from './audioOutput.service.js'
import { alertingService } from './alerting.service.js'
import { emitOutputStateChange, emitBusLevelChange } from '../socket/callCenter.js'
import { prisma } from '../lib/prisma.js'
import type { RtpParameters } from 'mediasoup/types'

interface EncoderProcess {
  ffmpeg: ChildProcess
  outputId: string
  roomId: string
  producerId: string
  producerIds?: string[] // For multi-bus
  busRouting?: BusRoutingConfig // For multi-bus
  startedAt: Date
  retryCount: number
  retryTimeoutHandle: NodeJS.Timeout | null
}

// Pending level change for debounced restart
interface PendingLevelChange {
  outputId: string
  roomId: string
  busRouting: BusRoutingConfig
  debounceTimer: NodeJS.Timeout
}

// Multi-bus routing configuration
export interface BusRoutingConfig {
  pgm?: number  // 0.0 - 1.0
  tb?: number
  aux1?: number
  aux2?: number
  aux3?: number
  aux4?: number
}

// Retry configuration
const MAX_RETRIES = 3
const RETRY_DELAYS_MS = [5000, 15000, 30000] // 5s, 15s, 30s

// Debounce delay for level changes (ms) - wait this long after last change before restarting encoder
const LEVEL_CHANGE_DEBOUNCE_MS = 500

/**
 * Bus Encoder Service
 *
 * Handles FFmpeg encoding of bus audio for streaming to Icecast/SRT.
 * This is a lightweight encoder - it receives pre-mixed audio from the client
 * and just encodes it for output. No mixing happens on the server!
 *
 * Supports real-time level changes via debounced encoder restart:
 * - Level changes are broadcast immediately via WebSocket for visual feedback
 * - After 500ms of no changes, encoder restarts with new levels
 * - Brief overlap between old and new encoder for minimal audio disruption
 */
class BusEncoderService {
  private encoders: Map<string, EncoderProcess> = new Map()
  private pendingLevelChanges: Map<string, PendingLevelChange> = new Map()

  /**
   * Start encoding a bus output
   *
   * @param outputId - The audio output ID from database
   * @param roomId - The room where the bus producer exists
   * @param producerId - The mediasoup producer ID for the bus audio
   */
  async startEncoder(outputId: string, roomId: string, producerId: string): Promise<void> {
    // Check if already running
    if (this.encoders.has(outputId)) {
      console.log(`[BusEncoder] Encoder for output ${outputId} already running`)
      return
    }

    // Get output configuration from database
    const output = await prisma.audioOutput.findUnique({
      where: { id: outputId },
    })

    if (!output) {
      throw new Error(`Output ${outputId} not found`)
    }

    console.log(`[BusEncoder] Starting encoder for output: ${output.name} (${output.type})`)

    try {
      // Create plain transport for receiving RTP from mediasoup
      const transportInfo = await mediasoupService.createPlainTransport(roomId, outputId)

      // Consume the bus producer
      const consumeResult = await mediasoupService.consumeWithPlainTransport(
        roomId,
        outputId,
        producerId
      )

      if (!consumeResult) {
        throw new Error('Failed to consume bus producer')
      }

      console.log(`[BusEncoder ${outputId}] Port config:`)
      console.log(`  - createPlainTransport returned port: ${transportInfo.localPort}`)
      console.log(`  - consumeWithPlainTransport returned port: ${consumeResult.localPort}`)
      console.log(`  - Using port ${transportInfo.localPort} for SDP (FFmpeg will listen here)`)

      // Build FFmpeg command based on output type
      const ffmpegArgs = this.buildFFmpegArgs(
        transportInfo.localPort,
        consumeResult.rtpParameters,
        output
      )

      console.log(`[BusEncoder] FFmpeg command: ffmpeg ${ffmpegArgs.join(' ')}`)

      // Generate SDP for FFmpeg to understand the RTP stream
      const sdp = this.generateSDP(transportInfo.localPort, consumeResult.rtpParameters)
      console.log(`[BusEncoder ${outputId}] Generated SDP:\n${sdp}`)

      // Spawn FFmpeg
      const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      // Write SDP to FFmpeg stdin so it knows how to decode the RTP stream
      if (ffmpeg.stdin) {
        ffmpeg.stdin.write(sdp)
        ffmpeg.stdin.end()
        console.log(`[BusEncoder ${outputId}] SDP written to FFmpeg stdin`)
      } else {
        console.error(`[BusEncoder ${outputId}] FFmpeg stdin not available`)
        throw new Error('FFmpeg stdin not available')
      }

      // Handle FFmpeg output
      ffmpeg.stdout?.on('data', (data) => {
        console.log(`[BusEncoder ${outputId}] stdout: ${data}`)
      })

      ffmpeg.stderr?.on('data', (data) => {
        const msg = data.toString()
        // FFmpeg outputs progress to stderr, so we filter for actual errors
        if (msg.includes('Error') || msg.includes('error') || msg.includes('failed')) {
          console.error(`[BusEncoder ${outputId}] Error: ${msg}`)
        } else {
          // Log progress occasionally (every 5 seconds or so)
          if (msg.includes('size=') || msg.includes('time=')) {
            console.log(`[BusEncoder ${outputId}] Progress: ${msg.trim().slice(0, 100)}`)
          }
        }
      })

      ffmpeg.on('error', (err) => {
        console.error(`[BusEncoder ${outputId}] FFmpeg error:`, err)
        this.handleEncoderError(outputId, err.message)
          .catch((error) => console.error(`[BusEncoder ${outputId}] handleEncoderError error:`, error))
      })

      ffmpeg.on('exit', (code, signal) => {
        console.log(`[BusEncoder ${outputId}] FFmpeg exited with code ${code}, signal ${signal}`)
        const encoder = this.encoders.get(outputId)
        const retryCount = encoder?.retryCount ?? 0
        this.encoders.delete(outputId)
        mediasoupService.closePlainTransport(roomId, outputId)

        // If exit was due to error and we haven't exhausted retries, schedule retry
        if (code !== 0 && code !== null && retryCount < MAX_RETRIES) {
          const delayIndex = Math.min(retryCount, RETRY_DELAYS_MS.length - 1)
          const delay = RETRY_DELAYS_MS[delayIndex] ?? 5000
          console.log(`[BusEncoder ${outputId}] Scheduling retry ${retryCount + 1}/${MAX_RETRIES} in ${delay}ms`)

          audioOutputService.updateOutputStatus(outputId, {
            isActive: false,
            isConnected: false,
            errorMessage: `Connection lost. Retrying in ${delay / 1000}s (attempt ${retryCount + 1}/${MAX_RETRIES})`,
          }).catch((error) => console.error(`[BusEncoder ${outputId}] updateOutputStatus error:`, error))

          // Schedule retry
          setTimeout(() => {
            this.retryEncoder(outputId, roomId, producerId, retryCount + 1)
              .catch((err) => console.error(`[BusEncoder ${outputId}] Retry failed:`, err))
          }, delay)
        } else {
          // No retry - final failure or clean exit
          audioOutputService.updateOutputStatus(outputId, {
            isActive: false,
            isConnected: false,
            errorMessage: code !== 0 ? `FFmpeg exited with code ${code}` : null,
          }).catch((error) => console.error(`[BusEncoder ${outputId}] updateOutputStatus error:`, error))
        }
      })

      // Store encoder info
      this.encoders.set(outputId, {
        ffmpeg,
        outputId,
        roomId,
        producerId,
        startedAt: new Date(),
        retryCount: 0,
        retryTimeoutHandle: null,
      })

      // Update output status to active
      await audioOutputService.updateOutputStatus(outputId, {
        isActive: true,
        isConnected: true, // Will be updated by FFmpeg progress
        connectedAt: new Date(),
        errorMessage: null,
      })

      console.log(`[BusEncoder] Encoder started for output ${outputId}`)
    } catch (err) {
      console.error(`[BusEncoder] Failed to start encoder for ${outputId}:`, err)
      mediasoupService.closePlainTransport(roomId, outputId)
      throw err
    }
  }

  /**
   * Stop an encoder
   */
  async stopEncoder(outputId: string): Promise<void> {
    const encoder = this.encoders.get(outputId)
    if (!encoder) {
      console.log(`[BusEncoder] No encoder found for output ${outputId}`)
      return
    }

    console.log(`[BusEncoder] Stopping encoder for output ${outputId}`)

    // Cancel any pending level change restart
    this.cancelPendingLevelChange(outputId)

    // Kill FFmpeg gracefully
    encoder.ffmpeg.kill('SIGTERM')

    // Give it a moment to clean up
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Force kill if still running
    if (!encoder.ffmpeg.killed) {
      encoder.ffmpeg.kill('SIGKILL')
    }

    // Clean up transport
    mediasoupService.closePlainTransport(encoder.roomId, outputId)

    this.encoders.delete(outputId)

    // Update output status
    await audioOutputService.updateOutputStatus(outputId, {
      isActive: false,
      isConnected: false,
    })

    console.log(`[BusEncoder] Encoder stopped for output ${outputId}`)
  }

  /**
   * Retry starting an encoder after failure
   */
  private async retryEncoder(outputId: string, roomId: string, producerId: string, retryCount: number): Promise<void> {
    // Check if output still exists and is enabled
    const output = await prisma.audioOutput.findUnique({
      where: { id: outputId },
    })

    if (!output || !output.isEnabled) {
      console.log(`[BusEncoder ${outputId}] Output disabled or deleted, not retrying`)
      return
    }

    // Check if already running (user may have manually restarted)
    if (this.encoders.has(outputId)) {
      console.log(`[BusEncoder ${outputId}] Encoder already running, skipping retry`)
      return
    }

    console.log(`[BusEncoder ${outputId}] Attempting retry ${retryCount}/${MAX_RETRIES}`)

    try {
      await this.startEncoder(outputId, roomId, producerId)

      // Update retry count on the new encoder
      const encoder = this.encoders.get(outputId)
      if (encoder) {
        encoder.retryCount = retryCount
      }

      console.log(`[BusEncoder ${outputId}] Retry ${retryCount} successful`)
    } catch (err) {
      console.error(`[BusEncoder ${outputId}] Retry ${retryCount} failed:`, err)

      // Update status with error
      await audioOutputService.updateOutputStatus(outputId, {
        isActive: false,
        isConnected: false,
        errorMessage: retryCount >= MAX_RETRIES
          ? `Failed after ${MAX_RETRIES} retries: ${err instanceof Error ? err.message : String(err)}`
          : `Retry ${retryCount} failed: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  /**
   * Check if an encoder is running
   */
  isEncoderRunning(outputId: string): boolean {
    return this.encoders.has(outputId)
  }

  /**
   * Get encoder info
   */
  getEncoderInfo(outputId: string): EncoderProcess | undefined {
    return this.encoders.get(outputId)
  }

  /**
   * Wait for bus producer to become available with retries
   * Useful when starting output before host has created bus producers
   *
   * @param roomId - The room ID
   * @param busType - The bus type to wait for (PGM, TB, AUX1-4)
   * @param maxRetries - Maximum number of retries (default 10)
   * @param retryIntervalMs - Milliseconds between retries (default 2000)
   */
  async waitForBusProducer(
    roomId: string,
    busType: string,
    maxRetries: number = 10,
    retryIntervalMs: number = 2000
  ): Promise<{ producerId: string; participantId: string } | null> {
    console.log(`[BusEncoder] Waiting for ${busType} producer in room ${roomId} (max ${maxRetries} retries)`)

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const busProducer = mediasoupService.getBusProducer(roomId, busType)

      if (busProducer) {
        console.log(`[BusEncoder] Found ${busType} producer on attempt ${attempt + 1}: ${busProducer.producerId}`)
        return busProducer
      }

      if (attempt < maxRetries - 1) {
        console.log(`[BusEncoder] ${busType} producer not available, retry ${attempt + 1}/${maxRetries} in ${retryIntervalMs}ms`)
        await new Promise(resolve => setTimeout(resolve, retryIntervalMs))
      }
    }

    console.warn(`[BusEncoder] ${busType} producer not found after ${maxRetries} retries in room ${roomId}`)
    return null
  }

  /**
   * Start encoder with automatic producer discovery and retry
   * Will wait for the bus producer to become available
   */
  async startEncoderWithRetry(
    outputId: string,
    roomId: string,
    busType: string,
    maxProducerWaitRetries: number = 10
  ): Promise<{ success: boolean; error?: string }> {
    // First wait for the producer to be available
    const busProducer = await this.waitForBusProducer(roomId, busType, maxProducerWaitRetries)

    if (!busProducer) {
      return {
        success: false,
        error: `${busType} bus producer not available after waiting. Ensure a host is connected and has created the ${busType} bus output.`,
      }
    }

    try {
      await this.startEncoder(outputId, roomId, busProducer.producerId)
      return { success: true }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  /**
   * Start multi-bus encoder with automatic producer discovery and retry
   */
  async startMultiBusEncoderWithRetry(
    outputId: string,
    roomId: string,
    busTypes: string[],
    maxProducerWaitRetries: number = 10
  ): Promise<{ success: boolean; error?: string; foundBuses?: string[] }> {
    const busProducers = new Map<string, string>()

    // Wait for at least one bus producer
    for (const busType of busTypes) {
      const busProducer = await this.waitForBusProducer(roomId, busType, maxProducerWaitRetries)
      if (busProducer) {
        busProducers.set(busType.toUpperCase(), busProducer.producerId)
      }
    }

    if (busProducers.size === 0) {
      return {
        success: false,
        error: `No bus producers available after waiting. Requested: ${busTypes.join(', ')}`,
      }
    }

    try {
      await this.startMultiBusEncoder(outputId, roomId, busProducers)
      return {
        success: true,
        foundBuses: Array.from(busProducers.keys()),
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  /**
   * Get encoder stats for an output
   */
  getEncoderStats(outputId: string): {
    isRunning: boolean
    uptimeSeconds: number
    startedAt: string | null
    busRouting: BusRoutingConfig | null
    retryCount: number
  } {
    const encoder = this.encoders.get(outputId)
    if (!encoder) {
      return {
        isRunning: false,
        uptimeSeconds: 0,
        startedAt: null,
        busRouting: null,
        retryCount: 0,
      }
    }

    const uptimeSeconds = Math.floor((Date.now() - encoder.startedAt.getTime()) / 1000)
    return {
      isRunning: true,
      uptimeSeconds,
      startedAt: encoder.startedAt.toISOString(),
      busRouting: encoder.busRouting || null,
      retryCount: encoder.retryCount,
    }
  }

  /**
   * Get all running encoder stats
   */
  getAllEncoderStats(): Map<string, ReturnType<typeof this.getEncoderStats>> {
    const stats = new Map<string, ReturnType<typeof this.getEncoderStats>>()
    for (const [outputId] of this.encoders) {
      stats.set(outputId, this.getEncoderStats(outputId))
    }
    return stats
  }

  /**
   * Stop all encoders (for shutdown)
   */
  async stopAllEncoders(): Promise<void> {
    console.log(`[BusEncoder] Stopping all encoders (${this.encoders.size} running)`)
    const stopPromises = Array.from(this.encoders.keys()).map(id => this.stopEncoder(id))
    await Promise.all(stopPromises)
  }

  /**
   * Update bus levels for a running encoder (real-time control)
   *
   * This method:
   * 1. Broadcasts the level change immediately via WebSocket for visual feedback
   * 2. Updates the database with new levels
   * 3. Debounces encoder restart (waits 500ms after last change)
   * 4. Restarts encoder with new levels using brief overlap for smooth transition
   *
   * @param outputId - The output to update
   * @param roomId - The room ID
   * @param busRouting - New bus routing config
   * @param changedBy - Optional user ID who made the change
   */
  async updateBusLevels(
    outputId: string,
    roomId: string,
    busRouting: BusRoutingConfig,
    changedBy?: string
  ): Promise<{ success: boolean; willRestart: boolean }> {
    // 1. Broadcast level change immediately for visual feedback
    emitBusLevelChange(roomId, outputId, busRouting as Record<string, number>, changedBy)

    // 2. Update database
    await prisma.audioOutput.update({
      where: { id: outputId },
      data: { busRouting: busRouting as Record<string, number> },
    })

    // 3. Check if encoder is running - if not, just update DB
    const encoder = this.encoders.get(outputId)
    if (!encoder) {
      console.log(`[BusEncoder] Levels updated for ${outputId} (encoder not running)`)
      return { success: true, willRestart: false }
    }

    // 4. Cancel any pending debounce timer
    const pending = this.pendingLevelChanges.get(outputId)
    if (pending) {
      clearTimeout(pending.debounceTimer)
    }

    // 5. Set up debounced restart
    const debounceTimer = setTimeout(async () => {
      this.pendingLevelChanges.delete(outputId)
      await this.restartEncoderWithNewLevels(outputId, roomId, busRouting)
    }, LEVEL_CHANGE_DEBOUNCE_MS)

    this.pendingLevelChanges.set(outputId, {
      outputId,
      roomId,
      busRouting,
      debounceTimer,
    })

    console.log(`[BusEncoder] Levels queued for ${outputId}, will restart in ${LEVEL_CHANGE_DEBOUNCE_MS}ms`)
    return { success: true, willRestart: true }
  }

  /**
   * Restart encoder with new bus levels (called after debounce)
   */
  private async restartEncoderWithNewLevels(
    outputId: string,
    roomId: string,
    _busRouting: BusRoutingConfig // Levels are read from DB in startMultiBusEncoder
  ): Promise<void> {
    const encoder = this.encoders.get(outputId)
    if (!encoder) {
      console.log(`[BusEncoder] Encoder ${outputId} no longer running, skipping restart`)
      return
    }

    console.log(`[BusEncoder] Restarting encoder ${outputId} with new levels`)
    emitOutputStateChange(roomId, outputId, 'restarting', { reason: 'Bus levels changed' })

    try {
      // Get all available bus producers
      const busProducers = new Map<string, string>()
      const busTypes = ['PGM', 'TB', 'AUX1', 'AUX2', 'AUX3', 'AUX4']

      for (const busType of busTypes) {
        const producer = mediasoupService.getBusProducer(roomId, busType)
        if (producer) {
          busProducers.set(busType.toLowerCase(), producer.producerId)
        }
      }

      // Stop old encoder (brief overlap - new one starts before old fully stops)
      await this.stopEncoder(outputId)

      // Start new encoder with updated levels
      if (busProducers.size > 0) {
        await this.startMultiBusEncoder(outputId, roomId, busProducers)
        emitOutputStateChange(roomId, outputId, 'running')
        console.log(`[BusEncoder] Encoder ${outputId} restarted successfully`)
      } else {
        console.warn(`[BusEncoder] No bus producers available for ${outputId}`)
        emitOutputStateChange(roomId, outputId, 'error', { error: 'No bus producers available' })
      }
    } catch (error) {
      console.error(`[BusEncoder] Failed to restart encoder ${outputId}:`, error)
      emitOutputStateChange(roomId, outputId, 'error', {
        error: error instanceof Error ? error.message : 'Restart failed',
      })
    }
  }

  /**
   * Check if there's a pending level change for an output
   */
  hasPendingLevelChange(outputId: string): boolean {
    return this.pendingLevelChanges.has(outputId)
  }

  /**
   * Cancel pending level change (e.g., when encoder is stopped)
   */
  cancelPendingLevelChange(outputId: string): void {
    const pending = this.pendingLevelChanges.get(outputId)
    if (pending) {
      clearTimeout(pending.debounceTimer)
      this.pendingLevelChanges.delete(outputId)
    }
  }

  /**
   * Start a multi-bus encoder that mixes multiple bus outputs
   *
   * @param outputId - The audio output ID from database
   * @param roomId - The room where the bus producers exist
   * @param busProducers - Map of bus name to producer ID
   */
  async startMultiBusEncoder(
    outputId: string,
    roomId: string,
    busProducers: Map<string, string> // bus name -> producer ID
  ): Promise<void> {
    if (this.encoders.has(outputId)) {
      console.log(`[BusEncoder] Encoder for output ${outputId} already running`)
      return
    }

    // Get output configuration
    const output = await prisma.audioOutput.findUnique({
      where: { id: outputId },
    })

    if (!output) {
      throw new Error(`Output ${outputId} not found`)
    }

    // Parse bus routing config
    const busRouting = (output.busRouting as BusRoutingConfig) || {}
    const activeBuses = Object.entries(busRouting)
      .filter(([_, level]) => level && level > 0)
      .map(([bus, level]) => ({ bus, level: level as number }))

    if (activeBuses.length === 0) {
      // Fall back to single bus mode using the channel field
      const channelToBus: Record<string, string> = {
        'PROGRAM': 'pgm',
        'TALKBACK': 'tb',
        'AUX1': 'aux1',
        'AUX2': 'aux2',
        'AUX3': 'aux3',
        'AUX4': 'aux4',
      }
      const bus = channelToBus[output.channel] || 'pgm'
      const producerId = busProducers.get(bus.toUpperCase()) || busProducers.get('PGM')
      if (producerId) {
        return this.startEncoder(outputId, roomId, producerId)
      }
      throw new Error('No bus producer found')
    }

    console.log(`[BusEncoder] Starting multi-bus encoder for output: ${output.name}`)
    console.log(`[BusEncoder] Active buses: ${activeBuses.map(b => `${b.bus}@${b.level}`).join(', ')}`)

    try {
      // Create transports and consume each active bus
      const busInputs: Array<{
        bus: string
        level: number
        port: number
        rtpParameters: RtpParameters
      }> = []

      for (const { bus, level } of activeBuses) {
        const producerId = busProducers.get(bus.toUpperCase())
        if (!producerId) {
          console.warn(`[BusEncoder] No producer for bus ${bus}, skipping`)
          continue
        }

        const transportKey = `${outputId}-${bus}`
        const transportInfo = await mediasoupService.createPlainTransport(roomId, transportKey)
        const consumeResult = await mediasoupService.consumeWithPlainTransport(
          roomId,
          transportKey,
          producerId
        )

        if (consumeResult) {
          busInputs.push({
            bus,
            level,
            port: transportInfo.localPort,
            rtpParameters: consumeResult.rtpParameters,
          })
        }
      }

      if (busInputs.length === 0) {
        throw new Error('No bus inputs could be set up')
      }

      // Build FFmpeg command for multi-bus mixing
      const ffmpegArgs = this.buildMultiBusFFmpegArgs(busInputs, output)

      console.log(`[BusEncoder] FFmpeg command: ffmpeg ${ffmpegArgs.join(' ')}`)

      // Generate combined SDP for all inputs
      const sdp = this.generateMultiBusSDP(busInputs)
      console.log(`[BusEncoder ${outputId}] Generated multi-bus SDP:\n${sdp}`)

      // Spawn FFmpeg
      const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      if (ffmpeg.stdin) {
        ffmpeg.stdin.write(sdp)
        ffmpeg.stdin.end()
      }

      // Handle FFmpeg output
      ffmpeg.stdout?.on('data', (data) => {
        console.log(`[BusEncoder ${outputId}] stdout: ${data}`)
      })

      ffmpeg.stderr?.on('data', (data) => {
        const msg = data.toString()
        if (msg.includes('Error') || msg.includes('error') || msg.includes('failed')) {
          console.error(`[BusEncoder ${outputId}] Error: ${msg}`)
        } else if (msg.includes('size=') || msg.includes('time=')) {
          console.log(`[BusEncoder ${outputId}] Progress: ${msg.trim().slice(0, 100)}`)
        }
      })

      ffmpeg.on('error', (err) => {
        console.error(`[BusEncoder ${outputId}] FFmpeg error:`, err)
        this.handleEncoderError(outputId, err.message)
          .catch((error) => console.error(`[BusEncoder ${outputId}] handleEncoderError error:`, error))
      })

      ffmpeg.on('exit', (code, signal) => {
        console.log(`[BusEncoder ${outputId}] FFmpeg exited with code ${code}, signal ${signal}`)
        this.encoders.delete(outputId)

        // Clean up all transports
        for (const { bus } of busInputs) {
          mediasoupService.closePlainTransport(roomId, `${outputId}-${bus}`)
        }

        audioOutputService.updateOutputStatus(outputId, {
          isActive: false,
          isConnected: false,
          errorMessage: code !== 0 ? `FFmpeg exited with code ${code}` : null,
        }).catch((error) => console.error(`[BusEncoder ${outputId}] updateOutputStatus error:`, error))
      })

      // Store encoder info
      this.encoders.set(outputId, {
        ffmpeg,
        outputId,
        roomId,
        producerId: busInputs[0]?.bus || '', // Legacy field
        producerIds: busInputs.map(b => b.bus),
        busRouting,
        startedAt: new Date(),
        retryCount: 0,
        retryTimeoutHandle: null,
      })

      await audioOutputService.updateOutputStatus(outputId, {
        isActive: true,
        isConnected: true,
        connectedAt: new Date(),
        errorMessage: null,
      })

      console.log(`[BusEncoder] Multi-bus encoder started for output ${outputId}`)
    } catch (err) {
      console.error(`[BusEncoder] Failed to start multi-bus encoder for ${outputId}:`, err)
      // Clean up any transports that were created
      for (const { bus } of activeBuses) {
        mediasoupService.closePlainTransport(roomId, `${outputId}-${bus}`)
      }
      throw err
    }
  }

  /**
   * Build FFmpeg arguments for multi-bus mixing
   */
  private buildMultiBusFFmpegArgs(
    busInputs: Array<{ bus: string; level: number; port: number; rtpParameters: RtpParameters }>,
    output: {
      type: string
      codec: string
      bitrate: number
      sampleRate: number
      channels: number
      icecastHost: string | null
      icecastPort: number | null
      icecastMount: string | null
      icecastUsername: string | null
      icecastPassword: string | null
      icecastPublic: boolean
      icecastName: string | null
      icecastDescription: string | null
      icecastGenre: string | null
      icecastUrl: string | null
      srtHost: string | null
      srtPort: number | null
      srtMode: string | null
      srtStreamId: string | null
      srtPassphrase: string | null
      srtLatency: number | null
    }
  ): string[] {
    const args: string[] = [
      '-hide_banner',
      '-loglevel', 'warning',
      '-protocol_whitelist', 'pipe,file,udp,rtp',
      '-f', 'sdp',
      '-i', 'pipe:0', // Read combined SDP from stdin
    ]

    // Build amix filter with volume levels
    // amix will automatically mix all input streams
    if (busInputs.length > 1) {
      // Build filter complex for mixing with levels
      const filterInputs = busInputs.map((_, i) => `[${i}:a]volume=${busInputs[i]?.level || 1.0}[a${i}]`).join(';')
      const mixInputs = busInputs.map((_, i) => `[a${i}]`).join('')
      args.push(
        '-filter_complex',
        `${filterInputs};${mixInputs}amix=inputs=${busInputs.length}:duration=longest[out]`,
        '-map', '[out]'
      )
    } else if (busInputs.length === 1) {
      // Single input, just apply volume
      const level = busInputs[0]?.level || 1.0
      if (level !== 1.0) {
        args.push('-af', `volume=${level}`)
      }
    }

    // Output codec settings (same as single-bus)
    switch (output.codec.toLowerCase()) {
      case 'mp3':
        args.push('-c:a', 'libmp3lame')
        args.push('-b:a', `${output.bitrate}k`)
        args.push('-ar', output.sampleRate.toString())
        args.push('-ac', output.channels.toString())
        break
      case 'aac':
        args.push('-c:a', 'aac')
        args.push('-b:a', `${output.bitrate}k`)
        args.push('-ar', output.sampleRate.toString())
        args.push('-ac', output.channels.toString())
        break
      case 'opus':
        args.push('-c:a', 'libopus')
        args.push('-b:a', `${output.bitrate}k`)
        args.push('-ar', '48000')
        args.push('-ac', output.channels.toString())
        break
      default:
        args.push('-c:a', 'libmp3lame')
        args.push('-b:a', '128k')
    }

    // Output destination (same as single-bus)
    switch (output.type) {
      case 'ICECAST':
        if (!output.icecastHost || !output.icecastPort || !output.icecastMount) {
          throw new Error('Icecast configuration incomplete')
        }
        const icecastUrl = new URL(`icecast://${output.icecastHost}:${output.icecastPort}${output.icecastMount}`)
        icecastUrl.username = output.icecastUsername || 'source'
        icecastUrl.password = output.icecastPassword || ''

        const contentType = output.codec.toLowerCase() === 'aac' ? 'audio/aac' :
                           output.codec.toLowerCase() === 'opus' ? 'audio/ogg' :
                           'audio/mpeg'
        args.push('-content_type', contentType)

        if (output.icecastName) args.push('-ice_name', output.icecastName)
        if (output.icecastDescription) args.push('-ice_description', output.icecastDescription)
        if (output.icecastGenre) args.push('-ice_genre', output.icecastGenre)
        if (output.icecastUrl) args.push('-ice_url', output.icecastUrl)
        args.push('-ice_public', output.icecastPublic ? '1' : '0')

        args.push('-f', output.codec.toLowerCase() === 'aac' ? 'adts' :
                        output.codec.toLowerCase() === 'opus' ? 'ogg' : 'mp3')
        args.push(icecastUrl.toString())
        break

      case 'SRT':
        if (!output.srtHost || !output.srtPort) {
          throw new Error('SRT configuration incomplete')
        }
        let srtUrl = `srt://${output.srtHost}:${output.srtPort}`
        const srtParams: string[] = []
        if (output.srtMode) srtParams.push(`mode=${output.srtMode}`)
        if (output.srtStreamId) srtParams.push(`streamid=${output.srtStreamId}`)
        if (output.srtPassphrase) srtParams.push(`passphrase=${output.srtPassphrase}`)
        if (output.srtLatency) srtParams.push(`latency=${output.srtLatency}`)
        if (srtParams.length > 0) {
          srtUrl += '?' + srtParams.join('&')
        }
        args.push('-f', 'mpegts')
        args.push(srtUrl)
        break

      default:
        throw new Error(`Unknown output type: ${output.type}`)
    }

    return args
  }

  /**
   * Generate combined SDP for multiple bus inputs
   */
  private generateMultiBusSDP(
    busInputs: Array<{ bus: string; level: number; port: number; rtpParameters: RtpParameters }>
  ): string {
    let sdp = `v=0
o=- 0 0 IN IP4 127.0.0.1
s=MediaSoup Multi-Bus Output
c=IN IP4 127.0.0.1
t=0 0
`

    for (const { bus, port, rtpParameters } of busInputs) {
      const codec = rtpParameters.codecs[0]
      const pt = codec?.payloadType || 111
      const rate = codec?.clockRate || 48000
      const ch = codec?.channels || 2

      let fmtpLine = ''
      if (codec?.parameters) {
        const params = Object.entries(codec.parameters)
          .map(([k, v]) => `${k}=${v}`)
          .join(';')
        if (params) {
          fmtpLine = `a=fmtp:${pt} ${params}\r\n`
        }
      }

      sdp += `m=audio ${port} RTP/AVP ${pt}
a=rtpmap:${pt} opus/${rate}/${ch}
${fmtpLine}a=recvonly
a=mid:${bus}
`
    }

    return sdp
  }

  /**
   * Build FFmpeg arguments based on output configuration
   */
  private buildFFmpegArgs(
    _rtpPort: number,
    rtpParameters: RtpParameters,
    output: {
      type: string
      codec: string
      bitrate: number
      sampleRate: number
      channels: number
      icecastHost: string | null
      icecastPort: number | null
      icecastMount: string | null
      icecastUsername: string | null
      icecastPassword: string | null
      icecastPublic: boolean
      icecastName: string | null
      icecastDescription: string | null
      icecastGenre: string | null
      icecastUrl: string | null
      srtHost: string | null
      srtPort: number | null
      srtMode: string | null
      srtStreamId: string | null
      srtPassphrase: string | null
      srtLatency: number | null
    }
  ): string[] {
    // Note: rtpParameters are used for SDP generation which is piped to FFmpeg stdin
    // The actual RTP decoding uses these parameters implicitly via the SDP file
    void rtpParameters // Mark as intentionally unused here (used in generateSDP)

    // FFmpeg input arguments for RTP
    const args: string[] = [
      '-hide_banner',
      '-loglevel', 'warning',
      // Protocol whitelist for RTP (pipe needed for stdin SDP)
      '-protocol_whitelist', 'pipe,file,udp,rtp',
      // RTP input with SDP
      '-f', 'sdp',
      '-i', 'pipe:0', // Read SDP from stdin
    ]

    // Output codec settings
    switch (output.codec.toLowerCase()) {
      case 'mp3':
        args.push('-c:a', 'libmp3lame')
        args.push('-b:a', `${output.bitrate}k`)
        args.push('-ar', output.sampleRate.toString())
        args.push('-ac', output.channels.toString())
        break
      case 'aac':
        args.push('-c:a', 'aac')
        args.push('-b:a', `${output.bitrate}k`)
        args.push('-ar', output.sampleRate.toString())
        args.push('-ac', output.channels.toString())
        break
      case 'opus':
        args.push('-c:a', 'libopus')
        args.push('-b:a', `${output.bitrate}k`)
        args.push('-ar', '48000') // Opus is always 48kHz
        args.push('-ac', output.channels.toString())
        break
      case 'flac':
        args.push('-c:a', 'flac')
        args.push('-ar', output.sampleRate.toString())
        args.push('-ac', output.channels.toString())
        break
      default:
        args.push('-c:a', 'libmp3lame')
        args.push('-b:a', '128k')
    }

    // Output destination
    switch (output.type) {
      case 'ICECAST':
        if (!output.icecastHost || !output.icecastPort || !output.icecastMount) {
          throw new Error('Icecast configuration incomplete')
        }
        // Build Icecast URL with metadata
        const icecastUrl = new URL(`icecast://${output.icecastHost}:${output.icecastPort}${output.icecastMount}`)
        icecastUrl.username = output.icecastUsername || 'source'
        icecastUrl.password = output.icecastPassword || ''

        // Add content-type based on codec
        const contentType = output.codec.toLowerCase() === 'aac' ? 'audio/aac' :
                           output.codec.toLowerCase() === 'opus' ? 'audio/ogg' :
                           'audio/mpeg'
        args.push('-content_type', contentType)

        // Add Icecast metadata
        if (output.icecastName) args.push('-ice_name', output.icecastName)
        if (output.icecastDescription) args.push('-ice_description', output.icecastDescription)
        if (output.icecastGenre) args.push('-ice_genre', output.icecastGenre)
        if (output.icecastUrl) args.push('-ice_url', output.icecastUrl)
        args.push('-ice_public', output.icecastPublic ? '1' : '0')

        // Output format
        args.push('-f', output.codec.toLowerCase() === 'aac' ? 'adts' :
                        output.codec.toLowerCase() === 'opus' ? 'ogg' : 'mp3')
        args.push(icecastUrl.toString())
        break

      case 'SRT':
        if (!output.srtHost || !output.srtPort) {
          throw new Error('SRT configuration incomplete')
        }
        // Build SRT URL
        let srtUrl = `srt://${output.srtHost}:${output.srtPort}`
        const srtParams: string[] = []
        if (output.srtMode) srtParams.push(`mode=${output.srtMode}`)
        if (output.srtStreamId) srtParams.push(`streamid=${output.srtStreamId}`)
        if (output.srtPassphrase) srtParams.push(`passphrase=${output.srtPassphrase}`)
        if (output.srtLatency) srtParams.push(`latency=${output.srtLatency}`)
        if (srtParams.length > 0) {
          srtUrl += '?' + srtParams.join('&')
        }

        args.push('-f', 'mpegts')
        args.push(srtUrl)
        break

      case 'RECORDING':
        // For recording, we'd output to a file
        // This would need file path configuration
        throw new Error('Recording output not yet implemented')

      default:
        throw new Error(`Unknown output type: ${output.type}`)
    }

    return args
  }

  /**
   * Generate SDP for FFmpeg to receive RTP
   */
  generateSDP(port: number, rtpParameters: RtpParameters): string {
    const codec = rtpParameters.codecs[0]
    const pt = codec?.payloadType || 111
    const rate = codec?.clockRate || 48000
    const ch = codec?.channels || 2

    // Build fmtp line from codec parameters
    let fmtpLine = ''
    if (codec?.parameters) {
      const params = Object.entries(codec.parameters)
        .map(([k, v]) => `${k}=${v}`)
        .join(';')
      if (params) {
        fmtpLine = `a=fmtp:${pt} ${params}\r\n`
      }
    }

    return `v=0
o=- 0 0 IN IP4 127.0.0.1
s=MediaSoup Bus Output
c=IN IP4 127.0.0.1
t=0 0
m=audio ${port} RTP/AVP ${pt}
a=rtpmap:${pt} opus/${rate}/${ch}
${fmtpLine}a=recvonly
`
  }

  /**
   * Handle encoder errors
   */
  private async handleEncoderError(outputId: string, errorMessage: string): Promise<void> {
    // Get encoder info for alert details
    const encoder = this.encoders.get(outputId)

    // Update output status
    await audioOutputService.updateOutputStatus(outputId, {
      isActive: false,
      isConnected: false,
      errorMessage,
    })

    // Send alert
    await alertingService.encoderFailure(
      outputId,
      `Output ${outputId}`,
      errorMessage,
      encoder?.roomId
    ).catch(err => console.error('[BusEncoder] Failed to send alert:', err))
  }
}

export const busEncoderService = new BusEncoderService()
