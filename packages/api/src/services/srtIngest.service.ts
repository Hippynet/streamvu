import { spawn, ChildProcess } from 'child_process'
import { mediasoupService } from './mediasoup.service.js'
import { audioSourceService } from './audioSource.service.js'
import { emitSourceProducerNew, emitSRTSourceStateChange } from '../socket/callCenter.js'
import { prisma } from '../lib/prisma.js'
import { SRTConnectionState, PlaybackState } from '@streamvu/shared'
import net from 'net'

interface SRTIngestProcess {
  ffmpeg: ChildProcess
  sourceId: string
  roomId: string
  producerId: string | null
  allocatedPort: number | null
  startedAt: Date
  mode: 'CALLER' | 'LISTENER'
  timeoutHandle: NodeJS.Timeout | null
  lastProgressAt: Date
}

interface PortAllocation {
  port: number
  sourceId: string
}

/**
 * SRT Ingest Service
 *
 * Handles FFmpeg-based ingestion of SRT input streams.
 * Supports both CALLER (connect to remote) and LISTENER (wait for connection) modes.
 * Audio is decoded and injected into the mediasoup room as a producer.
 */
class SRTIngestService {
  private ingestProcesses: Map<string, SRTIngestProcess> = new Map()
  private allocatedPorts: Map<number, PortAllocation> = new Map()

  // Port range for SRT listener mode (configurable via env)
  private readonly SRT_PORT_MIN = parseInt(process.env.SRT_INGEST_PORT_MIN || '30000')
  private readonly SRT_PORT_MAX = parseInt(process.env.SRT_INGEST_PORT_MAX || '30999')

  // FFmpeg timeout settings (in seconds)
  // Connection timeout: how long to wait for initial connection
  private readonly CONNECTION_TIMEOUT = parseInt(process.env.FFMPEG_CONNECTION_TIMEOUT || '30')
  // Progress timeout: how long to wait between progress updates before considering stream dead
  private readonly PROGRESS_TIMEOUT = parseInt(process.env.FFMPEG_PROGRESS_TIMEOUT || '15')

  /**
   * Start the timeout watcher for an FFmpeg process
   * Returns the interval handle so caller can ensure cleanup
   */
  private startTimeoutWatcher(sourceId: string): NodeJS.Timeout | null {
    // Verify process exists before starting watcher to prevent orphan intervals
    const process = this.ingestProcesses.get(sourceId)
    if (!process) {
      console.warn(`[SRTIngest ${sourceId}] Cannot start timeout watcher - process not found`)
      return null
    }

    const checkInterval = 5000 // Check every 5 seconds

    const handle = setInterval(() => {
      const proc = this.ingestProcesses.get(sourceId)
      if (!proc) {
        clearInterval(handle)
        return
      }

      const now = new Date()
      const secondsSinceProgress = (now.getTime() - proc.lastProgressAt.getTime()) / 1000

      // Use connection timeout if not connected yet, otherwise use progress timeout
      const timeoutSeconds = proc.producerId ? this.PROGRESS_TIMEOUT : this.CONNECTION_TIMEOUT

      if (secondsSinceProgress > timeoutSeconds) {
        console.error(`[SRTIngest ${sourceId}] Timeout: no progress for ${secondsSinceProgress.toFixed(1)}s (limit: ${timeoutSeconds}s)`)
        clearInterval(handle)
        this.handleError(sourceId, `FFmpeg timeout: no progress for ${Math.floor(secondsSinceProgress)} seconds`)
          .catch((err) => console.error(`[SRTIngest ${sourceId}] handleError in timeout error:`, err))
        // Kill the FFmpeg process
        proc.ffmpeg.kill('SIGKILL')
      }
    }, checkInterval)

    // Store the handle immediately - process is guaranteed to exist
    process.timeoutHandle = handle
    return handle
  }

  /**
   * Reset the progress timestamp (called when FFmpeg reports progress)
   */
  private resetProgressTimeout(sourceId: string): void {
    const process = this.ingestProcesses.get(sourceId)
    if (process) {
      process.lastProgressAt = new Date()
    }
  }

