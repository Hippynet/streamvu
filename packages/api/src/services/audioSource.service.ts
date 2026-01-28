import { prisma } from '../lib/prisma.js'
import type {
  AudioSource,
  CreateAudioSourceRequest,
  UpdateAudioSourceRequest,
  AudioSourceType,
  AudioChannel,
  PlaybackState,
  SRTMode,
  SRTConnectionState,
} from '@streamvu/shared'

class AudioSourceService {
  /**
   * List all audio sources for a room
   */
  async listSources(roomId: string, organizationId: string): Promise<AudioSource[]> {
    // Verify room belongs to organization
    const room = await prisma.callRoom.findFirst({
      where: { id: roomId, organizationId },
    })

    if (!room) {
      throw new Error('Room not found')
    }

    const sources = await prisma.audioSource.findMany({
      where: { roomId },
      include: { file: true },
      orderBy: { createdAt: 'asc' },
    })

    return sources.map(this.formatSource)
  }

  /**
   * Get a single audio source
   */
  async getSource(sourceId: string, roomId: string, organizationId: string): Promise<AudioSource> {
    // Verify room belongs to organization
    const room = await prisma.callRoom.findFirst({
      where: { id: roomId, organizationId },
    })

    if (!room) {
      throw new Error('Room not found')
    }

    const source = await prisma.audioSource.findFirst({
      where: { id: sourceId, roomId },
      include: { file: true },
    })

    if (!source) {
      throw new Error('Audio source not found')
    }

    return this.formatSource(source)
  }

  /**
   * Create a new audio source
   */
  async createSource(
    roomId: string,
    organizationId: string,
    data: CreateAudioSourceRequest
  ): Promise<AudioSource> {
    // Verify room belongs to organization
    const room = await prisma.callRoom.findFirst({
      where: { id: roomId, organizationId },
    })

    if (!room) {
      throw new Error('Room not found')
    }

    // Validate based on type
    if (data.type === 'HTTP_STREAM' && !data.streamUrl) {
      throw new Error('Stream URL is required for HTTP stream sources')
    }

    if (data.type === 'FILE' && !data.fileId) {
      throw new Error('File ID is required for file sources')
    }

    // Validate SRT source
    if (data.type === 'SRT_STREAM') {
      if (!data.srtMode) {
        throw new Error('SRT mode is required for SRT stream sources')
      }
      if (data.srtMode === 'CALLER' && (!data.srtHost || !data.srtPort)) {
        throw new Error('SRT host and port are required for CALLER mode')
      }
      // Validate passphrase length if provided (SRT requires 10-79 characters)
      if (data.srtPassphrase && (data.srtPassphrase.length < 10 || data.srtPassphrase.length > 79)) {
        throw new Error('SRT passphrase must be between 10 and 79 characters')
      }
    }

    // Validate RIST source
    if (data.type === 'RIST_STREAM') {
      if (!data.ristMode) {
        throw new Error('RIST mode is required for RIST stream sources')
      }
      if (data.ristMode === 'CALLER' && !data.ristUrl) {
        throw new Error('RIST URL is required for CALLER mode')
      }
    }

    // If file source, verify file exists and belongs to organization
    if (data.fileId) {
      const file = await prisma.uploadedFile.findFirst({
        where: { id: data.fileId, organizationId },
      })

      if (!file) {
        throw new Error('File not found')
      }
    }

    const source = await prisma.audioSource.create({
      data: {
        roomId,
        type: data.type,
        name: data.name,
        streamUrl: data.streamUrl || null,
        streamFormat: data.streamFormat || null,
        fileId: data.fileId || null,
        channel: data.channel || 'PROGRAM',
        volume: data.volume ?? 1.0,
        pan: data.pan ?? 0.0,
        muted: false,
        playbackState: 'STOPPED',
        playbackPosition: 0,
        loopEnabled: false,
        isActive: false,
        errorMessage: null,
        // SRT fields
        srtHost: data.srtHost || null,
        srtPort: data.srtPort || null,
        srtMode: data.srtMode || null,
        srtStreamId: data.srtStreamId || null,
        srtPassphrase: data.srtPassphrase || null,
        srtLatency: data.srtLatency ?? 120,
        srtConnectionState: data.type === 'SRT_STREAM' ? 'DISCONNECTED' : null,
        srtListenerPort: null,
        srtRemoteAddress: null,
        // RIST fields
        ristUrl: data.ristUrl || null,
        ristMode: data.ristMode || null,
        ristProfile: data.ristProfile || 'SIMPLE',
        ristBuffer: data.ristBuffer ?? 1000,
        ristBandwidth: data.ristBandwidth || null,
        ristConnectionState: data.type === 'RIST_STREAM' ? 'DISCONNECTED' : null,
        ristListenerPort: null,
        ristRemoteAddress: null,
      },
      include: { file: true },
    })

    return this.formatSource(source)
  }

