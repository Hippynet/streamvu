/**
 * RIST Ingest Service
 *
 * Handles FFmpeg-based ingestion of RIST (Reliable Internet Stream Transport) input streams.
 * RIST is an alternative to SRT that is mandated by some broadcasters.
 *
 * Supports:
 * - Simple Profile (basic, widely compatible)
 * - Main Profile (advanced features like FEC)
 *
 * RIST Spec: https://www.rist.tv/
 */

import { spawn, ChildProcess } from 'child_process'
import { mediasoupService } from './mediasoup.service.js'
import { audioSourceService } from './audioSource.service.js'
import { emitSourceProducerNew, emitRISTSourceStateChange } from '../socket/callCenter.js'
import { prisma } from '../lib/prisma.js'
import { PlaybackState } from '@streamvu/shared'
import net from 'net'

// RIST connection state (mirroring SRT)
export enum RISTConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  LISTENING = 'LISTENING',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR',
}

// RIST profile
export enum RISTProfile {
  SIMPLE = 'SIMPLE', // Basic, widely compatible
  MAIN = 'MAIN', // Advanced features
}

interface RISTIngestProcess {
  ffmpeg: ChildProcess
  sourceId: string
  roomId: string
  producerId: string | null
  allocatedPort: number | null
  startedAt: Date
  profile: RISTProfile
  timeoutHandle: NodeJS.Timeout | null
  lastProgressAt: Date
}

interface PortAllocation {
  port: number
  sourceId: string
}

/**
 * RIST Ingest Service
 *
 * Handles FFmpeg-based ingestion of RIST input streams.
 * Audio is decoded and injected into the mediasoup room as a producer.
 */
class RISTIngestService {
  private ingestProcesses: Map<string, RISTIngestProcess> = new Map()
  private allocatedPorts: Map<number, PortAllocation> = new Map()

  // Port range for RIST listener mode (configurable via env)
  private readonly RIST_PORT_MIN = parseInt(process.env.RIST_INGEST_PORT_MIN || '31000')
  private readonly RIST_PORT_MAX = parseInt(process.env.RIST_INGEST_PORT_MAX || '31999')

  // FFmpeg timeout settings (in seconds)
  private readonly CONNECTION_TIMEOUT = parseInt(process.env.FFMPEG_CONNECTION_TIMEOUT || '30')
  private readonly PROGRESS_TIMEOUT = parseInt(process.env.FFMPEG_PROGRESS_TIMEOUT || '15')

  private startTimeoutWatcher(sourceId: string): NodeJS.Timeout | null {
    // Verify process exists before starting watcher to prevent orphan intervals
    const process = this.ingestProcesses.get(sourceId)
    if (!process) {
      console.warn(`[RISTIngest ${sourceId}] Cannot start timeout watcher - process not found`)
      return null
    }

    const checkInterval = 5000
    const handle = setInterval(() => {
      const proc = this.ingestProcesses.get(sourceId)
      if (!proc) {
        clearInterval(handle)
        return
      }
      const secondsSinceProgress = (Date.now() - proc.lastProgressAt.getTime()) / 1000
      const timeoutSeconds = proc.producerId ? this.PROGRESS_TIMEOUT : this.CONNECTION_TIMEOUT
      if (secondsSinceProgress > timeoutSeconds) {
        console.error(`[RISTIngest ${sourceId}] Timeout: no progress for ${secondsSinceProgress.toFixed(1)}s`)
        clearInterval(handle)
        this.handleError(sourceId, `FFmpeg timeout: no progress for ${Math.floor(secondsSinceProgress)} seconds`)
          .catch((err) => console.error(`[RISTIngest ${sourceId}] handleError in timeout error:`, err))
        proc.ffmpeg.kill('SIGKILL')
      }
    }, checkInterval)

    // Store the handle immediately - process is guaranteed to exist
    process.timeoutHandle = handle
    return handle
  }

  private resetProgressTimeout(sourceId: string): void {
    const process = this.ingestProcesses.get(sourceId)
    if (process) process.lastProgressAt = new Date()
  }

