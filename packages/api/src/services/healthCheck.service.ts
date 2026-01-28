import { prisma } from '../lib/prisma.js'
import { STREAM_HEALTH_CHECK_INTERVAL_MS } from '@streamvu/shared'

interface IcecastStats {
  isOnline: boolean
  bitrate?: number
  listeners?: number
  responseMs?: number
  // Extended metadata
  contentType?: string
  codec?: string
  sampleRate?: number
  channels?: number
  serverType?: string
  stationName?: string
  genre?: string
  currentTitle?: string
  serverDesc?: string
  icyUrl?: string
  icyPub?: boolean
  audioInfo?: string
}

function parseAudioInfo(audioInfo: string): {
  sampleRate?: number
  channels?: number
  bitrate?: number
} {
  const result: { sampleRate?: number; channels?: number; bitrate?: number } = {}

  // Parse format: "ice-samplerate=44100;ice-bitrate=192;ice-channels=2"
  const parts = audioInfo.split(';')
  for (const part of parts) {
    const [key, value] = part.split('=')
    if (!value) continue
    if (key === 'ice-samplerate' || key === 'samplerate') {
      result.sampleRate = parseInt(value, 10)
    } else if (key === 'ice-channels' || key === 'channels') {
      result.channels = parseInt(value, 10)
    } else if (key === 'ice-bitrate' || key === 'bitrate') {
      result.bitrate = parseInt(value, 10)
    }
  }
  return result
}

function detectCodec(contentType: string): string {
  if (contentType.includes('mpeg') || contentType.includes('mp3')) return 'MP3'
  if (contentType.includes('aac') || contentType.includes('mp4')) return 'AAC'
  if (contentType.includes('ogg') || contentType.includes('vorbis')) return 'OGG'
  if (contentType.includes('opus')) return 'OPUS'
  if (contentType.includes('flac')) return 'FLAC'
  return 'Unknown'
}

function extractMetadata(response: Response): Partial<IcecastStats> {
  const metadata: Partial<IcecastStats> = {}

  // Content type
  const contentType = response.headers.get('content-type')
  if (contentType) {
    metadata.contentType = contentType
    metadata.codec = detectCodec(contentType)
  }

  // Server type detection
  const server = response.headers.get('server')
  const icyNotice = response.headers.get('icy-notice1') || response.headers.get('icy-notice2')
  if (server) {
    metadata.serverType = server
  } else if (icyNotice) {
    if (icyNotice.toLowerCase().includes('shoutcast')) {
      metadata.serverType = 'Shoutcast'
    } else if (icyNotice.toLowerCase().includes('icecast')) {
      metadata.serverType = 'Icecast'
    }
  }

  // Icy headers (standard for Icecast/Shoutcast)
  const icyBr = response.headers.get('icy-br')
  const icySr = response.headers.get('icy-sr')
  const icyName = response.headers.get('icy-name')
  const icyGenre = response.headers.get('icy-genre')
  const icyUrl = response.headers.get('icy-url')
  const icyPub = response.headers.get('icy-pub')
  const icyDesc = response.headers.get('icy-description')
  const icyAudioInfo =
    response.headers.get('ice-audio-info') || response.headers.get('icy-audio-info')

  if (icyBr) metadata.bitrate = parseInt(icyBr, 10)
  if (icySr) metadata.sampleRate = parseInt(icySr, 10)
  if (icyName) metadata.stationName = icyName
  if (icyGenre) metadata.genre = icyGenre
  if (icyUrl) metadata.icyUrl = icyUrl
  if (icyPub) metadata.icyPub = icyPub === '1'
  if (icyDesc) metadata.serverDesc = icyDesc
  if (icyAudioInfo) {
    metadata.audioInfo = icyAudioInfo
    const parsed = parseAudioInfo(icyAudioInfo)
    if (!metadata.sampleRate && parsed.sampleRate) metadata.sampleRate = parsed.sampleRate
    if (!metadata.bitrate && parsed.bitrate) metadata.bitrate = parsed.bitrate
    if (parsed.channels) metadata.channels = parsed.channels
  }

  return metadata
}

async function checkStream(url: string): Promise<IcecastStats> {
  const startTime = Date.now()

  // Always try GET request with Icy-MetaData header to get full metadata
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'StreamVU Health Checker/1.0',
        'Icy-MetaData': '1',
        Range: 'bytes=0-0', // Minimal data request
      },
    })

    clearTimeout(timeout)
    const responseMs = Date.now() - startTime

    // Extract all metadata from headers
    const metadata = extractMetadata(response)

    // Check if it's a valid audio stream
    const contentType = response.headers.get('content-type') || ''
    const isAudioStream =
      contentType.includes('audio') ||
      contentType.includes('mpeg') ||
      contentType.includes('ogg') ||
      contentType.includes('aac')
    const icyName = response.headers.get('icy-name')

    const isOnline = (response.ok || response.status === 206) && (isAudioStream || icyName !== null)

    return {
      isOnline,
      responseMs,
      ...metadata,
    }
  } catch (_error) {
    const responseMs = Date.now() - startTime

    // Fallback: Try HEAD request
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'StreamVU Health Checker/1.0',
        },
      })

      clearTimeout(timeout)

      const metadata = extractMetadata(response)
      const contentType = response.headers.get('content-type') || ''
      const isAudioStream =
        contentType.includes('audio') || contentType.includes('mpeg') || contentType.includes('ogg')

      return {
        isOnline: response.ok && isAudioStream,
        responseMs: Date.now() - startTime,
        ...metadata,
      }
    } catch {
      return { isOnline: false, responseMs }
    }
  }
}

async function checkAllStreams(): Promise<void> {
  const streams = await prisma.stream.findMany({
    select: { id: true, url: true, organizationId: true },
  })

  console.log(`[HealthCheck] Checking ${streams.length} streams...`)

  for (const stream of streams) {
    try {
      const stats = await checkStream(stream.url)

      await prisma.streamHealthCheck.create({
        data: {
          streamId: stream.id,
          isOnline: stats.isOnline,
          bitrate: stats.bitrate ?? null,
          listeners: stats.listeners ?? null,
          responseMs: stats.responseMs ?? null,
          // Extended metadata
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

      const codecInfo = stats.codec ? ` [${stats.codec}]` : ''
      const srInfo = stats.sampleRate ? ` ${stats.sampleRate}Hz` : ''
      const brInfo = stats.bitrate ? ` ${stats.bitrate}kbps` : ''
      console.log(
        `[HealthCheck] ${stream.url}: ${stats.isOnline ? 'ONLINE' : 'OFFLINE'}${codecInfo}${brInfo}${srInfo} (${stats.responseMs}ms)`
      )
    } catch (error) {
      console.error(`[HealthCheck] Error checking stream ${stream.id}:`, error)
    }
  }
}

let healthCheckInterval: NodeJS.Timeout | null = null

export function startHealthChecker(): void {
  if (healthCheckInterval) {
    return
  }

  console.log(
    `[HealthCheck] Starting health checker (interval: ${STREAM_HEALTH_CHECK_INTERVAL_MS}ms)`
  )

  // Run immediately on start
  checkAllStreams().catch(console.error)

  // Then run periodically
  healthCheckInterval = setInterval(() => {
    checkAllStreams().catch(console.error)
  }, STREAM_HEALTH_CHECK_INTERVAL_MS)
}

export function stopHealthChecker(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval)
    healthCheckInterval = null
    console.log('[HealthCheck] Health checker stopped')
  }
}

// Export for manual triggering
export { checkAllStreams, checkStream }
