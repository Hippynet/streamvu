import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { busEncoderService } from './busEncoder.service.js'
import type {
  AudioOutput,
  CreateAudioOutputRequest,
  UpdateAudioOutputRequest,
  AudioOutputType,
  AudioChannel,
  SRTMode,
  BusRoutingConfig,
} from '@streamvu/shared'

class AudioOutputService {
  /**
   * List all audio outputs for a room
   */
  async listOutputs(roomId: string, organizationId: string): Promise<AudioOutput[]> {
    // Verify room belongs to organization
    const room = await prisma.callRoom.findFirst({
      where: { id: roomId, organizationId },
    })

    if (!room) {
      throw new Error('Room not found')
    }

    const outputs = await prisma.audioOutput.findMany({
      where: { roomId },
      orderBy: { createdAt: 'asc' },
    })

    return outputs.map(this.formatOutput)
  }

  /**
   * Get a single audio output
   */
  async getOutput(outputId: string, roomId: string, organizationId: string): Promise<AudioOutput> {
    // Verify room belongs to organization
    const room = await prisma.callRoom.findFirst({
      where: { id: roomId, organizationId },
    })

    if (!room) {
      throw new Error('Room not found')
    }

    const output = await prisma.audioOutput.findFirst({
      where: { id: outputId, roomId },
    })

    if (!output) {
      throw new Error('Audio output not found')
    }

    return this.formatOutput(output)
  }

  /**
   * Create a new audio output
   */
  async createOutput(
    roomId: string,
    organizationId: string,
    data: CreateAudioOutputRequest
  ): Promise<AudioOutput> {
    // Verify room belongs to organization
    const room = await prisma.callRoom.findFirst({
      where: { id: roomId, organizationId },
    })

    if (!room) {
      throw new Error('Room not found')
    }

    // Validate Icecast configuration
    if (data.type === 'ICECAST') {
      if (!data.icecastHost || !data.icecastPort || !data.icecastMount) {
        throw new Error('Icecast host, port, and mount point are required')
      }
    }

    const output = await prisma.audioOutput.create({
      data: {
        roomId,
        name: data.name,
        type: data.type,
        channel: data.channel,
        icecastHost: data.icecastHost || null,
        icecastPort: data.icecastPort || null,
        icecastMount: data.icecastMount || null,
        icecastUsername: data.icecastUsername || 'source',
        icecastPassword: data.icecastPassword || null,
        icecastPublic: data.icecastPublic ?? false,
        icecastName: data.icecastName || null,
        icecastDescription: data.icecastDescription || null,
        icecastGenre: data.icecastGenre || null,
        icecastUrl: data.icecastUrl || null,
        codec: data.codec || 'mp3',
        bitrate: data.bitrate || 128,
        sampleRate: data.sampleRate || 44100,
        channels: data.channels || 2,
        isEnabled: true,
        isActive: false,
        isConnected: false,
        errorMessage: null,
        bytesStreamed: BigInt(0),
        connectedAt: null,
      },
    })

    return this.formatOutput(output)
  }

  /**
   * Update an audio output
   */
  async updateOutput(
    outputId: string,
    roomId: string,
    organizationId: string,
    data: UpdateAudioOutputRequest
  ): Promise<AudioOutput> {
    // Verify room belongs to organization
    const room = await prisma.callRoom.findFirst({
      where: { id: roomId, organizationId },
    })

    if (!room) {
      throw new Error('Room not found')
    }

    const existing = await prisma.audioOutput.findFirst({
      where: { id: outputId, roomId },
    })

    if (!existing) {
      throw new Error('Audio output not found')
    }

    // If output is active, don't allow changing critical fields
    if (existing.isActive) {
      if (
        data.icecastHost !== undefined ||
        data.icecastPort !== undefined ||
        data.icecastMount !== undefined ||
        data.codec !== undefined
      ) {
        throw new Error('Cannot change Icecast configuration while output is active')
      }
    }

    const output = await prisma.audioOutput.update({
      where: { id: outputId },
      data: {
        name: data.name,
        channel: data.channel,
        icecastHost: data.icecastHost,
        icecastPort: data.icecastPort,
        icecastMount: data.icecastMount,
        icecastUsername: data.icecastUsername,
        icecastPassword: data.icecastPassword,
        icecastPublic: data.icecastPublic,
        icecastName: data.icecastName,
        icecastDescription: data.icecastDescription,
        icecastGenre: data.icecastGenre,
        icecastUrl: data.icecastUrl,
        codec: data.codec,
        bitrate: data.bitrate,
        sampleRate: data.sampleRate,
        channels: data.channels,
        isEnabled: data.isEnabled,
      },
    })

    return this.formatOutput(output)
  }