  /**
   * Start SRT ingest for a source
   */
  async startIngest(sourceId: string): Promise<void> {
    if (this.ingestProcesses.has(sourceId)) {
      console.log(`[SRTIngest] Ingest for source ${sourceId} already running`)
      return
    }

    const source = await prisma.audioSource.findUnique({
      where: { id: sourceId },
      include: { room: true },
    })

    if (!source || source.type !== 'SRT_STREAM') {
      throw new Error('Invalid SRT source')
    }

    const roomId = source.roomId
    let allocatedPort: number | null = null

    console.log(`[SRTIngest] Starting ingest for source ${source.name} (mode: ${source.srtMode})`)

    // For LISTENER mode, allocate a port
    if (source.srtMode === 'LISTENER') {
      allocatedPort = await this.allocatePort(sourceId)
      console.log(`[SRTIngest] Allocated listener port ${allocatedPort} for source ${sourceId}`)

      // Update source with allocated port and set to LISTENING state
      await prisma.audioSource.update({
        where: { id: sourceId },
        data: {
          srtListenerPort: allocatedPort,
          srtConnectionState: SRTConnectionState.LISTENING,
        },
      })

      // Emit socket event for UI update
      emitSRTSourceStateChange(roomId, sourceId, {
        connectionState: SRTConnectionState.LISTENING,
        listenerPort: allocatedPort,
      })
    } else {
      // For CALLER mode, validate host/port
      if (!source.srtHost || !source.srtPort) {
        throw new Error('SRT host and port required for CALLER mode')
      }

      await prisma.audioSource.update({
        where: { id: sourceId },
        data: { srtConnectionState: SRTConnectionState.CONNECTING },
      })

      // Emit socket event for UI update
      emitSRTSourceStateChange(roomId, sourceId, {
        connectionState: SRTConnectionState.CONNECTING,
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

      console.log(`[SRTIngest] Starting FFmpeg: ffmpeg ${ffmpegArgs.join(' ')}`)

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
          this.handleConnected(sourceId, source.srtMode === 'LISTENER' ? null : source.srtHost)
            .catch((err) => console.error(`[SRTIngest ${sourceId}] handleConnected error:`, err))
        }

        // Log progress occasionally
        if (msg.includes('Error') || msg.includes('error') || msg.includes('failed')) {
          console.error(`[SRTIngest ${sourceId}] Error: ${msg}`)
        } else if (msg.includes('size=') || msg.includes('time=')) {
          // Reset timeout on progress
          this.resetProgressTimeout(sourceId)
          // Progress output - only log occasionally to avoid spam
          if (Math.random() < 0.1) {
            console.log(`[SRTIngest ${sourceId}] Progress: ${msg.trim().slice(0, 80)}`)
          }
        }
      })

      ffmpeg.on('error', (err) => {
        console.error(`[SRTIngest ${sourceId}] FFmpeg error:`, err)
        this.handleError(sourceId, err.message)
          .catch((error) => console.error(`[SRTIngest ${sourceId}] handleError error:`, error))
      })

      ffmpeg.on('exit', (code, signal) => {
        console.log(`[SRTIngest ${sourceId}] FFmpeg exited with code ${code}, signal ${signal}`)
        this.cleanup(sourceId)
          .catch((error) => console.error(`[SRTIngest ${sourceId}] cleanup error:`, error))
      })

      // Store process info
      this.ingestProcesses.set(sourceId, {
        ffmpeg,
        sourceId,
        roomId,
        producerId: null, // Will be set after transport connect
        allocatedPort,
        startedAt: new Date(),
        mode: source.srtMode as 'CALLER' | 'LISTENER',
        timeoutHandle: null,
        lastProgressAt: new Date(),
      })

      // Start timeout watcher
      this.startTimeoutWatcher(sourceId)

      // Create producer on the plain transport
      // Note: For SRT input, we use comedia mode so FFmpeg can tell us where to send
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

      console.log(`[SRTIngest] Started ingest for source ${sourceId} (producer: ${producerId})`)
    } catch (err) {
      console.error(`[SRTIngest] Failed to start ingest for ${sourceId}:`, err)
      await this.cleanup(sourceId)
      throw err
    }
  }

  /**
   * Stop SRT ingest
   */
  async stopIngest(sourceId: string): Promise<void> {
    const process = this.ingestProcesses.get(sourceId)
    if (!process) {
      console.log(`[SRTIngest] No ingest found for source ${sourceId}`)
      return
    }

    console.log(`[SRTIngest] Stopping ingest for source ${sourceId}`)

    // Kill FFmpeg gracefully
    process.ffmpeg.kill('SIGTERM')
    await new Promise(resolve => setTimeout(resolve, 1000))
    if (!process.ffmpeg.killed) {
      process.ffmpeg.kill('SIGKILL')
    }

    await this.cleanup(sourceId)
  }

  /**
   * Allocate an available port for SRT listener
   */
  private async allocatePort(sourceId: string): Promise<number> {
    for (let port = this.SRT_PORT_MIN; port <= this.SRT_PORT_MAX; port++) {
      if (!this.allocatedPorts.has(port)) {
        // Check if port is actually available at OS level
        const isAvailable = await this.checkPortAvailable(port)
        if (isAvailable) {
          this.allocatedPorts.set(port, { port, sourceId })
          return port
        }
      }
    }
    throw new Error('No available ports for SRT listener')
  }

  private releasePort(sourceId: string): void {
    for (const [port, allocation] of this.allocatedPorts) {
      if (allocation.sourceId === sourceId) {
        this.allocatedPorts.delete(port)
        console.log(`[SRTIngest] Released port ${port}`)
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
   * Build FFmpeg arguments for SRT input to RTP output
   */
  private buildFFmpegArgs(
    source: {
      srtMode: string | null
      srtHost: string | null
      srtPort: number | null
      srtStreamId: string | null
      srtPassphrase: string | null
      srtLatency: number | null
    },
    transportInfo: { rtpPort: number; rtcpPort: number },
    allocatedPort: number | null
  ): string[] {
    // Build SRT input URL
    let srtUrl: string
    const srtParams: string[] = []

    if (source.srtMode === 'LISTENER') {
      // Listener: bind to all interfaces
      srtUrl = `srt://0.0.0.0:${allocatedPort}`
      srtParams.push('mode=listener')
    } else {
      // Caller: connect to remote
      srtUrl = `srt://${source.srtHost}:${source.srtPort}`
      srtParams.push('mode=caller')
    }

    if (source.srtStreamId) srtParams.push(`streamid=${source.srtStreamId}`)
    if (source.srtPassphrase) srtParams.push(`passphrase=${source.srtPassphrase}`)
    // SRT latency is in microseconds, source stores in ms
    if (source.srtLatency) srtParams.push(`latency=${source.srtLatency * 1000}`)

    if (srtParams.length > 0) {
      srtUrl += '?' + srtParams.join('&')
    }

    const args: string[] = [
      '-hide_banner',
      '-loglevel', 'info',

      // SRT input
      '-i', srtUrl,

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

    console.log(`[SRTIngest] Source ${sourceId} connected${remoteAddress ? ` from ${remoteAddress}` : ''}`)

    await prisma.audioSource.update({
      where: { id: sourceId },
      data: {
        srtConnectionState: SRTConnectionState.CONNECTED,
        srtRemoteAddress: remoteAddress,
      },
    })

    // Emit socket event for UI update
    emitSRTSourceStateChange(process.roomId, sourceId, {
      connectionState: SRTConnectionState.CONNECTED,
      remoteAddress,
      listenerPort: process.allocatedPort,
    })
  }

  private async handleError(sourceId: string, error: string): Promise<void> {
    const process = this.ingestProcesses.get(sourceId)
    console.error(`[SRTIngest] Source ${sourceId} error: ${error}`)

    await audioSourceService.updateSourceState(sourceId, {
      playbackState: PlaybackState.ERROR,
      errorMessage: error,
      isActive: false,
    })

    await prisma.audioSource.update({
      where: { id: sourceId },
      data: { srtConnectionState: SRTConnectionState.ERROR },
    })

    // Emit socket event for UI update
    if (process) {
      emitSRTSourceStateChange(process.roomId, sourceId, {
        connectionState: SRTConnectionState.ERROR,
        errorMessage: error,
      })
    }
  }

  private async cleanup(sourceId: string): Promise<void> {
    const process = this.ingestProcesses.get(sourceId)
    if (!process) return

    console.log(`[SRTIngest] Cleaning up source ${sourceId}`)

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
        srtConnectionState: SRTConnectionState.DISCONNECTED,
        srtListenerPort: null,
        srtRemoteAddress: null,
      },
    })

    await audioSourceService.updateSourceState(sourceId, {
      isActive: false,
      playbackState: PlaybackState.STOPPED,
    })

    this.ingestProcesses.delete(sourceId)

    // Emit socket event for UI update
    emitSRTSourceStateChange(roomId, sourceId, {
      connectionState: SRTConnectionState.DISCONNECTED,
    })
  }

  /**
   * Get info about an active ingest
   */
  getIngestInfo(sourceId: string): SRTIngestProcess | undefined {
    return this.ingestProcesses.get(sourceId)
  }

  /**
   * Check if an ingest is running
   */
  isIngestRunning(sourceId: string): boolean {
    return this.ingestProcesses.has(sourceId)
  }

  /**
   * Get connection info for a source (for UI display)
   */
  async getConnectionInfo(sourceId: string): Promise<{
    mode: 'LISTENER' | 'CALLER'
    connectionUrl?: string
    port?: number
    targetHost?: string
    targetPort?: number
    connectionState: string
  } | null> {
    const source = await prisma.audioSource.findUnique({
      where: { id: sourceId },
    })

    if (!source || source.type !== 'SRT_STREAM') {
      return null
    }

    const publicHost = process.env.SRT_PUBLIC_HOST || 'localhost'

    if (source.srtMode === 'LISTENER') {
      return {
        mode: 'LISTENER',
        connectionUrl: source.srtListenerPort
          ? `srt://${publicHost}:${source.srtListenerPort}`
          : undefined,
        port: source.srtListenerPort || undefined,
        connectionState: source.srtConnectionState || 'DISCONNECTED',
      }
    } else {
      return {
        mode: 'CALLER',
        targetHost: source.srtHost || undefined,
        targetPort: source.srtPort || undefined,
        connectionState: source.srtConnectionState || 'DISCONNECTED',
      }
    }
  }

  /**
   * Stop all ingests (for shutdown)
   */
  async stopAll(): Promise<void> {
    console.log(`[SRTIngest] Stopping all ingests (${this.ingestProcesses.size} running)`)
    const promises = Array.from(this.ingestProcesses.keys()).map(id => this.stopIngest(id))
    await Promise.all(promises)
  }
}

export const srtIngestService = new SRTIngestService()
