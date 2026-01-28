/**
 * WHIP (WebRTC HTTP Ingest Protocol) Service
 *
 * Handles WHIP ingest for accepting WebRTC streams from
 * OBS 30+, vMix, and other WHIP-compatible clients.
 *
 * WHIP Spec: https://datatracker.ietf.org/doc/draft-ietf-wish-whip/
 */

import { randomBytes } from 'crypto'
import type { WebRtcTransport, Producer, DtlsState, DtlsFingerprint, FingerprintAlgorithm } from 'mediasoup/types'
import { mediasoupService } from './mediasoup.service.js'
import { emitSourceProducerNew, emitWHIPStreamUpdate, emitWHIPStreamDeleted } from '../socket/callCenter.js'

interface WHIPStream {
  id: string
  roomId: string
  name: string
  token: string
  state: 'PENDING' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR'
  transport: WebRtcTransport | null
  producer: Producer | null
  clientIp: string | null
  clientUserAgent: string | null
  createdAt: Date
  connectedAt: Date | null
  disconnectedAt: Date | null
  errorMessage: string | null
}

interface WHIPEndpointInfo {
  ingestUrl: string
  playbackUrl: string
  token: string
  streamId: string
}

class WHIPService {
  // Map of stream ID to stream state
  private streams: Map<string, WHIPStream> = new Map()
  // Map of token to stream ID for quick lookup
  private tokenToStreamId: Map<string, string> = new Map()
  // State change callbacks
  private stateChangeCallbacks: Map<string, (stream: WHIPStream) => void> = new Map()

  /**
   * Create a new WHIP endpoint for a room
   */
  async createEndpoint(
    roomId: string,
    name: string,
    baseUrl: string
  ): Promise<{ endpoint: WHIPEndpointInfo; stream: WHIPStream }> {
    const streamId = randomBytes(8).toString('hex')
    const token = randomBytes(32).toString('hex')

    const stream: WHIPStream = {
      id: streamId,
      roomId,
      name,
      token,
      state: 'PENDING',
      transport: null,
      producer: null,
      clientIp: null,
      clientUserAgent: null,
      createdAt: new Date(),
      connectedAt: null,
      disconnectedAt: null,
      errorMessage: null,
    }

    this.streams.set(streamId, stream)
    this.tokenToStreamId.set(token, streamId)

    const endpoint: WHIPEndpointInfo = {
      ingestUrl: `${baseUrl}/whip/${roomId}/ingest/${streamId}`,
      playbackUrl: `${baseUrl}/whep/${roomId}/${streamId}`,
      token,
      streamId,
    }

    console.log(`[WHIPService] Created WHIP endpoint for room ${roomId}: ${name}`)

    return { endpoint, stream: this.serializeStream(stream) as WHIPStream }
  }

  /**
   * Validate a bearer token and return the stream ID
   */
  validateToken(token: string): string | null {
    return this.tokenToStreamId.get(token) ?? null
  }