  /**
   * Delete an audio output
   */
  async deleteOutput(outputId: string, roomId: string, organizationId: string): Promise<void> {
    // Verify room belongs to organization
    const room = await prisma.callRoom.findFirst({
      where: { id: roomId, organizationId },
    })

    if (!room) {
      throw new Error('Room not found')
    }

    const existing = await prisma.audioOutput.findFirst({
      where: { id: outputId, roomId },
    })

    if (!existing) {
      throw new Error('Audio output not found')
    }

    // Stop output if active before deleting
    if (existing.isActive) {
      console.log(`[AudioOutputService] Stopping active encoder before deleting output ${outputId}`)
      await busEncoderService.stopEncoder(outputId)
    }

    await prisma.audioOutput.delete({
      where: { id: outputId },
    })
  }

  /**
   * Update bus routing configuration for an output
   */
  async updateBusRouting(
    outputId: string,
    roomId: string,
    organizationId: string,
    busRouting: BusRoutingConfig
  ): Promise<AudioOutput> {
    // Verify room belongs to organization
    const room = await prisma.callRoom.findFirst({
      where: { id: roomId, organizationId },
    })

    if (!room) {
      throw new Error('Room not found')
    }

    const existing = await prisma.audioOutput.findFirst({
      where: { id: outputId, roomId },
    })

    if (!existing) {
      throw new Error('Audio output not found')
    }

    // Clean up routing - remove zero-level entries
    const cleanedRouting: Record<string, number> = {}
    if (busRouting.pgm && busRouting.pgm > 0) cleanedRouting.pgm = busRouting.pgm
    if (busRouting.tb && busRouting.tb > 0) cleanedRouting.tb = busRouting.tb
    if (busRouting.aux1 && busRouting.aux1 > 0) cleanedRouting.aux1 = busRouting.aux1
    if (busRouting.aux2 && busRouting.aux2 > 0) cleanedRouting.aux2 = busRouting.aux2
    if (busRouting.aux3 && busRouting.aux3 > 0) cleanedRouting.aux3 = busRouting.aux3
    if (busRouting.aux4 && busRouting.aux4 > 0) cleanedRouting.aux4 = busRouting.aux4

    const output = await prisma.audioOutput.update({
      where: { id: outputId },
      data: {
        busRouting: Object.keys(cleanedRouting).length > 0 ? cleanedRouting : Prisma.JsonNull,
      },
    })

    return this.formatOutput(output)
  }

  /**
   * Update output status (called by output streaming service)
   */
  async updateOutputStatus(
    outputId: string,
    status: {
      isActive?: boolean
      isConnected?: boolean
      errorMessage?: string | null
      bytesStreamed?: bigint
      connectedAt?: Date | null
    }
  ): Promise<AudioOutput> {
    const output = await prisma.audioOutput.update({
      where: { id: outputId },
      data: status,
    })

    return this.formatOutput(output)
  }

  /**
   * Format database record to API response
   */
  private formatOutput(output: {
    id: string
    roomId: string
    name: string
    type: string
    channel: string
    busRouting: unknown | null
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
    srtMaxBw: number | null
    codec: string
    bitrate: number
    sampleRate: number
    channels: number
    isEnabled: boolean
    isActive: boolean
    isConnected: boolean
    errorMessage: string | null
    bytesStreamed: bigint
    connectedAt: Date | null
    createdAt: Date
    updatedAt: Date
  }): AudioOutput {
    return {
      id: output.id,
      roomId: output.roomId,
      name: output.name,
      type: output.type as AudioOutputType,
      channel: output.channel as AudioChannel,
      busRouting: output.busRouting as BusRoutingConfig | null,
      // Icecast config
      icecastHost: output.icecastHost,
      icecastPort: output.icecastPort,
      icecastMount: output.icecastMount,
      icecastUsername: output.icecastUsername,
      // Never expose password in API response
      icecastPublic: output.icecastPublic,
      icecastName: output.icecastName,
      icecastDescription: output.icecastDescription,
      icecastGenre: output.icecastGenre,
      icecastUrl: output.icecastUrl,
      // SRT config
      srtHost: output.srtHost,
      srtPort: output.srtPort,
      srtMode: output.srtMode as SRTMode | null,
      srtStreamId: output.srtStreamId,
      // Never expose passphrase in API response
      srtLatency: output.srtLatency,
      srtMaxBw: output.srtMaxBw,
      // Encoding
      codec: output.codec,
      bitrate: output.bitrate,
      sampleRate: output.sampleRate,
      channels: output.channels,
      isEnabled: output.isEnabled,
      isActive: output.isActive,
      isConnected: output.isConnected,
      errorMessage: output.errorMessage,
      bytesStreamed: output.bytesStreamed.toString(),
      connectedAt: output.connectedAt?.toISOString() || null,
      createdAt: output.createdAt.toISOString(),
      updatedAt: output.updatedAt.toISOString(),
    }
  }
}

export const audioOutputService = new AudioOutputService()