  /**
   * Update an audio source
   */
  async updateSource(
    sourceId: string,
    roomId: string,
    organizationId: string,
    data: UpdateAudioSourceRequest
  ): Promise<AudioSource> {
    // Verify room belongs to organization
    const room = await prisma.callRoom.findFirst({
      where: { id: roomId, organizationId },
    })

    if (!room) {
      throw new Error('Room not found')
    }

    const existing = await prisma.audioSource.findFirst({
      where: { id: sourceId, roomId },
    })

    if (!existing) {
      throw new Error('Audio source not found')
    }

    const source = await prisma.audioSource.update({
      where: { id: sourceId },
      data: {
        name: data.name,
        channel: data.channel,
        volume: data.volume,
        pan: data.pan,
        muted: data.muted,
        loopEnabled: data.loopEnabled,
      },
      include: { file: true },
    })

    return this.formatSource(source)
  }

  /**
   * Delete an audio source
   */
  async deleteSource(sourceId: string, roomId: string, organizationId: string): Promise<void> {
    // Verify room belongs to organization
    const room = await prisma.callRoom.findFirst({
      where: { id: roomId, organizationId },
    })

    if (!room) {
      throw new Error('Room not found')
    }

    const existing = await prisma.audioSource.findFirst({
      where: { id: sourceId, roomId },
    })

    if (!existing) {
      throw new Error('Audio source not found')
    }

    // Stop source if active before deleting
    if (existing.isActive) {
      // TODO: Stop the ingest/playback process
    }

    await prisma.audioSource.delete({
      where: { id: sourceId },
    })
  }

  /**
   * Update source playback state (called by ingest/playback services)
   */
  async updateSourceState(
    sourceId: string,
    state: {
      playbackState?: PlaybackState
      playbackPosition?: number
      isActive?: boolean
      errorMessage?: string | null
    }
  ): Promise<AudioSource> {
    const source = await prisma.audioSource.update({
      where: { id: sourceId },
      data: state,
      include: { file: true },
    })

    return this.formatSource(source)
  }

  /**
   * Format database record to API response
   */
  private formatSource(source: {
    id: string
    roomId: string
    type: string
    name: string
    streamUrl: string | null
    streamFormat: string | null
    fileId: string | null
    channel: string
    volume: number
    pan: number
    muted: boolean
    playbackState: string
    playbackPosition: number
    loopEnabled: boolean
    isActive: boolean
    errorMessage: string | null
    createdAt: Date
    updatedAt: Date
    // SRT fields
    srtHost: string | null
    srtPort: number | null
    srtMode: string | null
    srtStreamId: string | null
    srtPassphrase: string | null
    srtLatency: number | null
    srtConnectionState: string | null
    srtListenerPort: number | null
    srtRemoteAddress: string | null
    // RIST fields
    ristUrl?: string | null
    ristMode?: string | null
    ristProfile?: string | null
    ristBuffer?: number | null
    ristBandwidth?: number | null
    ristConnectionState?: string | null
    ristListenerPort?: number | null
    ristRemoteAddress?: string | null
    file?: {
      id: string
      organizationId: string
      filename: string
      storagePath: string
      mimeType: string
      size: number
      duration: number | null
      title: string | null
      artist: string | null
      album: string | null
      uploadedById: string
      createdAt: Date
    } | null
  }): AudioSource {
    return {
      id: source.id,
      roomId: source.roomId,
      type: source.type as AudioSourceType,
      name: source.name,
      streamUrl: source.streamUrl,
      streamFormat: source.streamFormat,
      fileId: source.fileId,
      channel: source.channel as AudioChannel,
      volume: source.volume,
      pan: source.pan,
      muted: source.muted,
      playbackState: source.playbackState as PlaybackState,
      playbackPosition: source.playbackPosition,
      loopEnabled: source.loopEnabled,
      isActive: source.isActive,
      errorMessage: source.errorMessage,
      createdAt: source.createdAt.toISOString(),
      updatedAt: source.updatedAt.toISOString(),
      // SRT fields
      srtHost: source.srtHost,
      srtPort: source.srtPort,
      srtMode: source.srtMode as SRTMode | null,
      srtStreamId: source.srtStreamId,
      srtPassphrase: source.srtPassphrase,
      srtLatency: source.srtLatency,
      srtConnectionState: source.srtConnectionState as SRTConnectionState | null,
      srtListenerPort: source.srtListenerPort,
      srtRemoteAddress: source.srtRemoteAddress,
      // RIST fields
      ristUrl: source.ristUrl ?? null,
      ristMode: (source.ristMode as import('@streamvu/shared').RISTMode) ?? null,
      ristProfile: (source.ristProfile as import('@streamvu/shared').RISTProfile) ?? null,
      ristBuffer: source.ristBuffer ?? null,
      ristBandwidth: source.ristBandwidth ?? null,
      ristConnectionState: (source.ristConnectionState as import('@streamvu/shared').RISTConnectionState) ?? null,
      ristListenerPort: source.ristListenerPort ?? null,
      ristRemoteAddress: source.ristRemoteAddress ?? null,
      file: source.file
        ? {
            id: source.file.id,
            organizationId: source.file.organizationId,
            filename: source.file.filename,
            storagePath: source.file.storagePath,
            mimeType: source.file.mimeType,
            size: source.file.size,
            duration: source.file.duration,
            title: source.file.title,
            artist: source.file.artist,
            album: source.file.album,
            uploadedById: source.file.uploadedById,
            createdAt: source.file.createdAt.toISOString(),
          }
        : undefined,
    }
  }
}

export const audioSourceService = new AudioSourceService()