  /**
   * Start RIST ingest for a source
   */
  async startIngest(sourceId: string): Promise<void> {
    if (this.ingestProcesses.has(sourceId)) {
      console.log(`[RISTIngest] Ingest for source ${sourceId} already running`)
      return
    }

    const source = await prisma.audioSource.findUnique({
      where: { id: sourceId },
      include: { room: true },
    })

    if (!source || source.type !== 'RIST_STREAM') {
      throw new Error('Invalid RIST source')
    }

    const roomId = source.roomId
    let allocatedPort: number | null = null
    const profile = (source.ristProfile as RISTProfile) || RISTProfile.SIMPLE

    console.log(`[RISTIngest] Starting ingest for source ${source.name} (profile: ${profile})`)

    // For listener mode, allocate a port
    if (source.ristMode === 'LISTENER') {
      allocatedPort = await this.allocatePort(sourceId)
      console.log(`[RISTIngest] Allocated listener port ${allocatedPort} for source ${sourceId}`)

      // Update source with allocated port and set to LISTENING state
      await prisma.audioSource.update({
        where: { id: sourceId },
        data: {
          ristListenerPort: allocatedPort,
          ristConnectionState: RISTConnectionState.LISTENING,
        },
      })

      // Emit socket event for UI update
      emitRISTSourceStateChange(roomId, sourceId, {
        connectionState: RISTConnectionState.LISTENING,
        listenerPort: allocatedPort,
      })
    } else {
      // For caller mode, validate URL
      if (!source.ristUrl) {
        throw new Error('RIST URL required for caller mode')
      }

      await prisma.audioSource.update({
        where: { id: sourceId },
        data: { ristConnectionState: RISTConnectionState.CONNECTING },
      })

      // Emit socket event for UI update
      emitRISTSourceStateChange(roomId, sourceId, {
        connectionState: RISTConnectionState.CONNECTING,
      })
    }

    try {
      // Create plain transport for producing to mediasoup
      const transportInfo = await mediasoupService.createPlainTransportForProducer(
        roomId,
        sourceId
      )

      // Build FFmpeg command
      const ffmpegArgs = this.buildFFmpegArgs(source, transportInfo, allocatedPort)

      console.log(`[RISTIngest] Starting FFmpeg: ffmpeg ${ffmpegArgs.join(' ')}`)

      const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      // Handle FFmpeg output
      let connected = false

      ffmpeg.stderr?.on('data', (data) => {
        const msg = data.toString()

        // Detect successful connection
        if (!connected && (msg.includes('Output #0') || msg.includes('size='))) {
          connected = true
          this.handleConnected(sourceId, source.ristMode === 'LISTENER' ? null : source.ristUrl)
            .catch((err) => console.error(`[RISTIngest ${sourceId}] handleConnected error:`, err))
        }

        // Log progress occasionally
        if (msg.includes('Error') || msg.includes('error') || msg.includes('failed')) {
          console.error(`[RISTIngest ${sourceId}] Error: ${msg}`)
        } else if (msg.includes('size=') || msg.includes('time=')) {
          // Reset timeout on progress
          this.resetProgressTimeout(sourceId)
          // Progress output - only log occasionally to avoid spam
          if (Math.random() < 0.1) {
            console.log(`[RISTIngest ${sourceId}] Progress: ${msg.trim().slice(0, 80)}`)
          }
        }
      })

      ffmpeg.on('error', (err) => {
        console.error(`[RISTIngest ${sourceId}] FFmpeg error:`, err)
        this.handleError(sourceId, err.message)
          .catch((error) => console.error(`[RISTIngest ${sourceId}] handleError error:`, error))
      })

      ffmpeg.on('exit', (code, signal) => {
        console.log(`[RISTIngest ${sourceId}] FFmpeg exited with code ${code}, signal ${signal}`)
        this.cleanup(sourceId)
          .catch((error) => console.error(`[RISTIngest ${sourceId}] cleanup error:`, error))
      })

      // Store process info
      this.ingestProcesses.set(sourceId, {
        ffmpeg,
        sourceId,
        roomId,
        producerId: null, // Will be set after transport connect
        allocatedPort,
        startedAt: new Date(),
        profile,
        timeoutHandle: null,
        lastProgressAt: new Date(),
      })

      // Start timeout watcher
      this.startTimeoutWatcher(sourceId)

      // Create producer on the plain transport
      const producerId = await mediasoupService.createProducerOnPlainTransport(
        roomId,
        sourceId,
        transportInfo.rtpPort
      )

      // Update process with producer ID
      const process = this.ingestProcesses.get(sourceId)
      if (process) {
        process.producerId = producerId
      }

      // Emit socket event so other participants can consume this source
      emitSourceProducerNew(roomId, sourceId, producerId, source.name)

      // Update source state
      await audioSourceService.updateSourceState(sourceId, {
        isActive: true,
        playbackState: PlaybackState.PLAYING,
        errorMessage: null,
      })

      console.log(`[RISTIngest] Started ingest for source ${sourceId} (producer: ${producerId})`)
    } catch (err) {
      console.error(`[RISTIngest] Failed to start ingest for ${sourceId}:`, err)
      await this.cleanup(sourceId)
      throw err
    }
  }