  /**
   * Handle WHIP offer from client
   * Returns SDP answer
   */
  async handleOffer(
    streamId: string,
    sdpOffer: string,
    clientIp: string | null,
    clientUserAgent: string | null
  ): Promise<{ sdpAnswer: string; resourceUrl: string }> {
    const stream = this.streams.get(streamId)
    if (!stream) {
      throw new Error('Stream not found')
    }

    if (stream.state !== 'PENDING') {
      throw new Error(`Invalid stream state: ${stream.state}`)
    }

    stream.state = 'CONNECTING'
    stream.clientIp = clientIp
    stream.clientUserAgent = clientUserAgent
    this.notifyStateChange(stream)

    try {
      // Get or create room in mediasoup
      const room = await mediasoupService.getOrCreateRoom(stream.roomId)

      // Create a WebRTC transport for receiving
      const transport = await room.router.createWebRtcTransport({
        listenIps: [{ ip: '0.0.0.0', announcedIp: process.env.ANNOUNCED_IP || '127.0.0.1' }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        // WHIP-specific settings
        appData: { whipStreamId: streamId },
      })

      stream.transport = transport

      // Parse the SDP offer to extract media info
      const sdpAnswer = this.generateSdpAnswer(sdpOffer, transport)

      // Set up transport event handlers
      transport.on('dtlsstatechange', (dtlsState: DtlsState) => {
        console.log(`[WHIPService] Stream ${streamId} DTLS state: ${dtlsState}`)
        if (dtlsState === 'connected') {
          stream.state = 'CONNECTED'
          stream.connectedAt = new Date()
          this.notifyStateChange(stream)
        } else if (dtlsState === 'closed') {
          this.handleStreamDisconnect(streamId, undefined)
        }
      })

      transport.on('icestatechange', (iceState: string) => {
        console.log(`[WHIPService] Stream ${streamId} ICE state: ${iceState}`)
        if (iceState === 'disconnected') {
          this.handleStreamDisconnect(streamId, `ICE ${iceState}`)
        }
      })

      const resourceUrl = `/whip/${stream.roomId}/resource/${streamId}`

      console.log(`[WHIPService] WHIP offer handled for stream ${streamId}`)

      return { sdpAnswer, resourceUrl }
    } catch (error) {
      stream.state = 'ERROR'
      stream.errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.notifyStateChange(stream)
      throw error
    }
  }

  /**
   * Handle DTLS parameters from WHIP client
   */
  async handleDtlsConnect(
    streamId: string,
    dtlsParameters: { fingerprints: Array<{ algorithm: string; value: string }>; role?: string }
  ): Promise<void> {
    const stream = this.streams.get(streamId)
    if (!stream || !stream.transport) {
      throw new Error('Stream or transport not found')
    }

    // Convert fingerprints to the correct type
    const fingerprints: DtlsFingerprint[] = dtlsParameters.fingerprints.map(fp => ({
      algorithm: fp.algorithm as FingerprintAlgorithm,
      value: fp.value,
    }))

    await stream.transport.connect({
      dtlsParameters: {
        fingerprints,
        role: (dtlsParameters.role as 'auto' | 'client' | 'server') || 'auto',
      },
    })

    console.log(`[WHIPService] DTLS connected for stream ${streamId}`)
  }

  /**
   * Handle producer creation from WHIP client
   */
  async handleProducer(
    streamId: string,
    kind: 'audio' | 'video',
    rtpParameters: unknown
  ): Promise<string> {
    const stream = this.streams.get(streamId)
    if (!stream || !stream.transport) {
      throw new Error('Stream or transport not found')
    }

    const producer = await stream.transport.produce({
      kind,
      rtpParameters: rtpParameters as Parameters<WebRtcTransport['produce']>[0]['rtpParameters'],
    })

    stream.producer = producer

    producer.on('transportclose', () => {
      console.log(`[WHIPService] Producer ${producer.id} transport closed`)
    })

    // Notify call center about new producer for mixer integration
    emitSourceProducerNew(stream.roomId, `whip:${streamId}`, producer.id, stream.name)

    console.log(`[WHIPService] Producer created for stream ${streamId}: ${producer.id}`)

    return producer.id
  }

  /**
   * Handle ICE candidate from WHIP client
   */
  async handleIceCandidate(
    streamId: string,
    candidate: { candidate: string; sdpMid: string; sdpMLineIndex: number }
  ): Promise<void> {
    const stream = this.streams.get(streamId)
    if (!stream || !stream.transport) {
      throw new Error('Stream or transport not found')
    }

    // mediasoup handles ICE internally, but we can log it
    console.log(`[WHIPService] ICE candidate for stream ${streamId}: ${candidate.candidate}`)
  }

  /**
   * Delete a WHIP stream (teardown)
   */
  async deleteStream(streamId: string): Promise<void> {
    const stream = this.streams.get(streamId)
    if (!stream) return

    // Close producer
    if (stream.producer) {
      stream.producer.close()
    }

    // Close transport
    if (stream.transport) {
      stream.transport.close()
    }

    stream.state = 'DISCONNECTED'
    stream.disconnectedAt = new Date()
    this.notifyStateChange(stream)

    // Emit socket event for deletion
    emitWHIPStreamDeleted(stream.roomId, streamId)

    // Clean up
    this.tokenToStreamId.delete(stream.token)
    this.streams.delete(streamId)
    this.stateChangeCallbacks.delete(streamId)

    console.log(`[WHIPService] Stream ${streamId} deleted`)
  }

  /**
   * Get stream by ID
   */
  getStream(streamId: string): WHIPStream | undefined {
    const stream = this.streams.get(streamId)
    return stream ? this.serializeStream(stream) as WHIPStream : undefined
  }

  /**
   * Get all streams for a room
   */
  getStreamsForRoom(roomId: string): WHIPStream[] {
    const streams: WHIPStream[] = []
    for (const stream of this.streams.values()) {
      if (stream.roomId === roomId) {
        streams.push(this.serializeStream(stream) as WHIPStream)
      }
    }
    return streams
  }

  /**
   * Register a state change callback
   */
  onStateChange(streamId: string, callback: (stream: WHIPStream) => void): void {
    this.stateChangeCallbacks.set(streamId, callback)
  }

  /**
   * Handle stream disconnect
   */
  private handleStreamDisconnect(streamId: string, reason?: string): void {
    const stream = this.streams.get(streamId)
    if (!stream) return

    if (stream.state !== 'DISCONNECTED' && stream.state !== 'ERROR') {
      stream.state = reason ? 'ERROR' : 'DISCONNECTED'
      stream.errorMessage = reason || null
      stream.disconnectedAt = new Date()
      this.notifyStateChange(stream)
    }
  }

  /**
   * Notify state change callback and emit socket event
   */
  private notifyStateChange(stream: WHIPStream): void {
    const callback = this.stateChangeCallbacks.get(stream.id)
    if (callback) {
      callback(this.serializeStream(stream) as WHIPStream)
    }

    // Emit socket event to room
    emitWHIPStreamUpdate(stream.roomId, {
      id: stream.id,
      roomId: stream.roomId,
      name: stream.name,
      token: stream.token,
      state: stream.state,
      clientIp: stream.clientIp,
      clientUserAgent: stream.clientUserAgent,
      createdAt: stream.createdAt,
      connectedAt: stream.connectedAt,
      disconnectedAt: stream.disconnectedAt,
      errorMessage: stream.errorMessage,
    })
  }

  /**
   * Serialize stream for external use (remove mediasoup objects)
   */
  private serializeStream(stream: WHIPStream): Omit<WHIPStream, 'transport' | 'producer'> {
    return {
      id: stream.id,
      roomId: stream.roomId,
      name: stream.name,
      token: stream.token,
      state: stream.state,
      clientIp: stream.clientIp,
      clientUserAgent: stream.clientUserAgent,
      createdAt: stream.createdAt,
      connectedAt: stream.connectedAt,
      disconnectedAt: stream.disconnectedAt,
      errorMessage: stream.errorMessage,
    }
  }

  /**
   * Generate SDP answer from offer and transport
   * Properly parses the offer and generates a compliant SDP answer for WHIP
   */
  private generateSdpAnswer(sdpOffer: string, transport: WebRtcTransport): string {
    const iceParams = transport.iceParameters
    const dtlsParams = transport.dtlsParameters
    const iceCandidates = transport.iceCandidates

    // Parse the offer to extract media sections
    const offerLines = sdpOffer.split(/\r?\n/)
    const mediaSections = this.parseMediaSections(offerLines)

    // Build SDP answer with proper structure
    const sessionId = Date.now()
    let sdp = ''

    // Session description
    sdp += 'v=0\r\n'
    sdp += `o=- ${sessionId} 1 IN IP4 127.0.0.1\r\n`
    sdp += 's=StreamVU WHIP\r\n'
    sdp += 't=0 0\r\n'

    // Bundle all media sections
    if (mediaSections.length > 0) {
      const mids = mediaSections.map(m => m.mid).filter(Boolean)
      if (mids.length > 0) {
        sdp += `a=group:BUNDLE ${mids.join(' ')}\r\n`
      }
    }

    // Add ICE options
    sdp += 'a=ice-options:trickle\r\n'

    // Add DTLS fingerprint at session level
    for (const fingerprint of dtlsParams.fingerprints) {
      sdp += `a=fingerprint:${fingerprint.algorithm} ${fingerprint.value}\r\n`
    }

    // Build each media section
    for (let i = 0; i < mediaSections.length; i++) {
      const mediaSection = mediaSections[i]!
      const port = i === 0 ? 9 : 0 // First media gets port 9, others get 0 for bundle

      // Media line (m=)
      sdp += `m=${mediaSection.type} ${port} UDP/TLS/RTP/SAVPF ${mediaSection.payloadTypes.join(' ')}\r\n`

      // Connection info
      sdp += 'c=IN IP4 0.0.0.0\r\n'

      // RTCP attribute
      sdp += 'a=rtcp:9 IN IP4 0.0.0.0\r\n'

      // ICE credentials
      sdp += `a=ice-ufrag:${iceParams.usernameFragment}\r\n`
      sdp += `a=ice-pwd:${iceParams.password}\r\n`

      // ICE candidates
      for (const candidate of iceCandidates) {
        const candidateLine = `candidate:${candidate.foundation} 1 ${candidate.protocol.toUpperCase()} ${candidate.priority} ${candidate.ip} ${candidate.port} typ ${candidate.type}`
        sdp += `a=${candidateLine}\r\n`
      }
      sdp += 'a=end-of-candidates\r\n'

      // DTLS setup (passive for server receiving WHIP)
      sdp += 'a=setup:passive\r\n'

      // Media ID
      if (mediaSection.mid) {
        sdp += `a=mid:${mediaSection.mid}\r\n`
      }

      // Direction - server receives, so recvonly
      sdp += 'a=recvonly\r\n'

      // RTP/RTCP mux
      sdp += 'a=rtcp-mux\r\n'
      if (mediaSection.hasRtcpRsize) {
        sdp += 'a=rtcp-rsize\r\n'
      }

      // Codec parameters (rtpmap, fmtp, rtcp-fb)
      for (const codec of mediaSection.codecs) {
        sdp += `a=rtpmap:${codec.payloadType} ${codec.name}/${codec.clockRate}${codec.channels ? '/' + codec.channels : ''}\r\n`
        if (codec.fmtp) {
          sdp += `a=fmtp:${codec.payloadType} ${codec.fmtp}\r\n`
        }
        for (const fb of codec.rtcpFeedback) {
          sdp += `a=rtcp-fb:${codec.payloadType} ${fb}\r\n`
        }
      }

      // Header extensions
      for (const ext of mediaSection.extensions) {
        sdp += `a=extmap:${ext.id} ${ext.uri}\r\n`
      }

      // SSRC (use 0 for answer, client will send)
      if (mediaSection.ssrc) {
        sdp += `a=ssrc:${mediaSection.ssrc} cname:streamvu\r\n`
      }
    }

    return sdp
  }

  /**
   * Parse media sections from SDP offer
   */
  private parseMediaSections(lines: string[]): MediaSection[] {
    const sections: MediaSection[] = []
    let currentSection: MediaSection | null = null

    for (const line of lines) {
      if (line.startsWith('m=')) {
        // Start of new media section
        const match = line.match(/^m=(\w+)\s+\d+\s+[\w/]+\s+(.+)$/)
        if (match && match[1] && match[2]) {
          currentSection = {
            type: match[1] as 'audio' | 'video',
            payloadTypes: match[2].split(' ').map(Number).filter(n => !isNaN(n)),
            codecs: [],
            extensions: [],
            mid: null,
            ssrc: null,
            hasRtcpRsize: false,
          }
          sections.push(currentSection)
        }
      } else if (currentSection) {
        // Parse attributes for current media section
        if (line.startsWith('a=mid:')) {
          currentSection.mid = line.slice(6)
        } else if (line.startsWith('a=rtpmap:')) {
          const match = line.match(/^a=rtpmap:(\d+)\s+([\w-]+)\/(\d+)(?:\/(\d+))?$/)
          if (match && match[1] && match[2] && match[3]) {
            const pt = parseInt(match[1])
            let codec = currentSection.codecs.find(c => c.payloadType === pt)
            if (!codec) {
              codec = {
                payloadType: pt,
                name: match[2],
                clockRate: parseInt(match[3]),
                channels: match[4] ? parseInt(match[4]) : undefined,
                fmtp: null,
                rtcpFeedback: [],
              }
              currentSection.codecs.push(codec)
            }
          }
        } else if (line.startsWith('a=fmtp:')) {
          const match = line.match(/^a=fmtp:(\d+)\s+(.+)$/)
          if (match && match[1] && match[2]) {
            const pt = parseInt(match[1])
            const codec = currentSection.codecs.find(c => c.payloadType === pt)
            if (codec) {
              codec.fmtp = match[2]
            }
          }
        } else if (line.startsWith('a=rtcp-fb:')) {
          const match = line.match(/^a=rtcp-fb:(\d+|\*)\s+(.+)$/)
          if (match && match[1] && match[2]) {
            const pt = match[1] === '*' ? null : parseInt(match[1])
            const fb = match[2]
            for (const codec of currentSection.codecs) {
              if (pt === null || codec.payloadType === pt) {
                codec.rtcpFeedback.push(fb)
              }
            }
          }
        } else if (line.startsWith('a=extmap:')) {
          const match = line.match(/^a=extmap:(\d+)(?:\/\w+)?\s+(.+)$/)
          if (match && match[1] && match[2]) {
            const uriParts = match[2].split(' ')
            currentSection.extensions.push({
              id: parseInt(match[1]),
              uri: uriParts[0] || match[2], // Remove any direction attributes
            })
          }
        } else if (line.startsWith('a=ssrc:')) {
          const match = line.match(/^a=ssrc:(\d+)\s+/)
          if (match && match[1] && !currentSection.ssrc) {
            currentSection.ssrc = parseInt(match[1])
          }
        } else if (line === 'a=rtcp-rsize') {
          currentSection.hasRtcpRsize = true
        }
      }
    }

    return sections
  }
}

// Helper interfaces for SDP parsing
interface MediaSection {
  type: 'audio' | 'video'
  payloadTypes: number[]
  codecs: CodecInfo[]
  extensions: ExtensionInfo[]
  mid: string | null
  ssrc: number | null
  hasRtcpRsize: boolean
}

interface CodecInfo {
  payloadType: number
  name: string
  clockRate: number
  channels?: number
  fmtp: string | null
  rtcpFeedback: string[]
}

interface ExtensionInfo {
  id: number
  uri: string
}

export const whipService = new WHIPService()
export default whipService
