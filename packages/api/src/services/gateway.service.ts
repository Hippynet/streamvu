/**
 * Protocol Gateway Service
 *
 * Server-side protocol conversion for broadcast workflows.
 * Supports:
 * - SRT → NDI conversion
 * - WebRTC → SRT conversion
 * - Firewall traversal relay
 * - Multi-destination fanout
 * - Quality adaptation
 *
 * Use cases:
 * - Remote contributors on SRT feeding into NDI workflow
 * - WebRTC contributors to SRT delivery
 * - Protocol bridging between different broadcast systems
 */

import { EventEmitter } from 'events'
import { spawn, ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'

// =============================================================================
// Types & Interfaces
// =============================================================================

export type GatewayType =
  | 'srt-to-ndi'
  | 'ndi-to-srt'
  | 'webrtc-to-srt'
  | 'srt-to-srt' // Relay mode
  | 'srt-fanout' // One to many

export interface GatewayConfig {
  type: GatewayType
  name: string
  input: GatewayInput
  outputs: GatewayOutput[]
  qualityAdaptation?: QualityAdaptationConfig
}

export interface GatewayInput {
  protocol: 'srt' | 'ndi' | 'webrtc' | 'rtmp' | 'whep'
  // SRT input
  srtHost?: string
  srtPort?: number
  srtMode?: 'listener' | 'caller'
  srtStreamId?: string
  srtPassphrase?: string
  srtLatency?: number
  // NDI input
  ndiSourceName?: string
  ndiGroups?: string[]
  // WebRTC/WHEP input
  whepUrl?: string
  // RTMP input
  rtmpUrl?: string
}

export interface GatewayOutput {
  id: string
  protocol: 'srt' | 'ndi' | 'rtmp' | 'icecast'
  enabled: boolean
  // SRT output
  srtHost?: string
  srtPort?: number
  srtMode?: 'listener' | 'caller'
  srtStreamId?: string
  srtPassphrase?: string
  srtLatency?: number
  // NDI output
  ndiSourceName?: string
  ndiGroups?: string[]
  // RTMP output
  rtmpUrl?: string
  // Icecast output
  icecastUrl?: string
  icecastMount?: string
}

export interface QualityAdaptationConfig {
  enabled: boolean
  minBitrate: number
  maxBitrate: number
  targetLatency: number
  adaptiveFrameRate: boolean
}

export interface Gateway {
  id: string
  name: string
  type: GatewayType
  status: 'idle' | 'starting' | 'running' | 'error' | 'stopping'
  error?: string
  config: GatewayConfig
  stats?: GatewayStats
  createdAt: Date
  startedAt?: Date
}

export interface GatewayStats {
  inputBitrate: number
  outputBitrate: number
  latency: number
  packetLoss: number
  framesProcessed: number
  framesDropped: number
  uptime: number
  outputStats: Map<string, OutputStats>
}

export interface OutputStats {
  outputId: string
  bytesTransferred: number
  bitrate: number
  connected: boolean
  errors: number
}

interface ActiveGateway {
  gateway: Gateway
  processes: Map<string, ChildProcess> // Output ID → FFmpeg process
  statsInterval?: NodeJS.Timeout
}

// =============================================================================
// Gateway Service
// =============================================================================

class GatewayService extends EventEmitter {
  private gateways: Map<string, ActiveGateway> = new Map()
  private portAllocation: Map<number, string> = new Map() // port → gatewayId
  private readonly PORT_RANGE_START = 32000
  private readonly PORT_RANGE_END = 32999

  constructor() {
    super()
    console.log('[Gateway] Service initialized')
  }

  // ===========================================================================
  // Gateway Management
  // ===========================================================================

  /**
   * Create a new gateway
   */
  async createGateway(config: GatewayConfig): Promise<Gateway> {
    const gatewayId = randomUUID()

    const gateway: Gateway = {
      id: gatewayId,
      name: config.name,
      type: config.type,
      status: 'idle',
      config,
      createdAt: new Date(),
    }

    const activeGateway: ActiveGateway = {
      gateway,
      processes: new Map(),
    }

    this.gateways.set(gatewayId, activeGateway)
    this.emit('gatewayCreated', gateway)

    return gateway
  }

  /**
   * Start a gateway
   */
  async startGateway(gatewayId: string): Promise<void> {
    const activeGateway = this.gateways.get(gatewayId)
    if (!activeGateway) {
      throw new Error(`Gateway ${gatewayId} not found`)
    }

    const { gateway, processes } = activeGateway

    if (gateway.status === 'running') {
      throw new Error(`Gateway ${gatewayId} is already running`)
    }

    gateway.status = 'starting'
    this.emit('gatewayStatusChanged', { gatewayId, status: 'starting' })

    try {
      // Start FFmpeg process for each output
      for (const output of gateway.config.outputs) {
        if (!output.enabled) continue

        const args = this.buildFfmpegArgs(gateway.config, output)
        console.log(`[Gateway] Starting output ${output.id}: ffmpeg ${args.join(' ')}`)

        const proc = spawn('ffmpeg', args, {
          stdio: ['pipe', 'pipe', 'pipe'],
        })

        processes.set(output.id, proc)

        proc.on('spawn', () => {
          console.log(`[Gateway] Output ${output.id} started`)
        })

        proc.stderr?.on('data', (data: Buffer) => {
          this.parseStatsFromOutput(gatewayId, output.id, data.toString())
        })

        proc.on('error', (err: Error) => {
          console.error(`[Gateway] Error in output ${output.id}:`, err.message)
          this.emit('outputError', { gatewayId, outputId: output.id, error: err.message })
        })

        proc.on('exit', (code, signal) => {
          console.log(`[Gateway] Output ${output.id} exited (code: ${code}, signal: ${signal})`)
          processes.delete(output.id)

          // Check if all processes have stopped
          if (processes.size === 0 && gateway.status === 'running') {
            gateway.status = 'error'
            gateway.error = 'All outputs stopped unexpectedly'
            this.emit('gatewayError', { gatewayId, error: gateway.error })
          }
        })
      }

      gateway.status = 'running'
      gateway.startedAt = new Date()
      gateway.stats = {
        inputBitrate: 0,
        outputBitrate: 0,
        latency: 0,
        packetLoss: 0,
        framesProcessed: 0,
        framesDropped: 0,
        uptime: 0,
        outputStats: new Map(),
      }

      // Start stats collection
      activeGateway.statsInterval = setInterval(() => {
        this.updateStats(gatewayId)
      }, 1000)

      this.emit('gatewayStarted', gateway)
      this.emit('gatewayStatusChanged', { gatewayId, status: 'running' })
    } catch (error) {
      gateway.status = 'error'
      gateway.error = error instanceof Error ? error.message : 'Failed to start'
      this.emit('gatewayError', { gatewayId, error: gateway.error })
      throw error
    }
  }

  /**
   * Stop a gateway
   */
  async stopGateway(gatewayId: string): Promise<void> {
    const activeGateway = this.gateways.get(gatewayId)
    if (!activeGateway) return

    const { gateway, processes, statsInterval } = activeGateway

    gateway.status = 'stopping'
    this.emit('gatewayStatusChanged', { gatewayId, status: 'stopping' })

    // Stop stats collection
    if (statsInterval) {
      clearInterval(statsInterval)
      activeGateway.statsInterval = undefined
    }

    // Stop all processes
    const stopPromises: Promise<void>[] = []
    for (const [outputId, proc] of processes) {
      stopPromises.push(
        new Promise((resolve) => {
          proc.once('exit', () => {
            processes.delete(outputId)
            resolve()
          })

          proc.kill('SIGTERM')

          // Force kill after 5 seconds
          setTimeout(() => {
            if (proc.killed === false) {
              proc.kill('SIGKILL')
            }
          }, 5000)
        })
      )
    }

    await Promise.all(stopPromises)

    gateway.status = 'idle'
    gateway.startedAt = undefined
    this.emit('gatewayStopped', { gatewayId })
  }

  /**
   * Remove a gateway
   */
  async removeGateway(gatewayId: string): Promise<void> {
    await this.stopGateway(gatewayId)
    this.gateways.delete(gatewayId)
    this.emit('gatewayRemoved', { gatewayId })
  }

  /**
   * Get gateway by ID
   */
  getGateway(gatewayId: string): Gateway | undefined {
    return this.gateways.get(gatewayId)?.gateway
  }

  /**
   * Get all gateways
   */
  getAllGateways(): Gateway[] {
    return Array.from(this.gateways.values()).map((g) => g.gateway)
  }

  /**
   * Update gateway configuration
   */
  async updateGateway(
    gatewayId: string,
    updates: Partial<GatewayConfig>
  ): Promise<Gateway | undefined> {
    const activeGateway = this.gateways.get(gatewayId)
    if (!activeGateway) return undefined

    const wasRunning = activeGateway.gateway.status === 'running'

    // Stop if running
    if (wasRunning) {
      await this.stopGateway(gatewayId)
    }

    // Apply updates
    Object.assign(activeGateway.gateway.config, updates)
    if (updates.name) {
      activeGateway.gateway.name = updates.name
    }

    this.emit('gatewayUpdated', activeGateway.gateway)

    // Restart if was running
    if (wasRunning) {
      await this.startGateway(gatewayId)
    }

    return activeGateway.gateway
  }

  // ===========================================================================
  // Quick Gateway Creation Methods
  // ===========================================================================

  /**
   * Create an SRT to NDI gateway
   */
  async createSrtToNdi(
    name: string,
    srtConfig: {
      host: string
      port: number
      mode: 'listener' | 'caller'
      streamId?: string
      passphrase?: string
      latency?: number
    },
    ndiConfig: {
      sourceName: string
      groups?: string[]
    }
  ): Promise<Gateway> {
    return this.createGateway({
      type: 'srt-to-ndi',
      name,
      input: {
        protocol: 'srt',
        srtHost: srtConfig.host,
        srtPort: srtConfig.port,
        srtMode: srtConfig.mode,
        srtStreamId: srtConfig.streamId,
        srtPassphrase: srtConfig.passphrase,
        srtLatency: srtConfig.latency || 120,
      },
      outputs: [
        {
          id: randomUUID(),
          protocol: 'ndi',
          enabled: true,
          ndiSourceName: ndiConfig.sourceName,
          ndiGroups: ndiConfig.groups,
        },
      ],
    })
  }

  /**
   * Create an SRT fanout (one to many)
   */
  async createSrtFanout(
    name: string,
    inputConfig: {
      host: string
      port: number
      mode: 'listener' | 'caller'
      streamId?: string
      passphrase?: string
    },
    outputConfigs: Array<{
      host: string
      port: number
      streamId?: string
      passphrase?: string
    }>
  ): Promise<Gateway> {
    return this.createGateway({
      type: 'srt-fanout',
      name,
      input: {
        protocol: 'srt',
        srtHost: inputConfig.host,
        srtPort: inputConfig.port,
        srtMode: inputConfig.mode,
        srtStreamId: inputConfig.streamId,
        srtPassphrase: inputConfig.passphrase,
      },
      outputs: outputConfigs.map((out) => ({
        id: randomUUID(),
        protocol: 'srt' as const,
        enabled: true,
        srtHost: out.host,
        srtPort: out.port,
        srtMode: 'caller' as const,
        srtStreamId: out.streamId,
        srtPassphrase: out.passphrase,
        srtLatency: 120,
      })),
    })
  }

  /**
   * Create an SRT relay (firewall traversal)
   */
  async createSrtRelay(
    name: string,
    listenerPort: number,
    outputHost: string,
    outputPort: number,
    options: {
      streamId?: string
      passphrase?: string
      latency?: number
    } = {}
  ): Promise<Gateway> {
    return this.createGateway({
      type: 'srt-to-srt',
      name,
      input: {
        protocol: 'srt',
        srtPort: listenerPort,
        srtMode: 'listener',
        srtLatency: options.latency || 120,
      },
      outputs: [
        {
          id: randomUUID(),
          protocol: 'srt',
          enabled: true,
          srtHost: outputHost,
          srtPort: outputPort,
          srtMode: 'caller',
          srtStreamId: options.streamId,
          srtPassphrase: options.passphrase,
          srtLatency: options.latency || 120,
        },
      ],
    })
  }

  // ===========================================================================
  // Port Management
  // ===========================================================================

  /**
   * Allocate an available port
   */
  allocatePort(): number {
    for (let port = this.PORT_RANGE_START; port <= this.PORT_RANGE_END; port++) {
      if (!this.portAllocation.has(port)) {
        return port
      }
    }
    throw new Error('No available ports in range')
  }

  /**
   * Release an allocated port
   */
  releasePort(port: number): void {
    this.portAllocation.delete(port)
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private buildFfmpegArgs(config: GatewayConfig, output: GatewayOutput): string[] {
    const args: string[] = ['-hide_banner', '-loglevel', 'info']

    // Build input
    args.push(...this.buildInputArgs(config.input))

    // Codec settings (copy by default for low latency)
    args.push('-c:a', 'copy', '-c:v', 'copy')

    // Build output
    args.push(...this.buildOutputArgs(output))

    return args
  }

  private buildInputArgs(input: GatewayInput): string[] {
    const args: string[] = []

    switch (input.protocol) {
      case 'srt': {
        let srtUrl = 'srt://'
        if (input.srtMode === 'listener') {
          srtUrl += `0.0.0.0:${input.srtPort}?mode=listener`
        } else {
          srtUrl += `${input.srtHost}:${input.srtPort}?mode=caller`
        }
        if (input.srtStreamId) {
          srtUrl += `&streamid=${encodeURIComponent(input.srtStreamId)}`
        }
        if (input.srtPassphrase) {
          srtUrl += `&passphrase=${encodeURIComponent(input.srtPassphrase)}`
        }
        srtUrl += `&latency=${(input.srtLatency || 120) * 1000}`

        args.push('-i', srtUrl)
        break
      }

      case 'ndi':
        // Note: Requires FFmpeg with NDI support
        args.push('-f', 'libndi_newtek', '-i', input.ndiSourceName || '')
        break

      case 'rtmp':
        args.push('-i', input.rtmpUrl || '')
        break

      case 'whep':
        // WHEP input requires special handling
        args.push('-protocol_whitelist', 'file,rtp,udp', '-i', input.whepUrl || '')
        break
    }

    return args
  }

  private buildOutputArgs(output: GatewayOutput): string[] {
    const args: string[] = []

    switch (output.protocol) {
      case 'srt': {
        let srtUrl = 'srt://'
        if (output.srtMode === 'listener') {
          srtUrl += `0.0.0.0:${output.srtPort}?mode=listener`
        } else {
          srtUrl += `${output.srtHost}:${output.srtPort}?mode=caller`
        }
        if (output.srtStreamId) {
          srtUrl += `&streamid=${encodeURIComponent(output.srtStreamId)}`
        }
        if (output.srtPassphrase) {
          srtUrl += `&passphrase=${encodeURIComponent(output.srtPassphrase)}`
        }
        srtUrl += `&latency=${(output.srtLatency || 120) * 1000}`

        args.push('-f', 'mpegts', srtUrl)
        break
      }

      case 'ndi':
        // Note: Requires FFmpeg with NDI support
        args.push('-f', 'libndi_newtek', '-ndi_name', output.ndiSourceName || 'StreamVU')
        break

      case 'rtmp':
        args.push('-f', 'flv', output.rtmpUrl || '')
        break

      case 'icecast':
        args.push('-f', 'mp3', `${output.icecastUrl}${output.icecastMount}`)
        break
    }

    return args
  }

  private parseStatsFromOutput(gatewayId: string, outputId: string, message: string): void {
    const activeGateway = this.gateways.get(gatewayId)
    if (!activeGateway?.gateway.stats) return

    // Parse FFmpeg progress output
    const bitrateMatch = message.match(/bitrate=\s*([\d.]+)kbits\/s/)
    if (bitrateMatch && bitrateMatch[1]) {
      const bitrate = parseFloat(bitrateMatch[1])

      let outputStats = activeGateway.gateway.stats.outputStats.get(outputId)
      if (!outputStats) {
        outputStats = {
          outputId,
          bytesTransferred: 0,
          bitrate: 0,
          connected: true,
          errors: 0,
        }
        activeGateway.gateway.stats.outputStats.set(outputId, outputStats)
      }
      outputStats.bitrate = bitrate
    }
  }

  private updateStats(gatewayId: string): void {
    const activeGateway = this.gateways.get(gatewayId)
    if (!activeGateway?.gateway.stats || !activeGateway.gateway.startedAt) return

    activeGateway.gateway.stats.uptime =
      (Date.now() - activeGateway.gateway.startedAt.getTime()) / 1000

    this.emit('gatewayStats', {
      gatewayId,
      stats: activeGateway.gateway.stats,
    })
  }

  /**
   * Clean up all gateways
   */
  async shutdown(): Promise<void> {
    const stopPromises: Promise<void>[] = []
    for (const gatewayId of this.gateways.keys()) {
      stopPromises.push(this.stopGateway(gatewayId))
    }
    await Promise.all(stopPromises)
  }
}

export const gatewayService = new GatewayService()