  /**
   * Stop RIST ingest
   */
  async stopIngest(sourceId: string): Promise<void> {
    const process = this.ingestProcesses.get(sourceId)
    if (!process) {
      console.log(`[RISTIngest] No ingest found for source ${sourceId}`)
      return
    }

    console.log(`[RISTIngest] Stopping ingest for source ${sourceId}`)

    // Kill FFmpeg gracefully
    process.ffmpeg.kill('SIGTERM')
    await new Promise(resolve => setTimeout(resolve, 1000))
    if (!process.ffmpeg.killed) {
      process.ffmpeg.kill('SIGKILL')
    }

    await this.cleanup(sourceId)
  }

  /**
   * Allocate an available port for RIST listener
   */
  private async allocatePort(sourceId: string): Promise<number> {
    for (let port = this.RIST_PORT_MIN; port <= this.RIST_PORT_MAX; port++) {
      if (!this.allocatedPorts.has(port)) {
        // Check if port is actually available at OS level
        const isAvailable = await this.checkPortAvailable(port)
        if (isAvailable) {
          this.allocatedPorts.set(port, { port, sourceId })
          return port
        }
      }
    }
    throw new Error('No available ports for RIST listener')
  }

  private releasePort(sourceId: string): void {
    for (const [port, allocation] of this.allocatedPorts) {
      if (allocation.sourceId === sourceId) {
        this.allocatedPorts.delete(port)
        console.log(`[RISTIngest] Released port ${port}`)
        return
      }
    }
  }

  private checkPortAvailable(port: number): Promise<boolean> {
    return new Promise(resolve => {
      const server = net.createServer()
      server.once('error', () => resolve(false))
      server.once('listening', () => {
        server.close()
        resolve(true)
      })
      server.listen(port, '0.0.0.0')
    })
  }

  /**
   * Build FFmpeg arguments for RIST input to RTP output
   */
  private buildFFmpegArgs(
    source: {
      ristMode: string | null
      ristUrl: string | null
      ristProfile: string | null
      ristBuffer: number | null
      ristBandwidth: number | null
    },
    transportInfo: { rtpPort: number; rtcpPort: number },
    allocatedPort: number | null
  ): string[] {
    // Build RIST input URL
    // RIST uses rist:// protocol in FFmpeg
    let ristUrl: string
    const ristParams: string[] = []

    if (source.ristMode === 'LISTENER') {
      // Listener mode - bind and wait for incoming connection
      ristUrl = `rist://@0.0.0.0:${allocatedPort}`
    } else {
      // Caller mode - connect to remote RIST endpoint
      // source.ristUrl should be like "rist://host:port"
      ristUrl = source.ristUrl || ''
    }

    // Add RIST parameters
    // Buffer size in ms (default: 1000)
    if (source.ristBuffer) {
      ristParams.push(`buffer_size=${source.ristBuffer}`)
    }

    // Bandwidth limit in kbps
    if (source.ristBandwidth) {
      ristParams.push(`bandwidth=${source.ristBandwidth}`)
    }

    // Profile (0=simple, 1=main)
    if (source.ristProfile === 'MAIN') {
      ristParams.push('profile=1')
    } else {
      ristParams.push('profile=0')
    }

    if (ristParams.length > 0) {
      ristUrl += '?' + ristParams.join('&')
    }

    const args: string[] = [
      '-hide_banner',
      '-loglevel', 'info',

      // RIST input
      '-i', ristUrl,

      // Audio processing - decode to Opus for mediasoup
      '-vn', // No video
      '-acodec', 'libopus',
      '-ar', '48000',
      '-ac', '2',
      '-b:a', '128k',

      // RTP output to mediasoup plain transport
      '-f', 'rtp',
      '-payload_type', '111', // Match mediasoup Opus payload type
      `rtp://127.0.0.1:${transportInfo.rtpPort}?rtcpport=${transportInfo.rtcpPort}`,
    ]

    return args
  }

