/**
 * NDI Sender Service
 *
 * Handles the conversion of WebRTC streams to NDI output.
 * Uses grandiose (NDI library) for NDI transmission.
 *
 * Architecture:
 * 1. Receive WebRTC video/audio frames via WebSocket from StreamVU
 * 2. Decode frames if necessary
 * 3. Send to NDI using proper timing and format conversion
 */

import { EventEmitter } from 'events'

// NDI frame format types
export type NdiVideoFormat = 'UYVY' | 'BGRA' | 'BGRX' | 'RGBA' | 'RGBX'
export type NdiAudioFormat = 'float' | 'int16'

export interface NdiSenderConfig {
  name: string
  groups?: string[]
  clockVideo: boolean
  clockAudio: boolean
}

export interface VideoFrame {
  width: number
  height: number
  frameRateN: number
  frameRateD: number
  format: NdiVideoFormat
  data: Buffer
  lineStride?: number
  timecode?: number
}

export interface AudioFrame {
  sampleRate: number
  channels: number
  samplesPerChannel: number
  format: NdiAudioFormat
  data: Buffer
  timecode?: number
}

export interface NdiSenderStats {
  framesSent: number
  audioSamplesSent: number
  droppedFrames: number
  bytesTransmitted: number
  averageFrameTime: number
  isConnected: boolean
}

/**
 * NDI Sender - Transmits video and audio frames via NDI
 */
export class NdiSender extends EventEmitter {
  private config: NdiSenderConfig
  private isRunning: boolean = false
  private stats: NdiSenderStats = {
    framesSent: 0,
    audioSamplesSent: 0,
    droppedFrames: 0,
    bytesTransmitted: 0,
    averageFrameTime: 0,
    isConnected: false,
  }

  // Frame timing
  private lastFrameTime: number = 0
  private frameTimes: number[] = []

  // NDI sender instance (would be from grandiose library)
  private ndiSender: unknown = null

  constructor(config: NdiSenderConfig) {
    super()
    this.config = config
  }

  /**
   * Start the NDI sender
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('NDI sender already running')
    }

    try {
      // In a real implementation, initialize grandiose NDI sender:
      // this.ndiSender = grandiose.send({
      //   name: this.config.name,
      //   groups: this.config.groups,
      //   clockVideo: this.config.clockVideo,
      //   clockAudio: this.config.clockAudio,
      // })

      console.log(`[NDI] Sender "${this.config.name}" started`)
      this.isRunning = true
      this.stats.isConnected = true
      this.emit('started')
    } catch (error) {
      console.error('[NDI] Failed to start sender:', error)
      throw error
    }
  }

  /**
   * Stop the NDI sender
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return

    try {
      // Clean up NDI sender
      if (this.ndiSender) {
        // grandiose cleanup
        this.ndiSender = null
      }

      this.isRunning = false
      this.stats.isConnected = false
      console.log(`[NDI] Sender "${this.config.name}" stopped`)
      this.emit('stopped')
    } catch (error) {
      console.error('[NDI] Failed to stop sender:', error)
      throw error
    }
  }

  /**
   * Send a video frame
   */
  sendVideo(frame: VideoFrame): void {
    if (!this.isRunning) return

    const now = performance.now()

    // Track frame timing
    if (this.lastFrameTime > 0) {
      const frameTime = now - this.lastFrameTime
      this.frameTimes.push(frameTime)
      if (this.frameTimes.length > 30) {
        this.frameTimes.shift()
      }
      this.stats.averageFrameTime =
        this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length
    }
    this.lastFrameTime = now

    try {
      // In a real implementation:
      // this.ndiSender.video({
      //   xres: frame.width,
      //   yres: frame.height,
      //   frameRateN: frame.frameRateN,
      //   frameRateD: frame.frameRateD,
      //   fourCC: frame.format,
      //   lineStride: frame.lineStride || frame.width * 4,
      //   data: frame.data,
      //   timecode: frame.timecode,
      // })

      this.stats.framesSent++
      this.stats.bytesTransmitted += frame.data.length
    } catch (error) {
      this.stats.droppedFrames++
      this.emit('error', error)
    }
  }

  /**
   * Send an audio frame
   */
  sendAudio(frame: AudioFrame): void {
    if (!this.isRunning) return

    try {
      // In a real implementation:
      // this.ndiSender.audio({
      //   sampleRate: frame.sampleRate,
      //   channels: frame.channels,
      //   samples: frame.samplesPerChannel,
      //   data: frame.data,
      //   timecode: frame.timecode,
      // })

      this.stats.audioSamplesSent += frame.samplesPerChannel
      this.stats.bytesTransmitted += frame.data.length
    } catch (error) {
      this.emit('error', error)
    }
  }

  /**
   * Get current statistics
   */
  getStats(): NdiSenderStats {
    return { ...this.stats }
  }

  /**
   * Check if sender is running
   */
  get running(): boolean {
    return this.isRunning
  }

  /**
   * Get the NDI source name
   */
  get name(): string {
    return this.config.name
  }
}

/**
 * NDI Sender Manager - Manages multiple NDI senders
 */
export class NdiSenderManager extends EventEmitter {
  private senders: Map<string, NdiSender> = new Map()

  /**
   * Create and start a new NDI sender
   */
  async createSender(id: string, config: NdiSenderConfig): Promise<NdiSender> {
    if (this.senders.has(id)) {
      throw new Error(`Sender with id ${id} already exists`)
    }

    const sender = new NdiSender(config)

    sender.on('started', () => this.emit('sender:started', { id, name: config.name }))
    sender.on('stopped', () => this.emit('sender:stopped', { id, name: config.name }))
    sender.on('error', (error) => this.emit('sender:error', { id, error }))

    await sender.start()
    this.senders.set(id, sender)

    return sender
  }

  /**
   * Stop and remove a sender
   */
  async removeSender(id: string): Promise<void> {
    const sender = this.senders.get(id)
    if (sender) {
      await sender.stop()
      this.senders.delete(id)
    }
  }

  /**
   * Get a sender by ID
   */
  getSender(id: string): NdiSender | undefined {
    return this.senders.get(id)
  }

  /**
   * Get all sender IDs
   */
  getSenderIds(): string[] {
    return Array.from(this.senders.keys())
  }

  /**
   * Stop all senders
   */
  async stopAll(): Promise<void> {
    for (const [id] of this.senders) {
      await this.removeSender(id)
    }
  }

  /**
   * Get aggregate stats for all senders
   */
  getAllStats(): Record<string, NdiSenderStats> {
    const stats: Record<string, NdiSenderStats> = {}
    for (const [id, sender] of this.senders) {
      stats[id] = sender.getStats()
    }
    return stats
  }
}

// Export singleton manager
export const ndiManager = new NdiSenderManager()
