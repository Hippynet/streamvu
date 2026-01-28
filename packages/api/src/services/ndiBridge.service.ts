/**
 * NDI Bridge Service
 *
 * Bridges WebRTC audio/video streams to NDI (Network Device Interface).
 * Enables integration with professional broadcast equipment like:
 * - vMix
 * - TriCaster
 * - OBS with NDI plugin
 * - Any NDI-compatible software/hardware
 *
 * Architecture:
 * [Browser] → WebRTC → [StreamVU API] → [NDI Bridge Service] → NDI → [vMix/TriCaster]
 *
 * Note: This service coordinates with an external NDI Bridge application
 * (Electron app or native service) that handles the actual NDI SDK calls.
 * The NDI SDK is not available as a Node.js native module and requires
 * a companion application.
 */

import { EventEmitter } from 'events'
import { spawn, ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'

// =============================================================================
// Types & Interfaces
// =============================================================================

export interface NDIOutput {
  id: string
  name: string
  roomId: string
  participantId?: string // If specific to one participant
  type: 'audio' | 'video' | 'audio-video'
  status: 'idle' | 'starting' | 'active' | 'error' | 'stopping'
  error?: string
  stats?: NDIOutputStats
  config: NDIOutputConfig
  createdAt: Date
  startedAt?: Date
}

export interface NDIOutputConfig {
  sourceName: string // NDI source name visible on network
  groups?: string[] // NDI groups for filtering
  frameRate: number
  audioChannels: number
  audioSampleRate: number
  videoWidth?: number
  videoHeight?: number
  videoCodec?: 'h264' | 'hevc'
  failoverSource?: string // NDI source for failover
  lowLatency?: boolean
}

export interface NDIOutputStats {
  framesSent: number
  framesDropped: number
  audioSamplesSent: number
  bytesTransferred: number
  connectedReceivers: number
  bandwidth: number // Current bandwidth in Mbps
  uptime: number // Seconds
  lastFrame: Date
}

export interface NDIReceiver {
  id: string
  name: string
  ipAddress: string
  connected: boolean
  lastSeen: Date
}

interface ActiveNDIOutput {
  output: NDIOutput
  process?: ChildProcess
  webrtcToNdiPipe?: string // Named pipe or socket path
}

// =============================================================================
// NDI Bridge Service
// =============================================================================

class NDIBridgeService extends EventEmitter {
  private outputs: Map<string, ActiveNDIOutput> = new Map()
  private roomOutputs: Map<string, Set<string>> = new Map() // roomId -> outputIds
  private bridgeAppPath: string | null = null
  private bridgeAppAvailable = false
  private discoveredReceivers: Map<string, NDIReceiver> = new Map()

  constructor() {
    super()
    this.detectBridgeApp()
  }

  /**
   * Detect if NDI Bridge companion app is available
   */
  private async detectBridgeApp(): Promise<void> {
    // Check for NDI Bridge companion app in common locations
    const possiblePaths = [
      process.env.NDI_BRIDGE_PATH,
      '/usr/local/bin/ndi-bridge',
      '/opt/streamvu/ndi-bridge',
      'C:\\Program Files\\StreamVU\\ndi-bridge.exe',
    ].filter(Boolean) as string[]

    for (const path of possiblePaths) {
      try {
        // Test if the binary exists and is executable
        const proc = spawn(path, ['--version'], { stdio: 'pipe' })
        await new Promise<void>((resolve, reject) => {
          proc.on('exit', (code) => {
            if (code === 0) {
              this.bridgeAppPath = path
              this.bridgeAppAvailable = true
              console.log(`[NDIBridge] Found companion app at ${path}`)
              resolve()
            } else {
              reject(new Error(`Exit code ${code}`))
            }
          })
          proc.on('error', reject)
        })
        break
      } catch {
        // Continue to next path
      }
    }

    if (!this.bridgeAppAvailable) {
      console.log('[NDIBridge] Companion app not found - NDI output will be simulated')
    }
  }

  /**
   * Check if NDI Bridge is available
   */
  isAvailable(): boolean {
    return this.bridgeAppAvailable
  }

  /**
   * Get bridge status
   */
  getStatus(): {
    available: boolean
    bridgePath: string | null
    activeOutputs: number
    discoveredReceivers: number
  } {
    return {
      available: this.bridgeAppAvailable,
      bridgePath: this.bridgeAppPath,
      activeOutputs: Array.from(this.outputs.values()).filter((o) => o.output.status === 'active').length,
      discoveredReceivers: this.discoveredReceivers.size,
    }
  }

  // ===========================================================================
  // NDI Output Management
  // ===========================================================================

  /**
   * Create a new NDI output for a room
   */
  async createOutput(
    roomId: string,
    config: Partial<NDIOutputConfig>,
    options: {
      participantId?: string
      type?: 'audio' | 'video' | 'audio-video'
    } = {}
  ): Promise<NDIOutput> {
    const outputId = randomUUID()

    const fullConfig: NDIOutputConfig = {
      sourceName: config.sourceName || `StreamVU Room ${roomId.slice(0, 8)}`,
      groups: config.groups,
      frameRate: config.frameRate || 30,
      audioChannels: config.audioChannels || 2,
      audioSampleRate: config.audioSampleRate || 48000,
      videoWidth: config.videoWidth,
      videoHeight: config.videoHeight,
      videoCodec: config.videoCodec,
      failoverSource: config.failoverSource,
      lowLatency: config.lowLatency ?? true,
    }

    const output: NDIOutput = {
      id: outputId,
      name: fullConfig.sourceName,
      roomId,
      participantId: options.participantId,
      type: options.type || 'audio',
      status: 'idle',
      config: fullConfig,
      createdAt: new Date(),
    }

    const activeOutput: ActiveNDIOutput = {
      output,
    }

    this.outputs.set(outputId, activeOutput)

    // Track by room
    if (!this.roomOutputs.has(roomId)) {
      this.roomOutputs.set(roomId, new Set())
    }
    this.roomOutputs.get(roomId)!.add(outputId)

    this.emit('outputCreated', output)

    return output
  }

  /**
   * Start an NDI output
   */
  async startOutput(outputId: string, webrtcStreamUrl: string): Promise<void> {
    const activeOutput = this.outputs.get(outputId)
    if (!activeOutput) {
      throw new Error(`NDI output ${outputId} not found`)
    }

    const { output } = activeOutput

    if (output.status === 'active') {
      throw new Error(`NDI output ${outputId} is already active`)
    }

    output.status = 'starting'
    this.emit('outputStatusChanged', { outputId, status: 'starting' })

    try {
      if (this.bridgeAppAvailable && this.bridgeAppPath) {
        // Use real NDI Bridge app
        const args = this.buildBridgeArgs(output, webrtcStreamUrl)
        console.log(`[NDIBridge] Starting: ${this.bridgeAppPath} ${args.join(' ')}`)

        const proc = spawn(this.bridgeAppPath, args, {
          stdio: ['pipe', 'pipe', 'pipe'],
        })

        activeOutput.process = proc

        proc.on('spawn', () => {
          output.status = 'active'
          output.startedAt = new Date()
          output.stats = {
            framesSent: 0,
            framesDropped: 0,
            audioSamplesSent: 0,
            bytesTransferred: 0,
            connectedReceivers: 0,
            bandwidth: 0,
            uptime: 0,
            lastFrame: new Date(),
          }
          this.emit('outputStarted', output)
        })

        proc.stderr?.on('data', (data: Buffer) => {
          const message = data.toString()
          // Parse stats from bridge app output
          this.parseStatsFromOutput(outputId, message)
        })

        proc.on('error', (err: Error) => {
          console.error(`[NDIBridge] Error in ${output.name}:`, err.message)
          output.status = 'error'
          output.error = err.message
          activeOutput.process = undefined
          this.emit('outputError', { outputId, error: err.message })
        })

        proc.on('exit', (code, signal) => {
          console.log(`[NDIBridge] Exited ${output.name} (code: ${code}, signal: ${signal})`)
          if (code !== 0 && output.status !== 'stopping') {
            output.status = 'error'
            output.error = `Process exited with code ${code}`
          } else {
            output.status = 'idle'
          }
          activeOutput.process = undefined
          this.emit('outputEnded', { outputId })
        })
      } else {
        // Simulate NDI output for development
        console.log(`[NDIBridge] Simulating NDI output: ${output.name}`)
        output.status = 'active'
        output.startedAt = new Date()
        output.stats = {
          framesSent: 0,
          framesDropped: 0,
          audioSamplesSent: 0,
          bytesTransferred: 0,
          connectedReceivers: 1,
          bandwidth: 25,
          uptime: 0,
          lastFrame: new Date(),
        }
        this.emit('outputStarted', output)

        // Simulate stats updates
        this.startSimulatedStats(outputId)
      }

      this.emit('outputStatusChanged', { outputId, status: output.status })
    } catch (error) {
      output.status = 'error'
      output.error = error instanceof Error ? error.message : 'Failed to start'
      this.emit('outputError', { outputId, error: output.error })
      throw error
    }
  }

  /**
   * Stop an NDI output
   */
  async stopOutput(outputId: string): Promise<void> {
    const activeOutput = this.outputs.get(outputId)
    if (!activeOutput) return

    const { output, process } = activeOutput

    output.status = 'stopping'
    this.emit('outputStatusChanged', { outputId, status: 'stopping' })

    if (process) {
      return new Promise((resolve) => {
        process.once('exit', () => {
          output.status = 'idle'
          output.startedAt = undefined
          resolve()
        })

        process.kill('SIGTERM')

        // Force kill after 5 seconds
        setTimeout(() => {
          if (activeOutput.process) {
            activeOutput.process.kill('SIGKILL')
          }
        }, 5000)
      })
    }

    output.status = 'idle'
    output.startedAt = undefined
  }

  /**
   * Remove an NDI output
   */
  async removeOutput(outputId: string): Promise<void> {
    await this.stopOutput(outputId)

    const activeOutput = this.outputs.get(outputId)
    if (!activeOutput) return

    // Remove from room tracking
    const roomId = activeOutput.output.roomId
    this.roomOutputs.get(roomId)?.delete(outputId)

    this.outputs.delete(outputId)
    this.emit('outputRemoved', { outputId })
  }

  /**
   * Get all outputs for a room
   */
  getOutputsForRoom(roomId: string): NDIOutput[] {
    const outputIds = this.roomOutputs.get(roomId)
    if (!outputIds) return []

    return Array.from(outputIds)
      .map((id) => this.outputs.get(id)?.output)
      .filter((o): o is NDIOutput => o !== undefined)
  }

  /**
   * Get output by ID
   */
  getOutput(outputId: string): NDIOutput | undefined {
    return this.outputs.get(outputId)?.output
  }

  /**
   * Get all outputs
   */
  getAllOutputs(): NDIOutput[] {
    return Array.from(this.outputs.values()).map((o) => o.output)
  }

  /**
   * Update output configuration
   */
  async updateOutput(
    outputId: string,
    updates: Partial<NDIOutputConfig>
  ): Promise<NDIOutput | undefined> {
    const activeOutput = this.outputs.get(outputId)
    if (!activeOutput) return undefined

    const wasActive = activeOutput.output.status === 'active'
    const webrtcUrl = activeOutput.webrtcToNdiPipe

    // If active, need to restart with new config
    if (wasActive) {
      await this.stopOutput(outputId)
    }

    Object.assign(activeOutput.output.config, updates)
    activeOutput.output.name = updates.sourceName || activeOutput.output.name

    this.emit('outputUpdated', activeOutput.output)

    // Restart if was active
    if (wasActive && webrtcUrl) {
      await this.startOutput(outputId, webrtcUrl)
    }

    return activeOutput.output
  }

  // ===========================================================================
  // NDI Discovery
  // ===========================================================================

  /**
   * Get discovered NDI receivers
   */
  getReceivers(): NDIReceiver[] {
    return Array.from(this.discoveredReceivers.values())
  }

  /**
   * Discover NDI receivers on the network
   */
  async discoverReceivers(): Promise<NDIReceiver[]> {
    if (!this.bridgeAppAvailable || !this.bridgeAppPath) {
      // Return mock receivers for development
      return [
        {
          id: 'mock-1',
          name: 'vMix Workstation',
          ipAddress: '192.168.1.100',
          connected: false,
          lastSeen: new Date(),
        },
        {
          id: 'mock-2',
          name: 'TriCaster Mini',
          ipAddress: '192.168.1.101',
          connected: false,
          lastSeen: new Date(),
        },
      ]
    }

    // Query bridge app for receivers
    return new Promise((resolve, reject) => {
      const proc = spawn(this.bridgeAppPath!, ['--discover', '--json'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let output = ''
      proc.stdout?.on('data', (data: Buffer) => {
        output += data.toString()
      })

      proc.on('exit', (code) => {
        if (code === 0) {
          try {
            const receivers = JSON.parse(output) as NDIReceiver[]
            for (const receiver of receivers) {
              this.discoveredReceivers.set(receiver.id, receiver)
            }
            resolve(receivers)
          } catch {
            resolve([])
          }
        } else {
          reject(new Error(`Discovery failed with code ${code}`))
        }
      })

      proc.on('error', reject)
    })
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private buildBridgeArgs(output: NDIOutput, webrtcUrl: string): string[] {
    const { config } = output

    const args = [
      '--input', webrtcUrl,
      '--ndi-name', config.sourceName,
      '--frame-rate', String(config.frameRate),
      '--audio-channels', String(config.audioChannels),
      '--sample-rate', String(config.audioSampleRate),
    ]

    if (config.groups && config.groups.length > 0) {
      args.push('--groups', config.groups.join(','))
    }

    if (config.videoWidth && config.videoHeight) {
      args.push('--resolution', `${config.videoWidth}x${config.videoHeight}`)
    }

    if (config.lowLatency) {
      args.push('--low-latency')
    }

    if (config.failoverSource) {
      args.push('--failover', config.failoverSource)
    }

    return args
  }

  private parseStatsFromOutput(outputId: string, message: string): void {
    const activeOutput = this.outputs.get(outputId)
    if (!activeOutput?.output.stats) return

    // Parse stats from bridge app stderr output
    // Format: STATS: frames=1234 dropped=5 audio=98765 bytes=1234567890 receivers=2
    const statsMatch = message.match(
      /STATS:\s*frames=(\d+)\s+dropped=(\d+)\s+audio=(\d+)\s+bytes=(\d+)\s+receivers=(\d+)/
    )

    if (statsMatch && statsMatch[1] && statsMatch[2] && statsMatch[3] && statsMatch[4] && statsMatch[5]) {
      const stats = activeOutput.output.stats
      stats.framesSent = parseInt(statsMatch[1], 10)
      stats.framesDropped = parseInt(statsMatch[2], 10)
      stats.audioSamplesSent = parseInt(statsMatch[3], 10)
      stats.bytesTransferred = parseInt(statsMatch[4], 10)
      stats.connectedReceivers = parseInt(statsMatch[5], 10)
      stats.lastFrame = new Date()

      if (activeOutput.output.startedAt) {
        stats.uptime = (Date.now() - activeOutput.output.startedAt.getTime()) / 1000
      }

      this.emit('outputStats', { outputId, stats })
    }
  }

  private startSimulatedStats(outputId: string): void {
    const interval = setInterval(() => {
      const activeOutput = this.outputs.get(outputId)
      if (!activeOutput || activeOutput.output.status !== 'active') {
        clearInterval(interval)
        return
      }

      const stats = activeOutput.output.stats
      if (!stats) return

      stats.framesSent += 30
      stats.audioSamplesSent += 48000
      stats.bytesTransferred += 25000 * 1024 // ~25 Mbps
      stats.lastFrame = new Date()

      if (activeOutput.output.startedAt) {
        stats.uptime = (Date.now() - activeOutput.output.startedAt.getTime()) / 1000
      }

      this.emit('outputStats', { outputId, stats })
    }, 1000)
  }

  /**
   * Clean up all outputs
   */
  async shutdown(): Promise<void> {
    const stopPromises: Promise<void>[] = []
    for (const outputId of this.outputs.keys()) {
      stopPromises.push(this.stopOutput(outputId))
    }
    await Promise.all(stopPromises)
  }
}

export const ndiBridgeService = new NDIBridgeService()