  private async handleConnected(sourceId: string, remoteAddress: string | null): Promise<void> {
    const process = this.ingestProcesses.get(sourceId)
    if (!process) return

    console.log(`[RISTIngest] Source ${sourceId} connected${remoteAddress ? ` from ${remoteAddress}` : ''}`)

    await prisma.audioSource.update({
      where: { id: sourceId },
      data: {
        ristConnectionState: RISTConnectionState.CONNECTED,
        ristRemoteAddress: remoteAddress,
      },
    })

    // Emit socket event for UI update
    emitRISTSourceStateChange(process.roomId, sourceId, {
      connectionState: RISTConnectionState.CONNECTED,
      remoteAddress,
      listenerPort: process.allocatedPort,
    })
  }

  private async handleError(sourceId: string, error: string): Promise<void> {
    const process = this.ingestProcesses.get(sourceId)
    console.error(`[RISTIngest] Source ${sourceId} error: ${error}`)

    await audioSourceService.updateSourceState(sourceId, {
      playbackState: PlaybackState.ERROR,
      errorMessage: error,
      isActive: false,
    })

    await prisma.audioSource.update({
      where: { id: sourceId },
      data: { ristConnectionState: RISTConnectionState.ERROR },
    })

    // Emit socket event for UI update
    if (process) {
      emitRISTSourceStateChange(process.roomId, sourceId, {
        connectionState: RISTConnectionState.ERROR,
        errorMessage: error,
      })
    }
  }

  private async cleanup(sourceId: string): Promise<void> {
    const process = this.ingestProcesses.get(sourceId)
    if (!process) return

    console.log(`[RISTIngest] Cleaning up source ${sourceId}`)

    // Clear timeout watcher
    if (process.timeoutHandle) {
      clearInterval(process.timeoutHandle)
    }

    // Capture roomId before deleting process
    const roomId = process.roomId

    // Release allocated port
    this.releasePort(sourceId)

    // Close mediasoup transport
    mediasoupService.closePlainProducerTransport(roomId, sourceId)

    // Update database
    await prisma.audioSource.update({
      where: { id: sourceId },
      data: {
        ristConnectionState: RISTConnectionState.DISCONNECTED,
        ristListenerPort: null,
        ristRemoteAddress: null,
      },
    })

    await audioSourceService.updateSourceState(sourceId, {
      isActive: false,
      playbackState: PlaybackState.STOPPED,
    })

    this.ingestProcesses.delete(sourceId)

    // Emit socket event for UI update
    emitRISTSourceStateChange(roomId, sourceId, {
      connectionState: RISTConnectionState.DISCONNECTED,
    })
  }

  /**
   * Get status of an ingest process
   */
  getStatus(sourceId: string): { running: boolean; startedAt?: Date; profile?: RISTProfile } {
    const process = this.ingestProcesses.get(sourceId)
    if (!process) {
      return { running: false }
    }
    return {
      running: true,
      startedAt: process.startedAt,
      profile: process.profile,
    }
  }

  /**
   * Get all running ingests
   */
  getAllRunning(): string[] {
    return Array.from(this.ingestProcesses.keys())
  }

  /**
   * Get connection info for a RIST source (for UI display)
   */
  async getConnectionInfo(sourceId: string): Promise<{
    mode: 'LISTENER' | 'CALLER'
    profile: string
    listenerPort: number | null
    ristUrl: string | null
    connectionState: string
    remoteAddress: string | null
  } | null> {
    const source = await prisma.audioSource.findUnique({
      where: { id: sourceId },
    })

    if (!source || source.type !== 'RIST_STREAM') {
      return null
    }

    return {
      mode: source.ristMode as 'LISTENER' | 'CALLER',
      profile: source.ristProfile || 'SIMPLE',
      listenerPort: source.ristListenerPort,
      ristUrl: source.ristUrl,
      connectionState: source.ristConnectionState || 'DISCONNECTED',
      remoteAddress: source.ristRemoteAddress,
    }
  }
}

export const ristIngestService = new RISTIngestService()
export default ristIngestService
