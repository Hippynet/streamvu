/**
 * Multi-Output Service
 *
 * Manages multiple simultaneous output destinations for audio streaming.
 * Supports:
 * - Multiple Icecast destinations
 * - Multiple SRT outputs (CALLER mode)
 * - Recording to files
 * - Status monitoring and failover
 */

import { EventEmitter } from 'events'
import { spawn, ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import path from 'path'
import fs from 'fs'

export interface OutputDestination {
  id: string
  type: 'icecast' | 'srt' | 'recording'
  name: string
  enabled: boolean
  status: 'idle' | 'connecting' | 'streaming' | 'error' | 'reconnecting'
  error?: string
  stats?: OutputStats
  config: IcecastConfig | SrtOutputConfig | RecordingConfig
}

export interface IcecastConfig {
  type: 'icecast'
  host: string
  port: number
  mountpoint: string
  username: string
  password: string
  format: 'mp3' | 'ogg' | 'opus' | 'aac'
  bitrate: number
  sampleRate: number
  channels: number
  icePublic?: boolean
  iceName?: string
  iceDescription?: string
  iceUrl?: string
  iceGenre?: string
}

export interface SrtOutputConfig {
  type: 'srt'
  host: string
  port: number
  streamId?: string
  passphrase?: string
  latency: number
  mode: 'caller'
  codec: 'opus' | 'aac' | 'pcm'
  bitrate: number
  sampleRate: number
  channels: number
}

export interface RecordingConfig {
  type: 'recording'
  outputDir?: string
  filename?: string
  format: 'wav' | 'mp3' | 'flac' | 'ogg'
  bitrate?: number
  sampleRate: number
  channels: number
  maxDuration?: number // Max recording duration in seconds
  splitEvery?: number // Split into new file every N seconds
}

export interface OutputStats {
  bytesWritten: number
  duration: number
  startTime: Date
  reconnects: number
  currentBitrate?: number
  bufferLevel?: number
}

interface ActiveOutput {
  destination: OutputDestination
  process: ChildProcess | null
  startTime: Date
  reconnectAttempts: number
  reconnectTimer?: NodeJS.Timeout
  inputSource?: string
}

class MultiOutputService extends EventEmitter {
  private outputs: Map<string, ActiveOutput> = new Map()
  private roomOutputs: Map<string, Set<string>> = new Map() // roomId -> outputIds
  private recordingsDir: string

  constructor() {
    super()
    this.recordingsDir = process.env.RECORDINGS_DIR || path.join(process.cwd(), 'recordings')
    this.ensureRecordingsDir()
  }

  private ensureRecordingsDir(): void {
    if (!fs.existsSync(this.recordingsDir)) {
      fs.mkdirSync(this.recordingsDir, { recursive: true })
    }
  }

  /**
   * Add a new output destination to a room
   */
  async addOutput(
    roomId: string,
    config: IcecastConfig | SrtOutputConfig | RecordingConfig,
    name: string
  ): Promise<OutputDestination> {
    const id = randomUUID()

    const destination: OutputDestination = {
      id,
      type: config.type,
      name,
      enabled: false,
      status: 'idle',
      config,
    }

    const output: ActiveOutput = {
      destination,
      process: null,
      startTime: new Date(),
      reconnectAttempts: 0,
    }

    this.outputs.set(id, output)

    // Track output by room
    if (!this.roomOutputs.has(roomId)) {
      this.roomOutputs.set(roomId, new Set())
    }
    this.roomOutputs.get(roomId)!.add(id)

    this.emit('outputAdded', { roomId, output: destination })

    return destination
  }

  /**
   * Remove an output destination
   */
  async removeOutput(outputId: string): Promise<void> {
    const output = this.outputs.get(outputId)
    if (!output) return

    // Stop if running
    await this.stopOutput(outputId)

    // Remove from room tracking
    for (const [, outputs] of this.roomOutputs) {
      if (outputs.has(outputId)) {
        outputs.delete(outputId)
        break
      }
    }

    this.outputs.delete(outputId)
    this.emit('outputRemoved', { outputId })
  }

  /**
   * Start streaming to an output
   */
  async startOutput(outputId: string, inputSource: string): Promise<void> {
    const output = this.outputs.get(outputId)
    if (!output) {
      throw new Error(`Output ${outputId} not found`)
    }

    if (output.process) {
      throw new Error(`Output ${outputId} is already running`)
    }

    output.destination.status = 'connecting'
    output.destination.enabled = true
    output.startTime = new Date()
    output.inputSource = inputSource
    this.emit('outputStatusChanged', { outputId, status: 'connecting' })

    try {
      const args = this.buildFfmpegArgs(output.destination, inputSource)
      console.log(`[MultiOutput] Starting ${output.destination.name}: ffmpeg ${args.join(' ')}`)

      const ffmpegProcess = spawn('ffmpeg', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      output.process = ffmpegProcess

      ffmpegProcess.on('spawn', () => {
        console.log(`[MultiOutput] Started ${output.destination.name}`)
        output.destination.status = 'streaming'
        output.destination.stats = {
          bytesWritten: 0,
          duration: 0,
          startTime: new Date(),
          reconnects: output.reconnectAttempts,
        }
        this.emit('outputStatusChanged', { outputId, status: 'streaming' })
      })

      ffmpegProcess.stderr?.on('data', (data: Buffer) => {
        const message = data.toString()
        // Parse progress from ffmpeg stderr
        const timeMatch = message.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/)
        if (timeMatch && timeMatch[1] && timeMatch[2] && timeMatch[3] && output.destination.stats) {
          const hours = parseInt(timeMatch[1], 10)
          const minutes = parseInt(timeMatch[2], 10)
          const seconds = parseFloat(timeMatch[3])
          output.destination.stats.duration = hours * 3600 + minutes * 60 + seconds
        }

        const bitrateMatch = message.match(/bitrate=\s*(\d+\.?\d*)kbits/)
        if (bitrateMatch && bitrateMatch[1] && output.destination.stats) {
          output.destination.stats.currentBitrate = parseFloat(bitrateMatch[1])
        }
      })

      ffmpegProcess.on('error', (err: Error) => {
        console.error(`[MultiOutput] Error in ${output.destination.name}:`, err.message)
        output.destination.status = 'error'
        output.destination.error = err.message
        output.process = null
        this.emit('outputError', { outputId, error: err.message })

        // Attempt reconnect for streaming outputs
        if (output.destination.enabled && output.destination.type !== 'recording') {
          this.scheduleReconnect(outputId)
        }
      })

      ffmpegProcess.on('exit', (code, signal) => {
        console.log(`[MultiOutput] Ended ${output.destination.name} (code: ${code}, signal: ${signal})`)

        if (code !== 0 && output.destination.enabled) {
          output.destination.status = 'error'
          output.destination.error = `FFmpeg exited with code ${code}`

          // Attempt reconnect for streaming outputs
          if (output.destination.type !== 'recording') {
            this.scheduleReconnect(outputId)
          }
        } else {
          output.destination.status = 'idle'
        }

        output.process = null
        this.emit('outputEnded', { outputId })
      })

    } catch (error) {
      output.destination.status = 'error'
      output.destination.error = error instanceof Error ? error.message : 'Unknown error'
      throw error
    }
  }

  /**
   * Stop an output
   */
  async stopOutput(outputId: string): Promise<void> {
    const output = this.outputs.get(outputId)
    if (!output) return

    output.destination.enabled = false

    // Clear any pending reconnect
    if (output.reconnectTimer) {
      clearTimeout(output.reconnectTimer)
      output.reconnectTimer = undefined
    }

    if (output.process) {
      return new Promise((resolve) => {
        const proc = output.process!

        proc.once('exit', () => {
          output.destination.status = 'idle'
          output.process = null
          resolve()
        })

        // Send SIGTERM for graceful shutdown
        proc.kill('SIGTERM')

        // Force kill after 5 seconds if still running
        setTimeout(() => {
          if (output.process) {
            output.process.kill('SIGKILL')
          }
        }, 5000)
      })
    }

    output.destination.status = 'idle'
  }

  /**
   * Get all outputs for a room
   */
  getOutputsForRoom(roomId: string): OutputDestination[] {
    const outputIds = this.roomOutputs.get(roomId)
    if (!outputIds) return []

    return Array.from(outputIds)
      .map((id) => this.outputs.get(id)?.destination)
      .filter((d): d is OutputDestination => d !== undefined)
  }

  /**
   * Get output by ID
   */
  getOutput(outputId: string): OutputDestination | undefined {
    return this.outputs.get(outputId)?.destination
  }

  /**
   * Update output configuration
   */
  async updateOutput(
    outputId: string,
    updates: Partial<Pick<OutputDestination, 'name' | 'config'>>
  ): Promise<OutputDestination | undefined> {
    const output = this.outputs.get(outputId)
    if (!output) return undefined

    if (updates.name) {
      output.destination.name = updates.name
    }

    if (updates.config) {
      output.destination.config = { ...output.destination.config, ...updates.config }
    }

    this.emit('outputUpdated', { outputId, output: output.destination })
    return output.destination
  }

  private buildFfmpegArgs(destination: OutputDestination, inputSource: string): string[] {
    const args: string[] = [
      '-re',
      '-i', inputSource,
    ]

    switch (destination.config.type) {
      case 'icecast':
        return [...args, ...this.buildIcecastArgs(destination.config)]
      case 'srt':
        return [...args, ...this.buildSrtOutputArgs(destination.config)]
      case 'recording':
        return [...args, ...this.buildRecordingArgs(destination.config)]
      default:
        throw new Error(`Unknown output type`)
    }
  }

  private buildIcecastArgs(config: IcecastConfig): string[] {
    const outputUrl = `icecast://${encodeURIComponent(config.username)}:${encodeURIComponent(
      config.password
    )}@${config.host}:${config.port}${config.mountpoint}`

    const args: string[] = [
      '-ar', String(config.sampleRate),
      '-ac', String(config.channels),
    ]

    // Format-specific options
    switch (config.format) {
      case 'mp3':
        args.push('-c:a', 'libmp3lame', '-b:a', `${config.bitrate}k`, '-f', 'mp3')
        break
      case 'ogg':
        args.push('-c:a', 'libvorbis', '-b:a', `${config.bitrate}k`, '-f', 'ogg')
        break
      case 'opus':
        args.push('-c:a', 'libopus', '-b:a', `${config.bitrate}k`, '-f', 'ogg')
        break
      case 'aac':
        args.push('-c:a', 'aac', '-b:a', `${config.bitrate}k`, '-f', 'adts')
        break
    }

    // Icecast metadata
    if (config.iceName) args.push('-ice_name', config.iceName)
    if (config.iceDescription) args.push('-ice_description', config.iceDescription)
    if (config.iceUrl) args.push('-ice_url', config.iceUrl)
    if (config.iceGenre) args.push('-ice_genre', config.iceGenre)
    if (config.icePublic !== undefined) args.push('-ice_public', config.icePublic ? '1' : '0')

    args.push(outputUrl)

    return args
  }

  private buildSrtOutputArgs(config: SrtOutputConfig): string[] {
    let outputUrl = `srt://${config.host}:${config.port}?mode=caller`
    if (config.streamId) outputUrl += `&streamid=${encodeURIComponent(config.streamId)}`
    if (config.passphrase) outputUrl += `&passphrase=${encodeURIComponent(config.passphrase)}`
    outputUrl += `&latency=${config.latency * 1000}` // Convert to microseconds

    const args: string[] = [
      '-ar', String(config.sampleRate),
      '-ac', String(config.channels),
    ]

    // Codec-specific options
    switch (config.codec) {
      case 'opus':
        args.push('-c:a', 'libopus', '-b:a', `${config.bitrate}k`, '-f', 'ogg')
        break
      case 'aac':
        args.push('-c:a', 'aac', '-b:a', `${config.bitrate}k`, '-f', 'adts')
        break
      case 'pcm':
        args.push('-c:a', 'pcm_s16le', '-f', 's16le')
        break
    }

    args.push(outputUrl)

    return args
  }

  private buildRecordingArgs(config: RecordingConfig): string[] {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = config.filename || `recording-${timestamp}`
    const outputPath = path.join(
      config.outputDir || this.recordingsDir,
      `${filename}.${config.format}`
    )

    const args: string[] = [
      '-ar', String(config.sampleRate),
      '-ac', String(config.channels),
    ]

    // Format-specific options
    switch (config.format) {
      case 'wav':
        args.push('-c:a', 'pcm_s16le', '-f', 'wav')
        break
      case 'mp3':
        args.push('-c:a', 'libmp3lame', '-b:a', `${config.bitrate || 192}k`, '-f', 'mp3')
        break
      case 'flac':
        args.push('-c:a', 'flac', '-f', 'flac')
        break
      case 'ogg':
        args.push('-c:a', 'libvorbis', '-b:a', `${config.bitrate || 192}k`, '-f', 'ogg')
        break
    }

    // Duration limit
    if (config.maxDuration) {
      args.push('-t', String(config.maxDuration))
    }

    // Segment/split recording
    if (config.splitEvery) {
      args.push('-f', 'segment', '-segment_time', String(config.splitEvery))
      const segmentPath = path.join(
        config.outputDir || this.recordingsDir,
        `${filename}-%03d.${config.format}`
      )
      args.push(segmentPath)
    } else {
      args.push(outputPath)
    }

    return args
  }

  private scheduleReconnect(outputId: string): void {
    const output = this.outputs.get(outputId)
    if (!output || !output.destination.enabled || !output.inputSource) return

    output.reconnectAttempts++
    const delay = Math.min(30000, 1000 * Math.pow(2, output.reconnectAttempts - 1)) // Exponential backoff, max 30s

    console.log(
      `[MultiOutput] Scheduling reconnect for ${output.destination.name} in ${delay}ms (attempt ${output.reconnectAttempts})`
    )

    output.destination.status = 'reconnecting'
    this.emit('outputStatusChanged', { outputId, status: 'reconnecting' })

    output.reconnectTimer = setTimeout(async () => {
      try {
        await this.startOutput(outputId, output.inputSource!)
      } catch (error) {
        console.error(`[MultiOutput] Reconnect failed for ${output.destination.name}:`, error)
      }
    }, delay)
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

export const multiOutputService = new MultiOutputService()
