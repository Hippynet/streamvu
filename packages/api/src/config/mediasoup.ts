import os from 'os'
import type { RtpCodecCapability, TransportListenInfo, WorkerSettings } from 'mediasoup/types'

// Get the number of CPU cores for worker pool
const numWorkers = Math.min(os.cpus().length, 4) // Cap at 4 workers

// Get announced IP - for production, this should be the public IP
const getAnnouncedIp = (): string => {
  // First check environment variable
  if (process.env.MEDIASOUP_ANNOUNCED_IP) {
    return process.env.MEDIASOUP_ANNOUNCED_IP
  }

  // In development, use local IP or localhost
  if (process.env.NODE_ENV !== 'production') {
    return '127.0.0.1'
  }

  // Try to get the first non-internal IPv4 address
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    const netInterface = interfaces[name]
    if (!netInterface) continue
    for (const iface of netInterface) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }

  return '127.0.0.1'
}

// Worker settings
export const workerSettings: WorkerSettings = {
  logLevel: 'warn',
  logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
  rtcMinPort: parseInt(process.env.MEDIASOUP_MIN_PORT || '40000'),
  rtcMaxPort: parseInt(process.env.MEDIASOUP_MAX_PORT || '49999'),
}

// Router media codecs - optimized for broadcast audio
export const mediaCodecs: RtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    preferredPayloadType: 100,
    clockRate: 48000,
    channels: 2,
    parameters: {
      minptime: 10,
      useinbandfec: 1, // Forward Error Correction for packet loss resilience
      usedtx: 0, // Disable DTX for continuous transmission (broadcast quality)
      stereo: 1,
      'sprop-stereo': 1,
      maxaveragebitrate: 128000, // 128kbps for high quality
    },
  },
]

// WebRTC transport settings
export const webRtcTransportOptions = {
  listenInfos: [
    {
      protocol: 'udp' as const,
      ip: '0.0.0.0',
      announcedAddress: getAnnouncedIp(),
    },
    {
      protocol: 'tcp' as const,
      ip: '0.0.0.0',
      announcedAddress: getAnnouncedIp(),
    },
  ] as TransportListenInfo[],
  enableUdp: true,
  enableTcp: true,
  preferUdp: true,
  initialAvailableOutgoingBitrate: 1000000, // 1 Mbps initial
  maxIncomingBitrate: 1500000, // 1.5 Mbps max
}

// ICE servers configuration
// Default public STUN servers + optional TURN from environment
export interface IceServer {
  urls: string | string[]
  username?: string
  credential?: string
}

export const getIceServers = (): IceServer[] => {
  const iceServers: IceServer[] = [
    // Public STUN servers
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ]

  // In development, add local coturn server
  if (process.env.NODE_ENV !== 'production') {
    const turnHost = process.env.TURN_HOST || 'localhost'
    iceServers.push(
      { urls: `stun:${turnHost}:3478` },
      {
        urls: `turn:${turnHost}:3478`,
        username: process.env.TURN_USERNAME || 'streamvu',
        credential: process.env.TURN_CREDENTIAL || 'streamvu-dev-turn',
      }
    )
  }

  // Add TURN server from environment if configured (production)
  // Format: TURN_SERVER_URL=turn:turn.example.com:3478
  // TURN_SERVER_USERNAME=username
  // TURN_SERVER_CREDENTIAL=password
  if (process.env.TURN_SERVER_URL) {
    iceServers.push({
      urls: process.env.TURN_SERVER_URL,
      username: process.env.TURN_SERVER_USERNAME,
      credential: process.env.TURN_SERVER_CREDENTIAL,
    })
  }

  // Support for multiple TURN servers via JSON
  // TURN_SERVERS=[{"urls":"turn:...","username":"...","credential":"..."}]
  if (process.env.TURN_SERVERS) {
    try {
      const additionalServers = JSON.parse(process.env.TURN_SERVERS) as IceServer[]
      iceServers.push(...additionalServers)
    } catch {
      console.warn('Failed to parse TURN_SERVERS environment variable')
    }
  }

  return iceServers
}

// Export configuration
export const mediasoupConfig = {
  numWorkers,
  workerSettings,
  mediaCodecs,
  webRtcTransportOptions,
  getIceServers,
  getAnnouncedIp,
}

export default mediasoupConfig
