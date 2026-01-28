import { prisma } from '../lib/prisma.js'
import { AppError } from '../middleware/errorHandler.js'
import type {
  Stream,
  StreamWithHealth,
  StreamHealthCheck,
  CreateStreamRequest,
  UpdateStreamRequest,
} from '@streamvu/shared'
import { API_ERROR_CODES } from '@streamvu/shared'
import { checkStream } from './healthCheck.service.js'

function mapStream(stream: {
  id: string
  name: string
  url: string
  mountPoint: string | null
  organizationId: string
  displayOrder: number
  isVisible: boolean
  createdAt: Date
  updatedAt: Date
}): Stream {
  return {
    id: stream.id,
    name: stream.name,
    url: stream.url,
    mountPoint: stream.mountPoint,
    organizationId: stream.organizationId,
    displayOrder: stream.displayOrder,
    isVisible: stream.isVisible,
    createdAt: stream.createdAt.toISOString(),
    updatedAt: stream.updatedAt.toISOString(),
  }
}

function mapHealthCheck(check: {
  id: string
  streamId: string
  isOnline: boolean
  bitrate: number | null
  listeners: number | null
  responseMs: number | null
  checkedAt: Date
  contentType: string | null
  codec: string | null
  sampleRate: number | null
  channels: number | null
  serverType: string | null
  stationName: string | null
  genre: string | null
  currentTitle: string | null
  serverDesc: string | null
  icyUrl: string | null
  icyPub: boolean | null
  audioInfo: string | null
}): StreamHealthCheck {
  return {
    id: check.id,
    streamId: check.streamId,
    isOnline: check.isOnline,
    bitrate: check.bitrate,
    listeners: check.listeners,
    responseMs: check.responseMs,
    checkedAt: check.checkedAt.toISOString(),
    contentType: check.contentType,
    codec: check.codec,
    sampleRate: check.sampleRate,
    channels: check.channels,
    serverType: check.serverType,
    stationName: check.stationName,
    genre: check.genre,
    currentTitle: check.currentTitle,
    serverDesc: check.serverDesc,
    icyUrl: check.icyUrl,
    icyPub: check.icyPub,
    audioInfo: check.audioInfo,
  }
}

class StreamService {
  async getStreams(organizationId: string): Promise<StreamWithHealth[]> {
    const streams = await prisma.stream.findMany({
      where: { organizationId },
      orderBy: { displayOrder: 'asc' },
      include: {
        healthChecks: {
          orderBy: { checkedAt: 'desc' },
          take: 1,
        },
      },
    })

    return streams.map((stream: (typeof streams)[number]) => ({
      ...mapStream(stream),
      latestHealth: stream.healthChecks[0] ? mapHealthCheck(stream.healthChecks[0]) : null,
    }))
  }

  async getStream(id: string, organizationId: string): Promise<StreamWithHealth> {
    const stream = await prisma.stream.findFirst({
      where: { id, organizationId },
      include: {
        healthChecks: {
          orderBy: { checkedAt: 'desc' },
          take: 1,
        },
      },
    })

    if (!stream) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'Stream not found')
    }

    return {
      ...mapStream(stream),
      latestHealth: stream.healthChecks[0] ? mapHealthCheck(stream.healthChecks[0]) : null,
    }
  }

  async createStream(organizationId: string, data: CreateStreamRequest): Promise<Stream> {
    // Check stream limit
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: { _count: { select: { streams: true } } },
    })

    if (!organization) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'Organization not found')
    }

    if (organization._count.streams >= organization.maxStreams) {
      throw new AppError(
        400,
        API_ERROR_CODES.STREAM_LIMIT_REACHED,
        'Stream limit reached for this organization'
      )
    }

    // Check for duplicate URL
    const existing = await prisma.stream.findUnique({
      where: { organizationId_url: { organizationId, url: data.url } },
    })

    if (existing) {
      throw new AppError(409, API_ERROR_CODES.CONFLICT, 'A stream with this URL already exists')
    }

    const stream = await prisma.stream.create({
      data: {
        ...data,
        organizationId,
      },
    })

    // Trigger immediate health check (don't await - let it run in background)
    checkStream(data.url)
      .then(async (stats) => {
        await prisma.streamHealthCheck.create({
          data: {
            streamId: stream.id,
            isOnline: stats.isOnline,
            bitrate: stats.bitrate ?? null,
            listeners: stats.listeners ?? null,
            responseMs: stats.responseMs ?? null,
            contentType: stats.contentType ?? null,
            codec: stats.codec ?? null,
            sampleRate: stats.sampleRate ?? null,
            channels: stats.channels ?? null,
            serverType: stats.serverType ?? null,
            stationName: stats.stationName ?? null,
            genre: stats.genre ?? null,
            currentTitle: stats.currentTitle ?? null,
            serverDesc: stats.serverDesc ?? null,
            icyUrl: stats.icyUrl ?? null,
            icyPub: stats.icyPub ?? null,
            audioInfo: stats.audioInfo ?? null,
          },
        })
        console.log(
          `[HealthCheck] Initial check for ${data.url}: ${stats.isOnline ? 'ONLINE' : 'OFFLINE'}`
        )
      })
      .catch((err) => {
        console.error(`[HealthCheck] Initial check failed for ${data.url}:`, err)
      })

    return mapStream(stream)
  }

  async updateStream(id: string, organizationId: string, data: UpdateStreamRequest): Promise<Stream> {
    const existing = await prisma.stream.findFirst({
      where: { id, organizationId },
    })

    if (!existing) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'Stream not found')
    }

    // Check for duplicate URL if URL is being changed
    if (data.url && data.url !== existing.url) {
      const duplicate = await prisma.stream.findUnique({
        where: { organizationId_url: { organizationId, url: data.url } },
      })

      if (duplicate) {
        throw new AppError(409, API_ERROR_CODES.CONFLICT, 'A stream with this URL already exists')
      }
    }

    const stream = await prisma.stream.update({
      where: { id },
      data,
    })

    return mapStream(stream)
  }

  async deleteStream(id: string, organizationId: string): Promise<void> {
    const existing = await prisma.stream.findFirst({
      where: { id, organizationId },
    })

    if (!existing) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'Stream not found')
    }

    await prisma.stream.delete({ where: { id } })
  }

  async getStreamHealth(
    id: string,
    organizationId: string,
    limit: number
  ): Promise<StreamHealthCheck[]> {
    const stream = await prisma.stream.findFirst({
      where: { id, organizationId },
    })

    if (!stream) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'Stream not found')
    }

    const healthChecks = await prisma.streamHealthCheck.findMany({
      where: { streamId: id },
      orderBy: { checkedAt: 'desc' },
      take: limit,
    })

    return healthChecks.map(mapHealthCheck)
  }

  async recordHealthCheck(
    streamId: string,
    data: { isOnline: boolean; bitrate?: number; listeners?: number; responseMs?: number }
  ): Promise<void> {
    await prisma.streamHealthCheck.create({
      data: {
        streamId,
        isOnline: data.isOnline,
        bitrate: data.bitrate ?? null,
        listeners: data.listeners ?? null,
        responseMs: data.responseMs ?? null,
      },
    })
  }
}

export const streamService = new StreamService()
