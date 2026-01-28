import * as mediasoup from 'mediasoup'
import type {
  Worker,
  Router,
  WebRtcTransport,
  PlainTransport,
  Producer,
  Consumer,
  RtpCapabilities,
  DtlsParameters,
  RtpParameters,
  MediaKind,
  DtlsState,
} from 'mediasoup/types'
import { mediasoupConfig } from '../config/mediasoup.js'

interface PlainTransportInfo {
  transport: PlainTransport
  consumer: Consumer | null
  localPort: number  // Mediasoup's bound port
  localIp: string
  ffmpegPort: number  // Port where FFmpeg should listen
  ffmpegRtcpPort: number  // RTCP port for FFmpeg
}

// For SRT input sources - receives RTP and creates a producer
interface PlainProducerTransportInfo {
  transport: PlainTransport
  producer: Producer | null
  rtpPort: number
  rtcpPort: number
}

interface RoomState {
  router: Router
  participants: Map<string, ParticipantState>
  // Plain transports for bus outputs (outputId -> transport info)
  plainTransports: Map<string, PlainTransportInfo>
  // Plain transports for SRT inputs (sourceId -> producer transport info)
  plainProducerTransports: Map<string, PlainProducerTransportInfo>
}

interface ParticipantState {
  id: string
  displayName: string
  sendTransport: WebRtcTransport | null
  recvTransport: WebRtcTransport | null
  producer: Producer | null // Main mic producer (backwards compat)
  producers: Map<string, { producer: Producer; busType?: string; isBusOutput?: boolean }> // All producers
  consumers: Map<string, Consumer> // consumerId -> Consumer
}

class MediasoupService {
  private workers: Worker[] = []
  private nextWorkerIdx = 0
  private rooms: Map<string, RoomState> = new Map()
  private initialized = false

  async initialize(): Promise<void> {
    if (this.initialized) return

    console.log(`[MediasoupService] Creating ${mediasoupConfig.numWorkers} workers...`)
    console.log(`[MediasoupService] Announced IP: ${mediasoupConfig.webRtcTransportOptions.listenInfos[0]?.announcedAddress}`)
    console.log(`[MediasoupService] Port range: ${mediasoupConfig.workerSettings.rtcMinPort}-${mediasoupConfig.workerSettings.rtcMaxPort}`)

    for (let i = 0; i < mediasoupConfig.numWorkers; i++) {
      const worker = await mediasoup.createWorker(mediasoupConfig.workerSettings)

      // Use .once() since 'died' only fires once per worker instance
      worker.once('died', (error) => {
        console.error(`[MediasoupService] Worker ${i} died:`, error)
        // Remove dead worker and create a new one
        this.workers = this.workers.filter((w) => w !== worker)
        this.createWorker(i).catch((err) => {
          console.error(`[MediasoupService] Failed to recreate worker ${i}:`, err)
        })
      })

      this.workers.push(worker)
      console.log(`[MediasoupService] Worker ${i} created [pid:${worker.pid}]`)
    }

    this.initialized = true
    console.log('[MediasoupService] Initialized successfully')
  }

  private async createWorker(index: number): Promise<void> {
    const worker = await mediasoup.createWorker(mediasoupConfig.workerSettings)

    // Use .once() since 'died' only fires once per worker instance
    worker.once('died', (error) => {
      console.error(`[MediasoupService] Worker ${index} died:`, error)
      this.workers = this.workers.filter((w) => w !== worker)
      this.createWorker(index).catch((err) => {
        console.error(`[MediasoupService] Failed to recreate worker ${index}:`, err)
      })
    })

    this.workers.push(worker)
    console.log(`[MediasoupService] Worker ${index} recreated [pid:${worker.pid}]`)
  }

  private getNextWorker(): Worker {
    const worker = this.workers[this.nextWorkerIdx]
    if (!worker) {
      throw new Error('No workers available')
    }
    this.nextWorkerIdx = (this.nextWorkerIdx + 1) % this.workers.length
    return worker
  }

  // Room management
  async getOrCreateRoom(roomId: string): Promise<RoomState> {
    let room = this.rooms.get(roomId)

    if (!room) {
      const worker = this.getNextWorker()
      const router = await worker.createRouter({
        mediaCodecs: mediasoupConfig.mediaCodecs,
      })

      room = {
        router,
        participants: new Map(),
        plainTransports: new Map(),
        plainProducerTransports: new Map(),
      }

      this.rooms.set(roomId, room)
      console.log(`[MediasoupService] Created room ${roomId}`)
    }

    return room
  }

  async closeRoom(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId)
    if (!room) return

    const errors: Error[] = []

    // Close all participants - collect errors but continue cleanup
    for (const participant of room.participants.values()) {
      try {
        this.closeParticipant(roomId, participant.id)
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)))
        console.error(`[MediasoupService] Error closing participant ${participant.id}:`, err)
      }
    }

    // Close plain transports
    for (const [sourceId, transportInfo] of room.plainProducerTransports) {
      try {
        transportInfo.transport.close()
      } catch (err) {
        console.error(`[MediasoupService] Error closing plain transport ${sourceId}:`, err)
      }
    }
    room.plainProducerTransports.clear()

    // Close router - this should clean up any remaining transports
    try {
      room.router.close()
    } catch (err) {
      console.error(`[MediasoupService] Error closing router:`, err)
    }

    this.rooms.delete(roomId)
    console.log(`[MediasoupService] Closed room ${roomId}${errors.length > 0 ? ` with ${errors.length} errors` : ''}`)
  }

  getRoom(roomId: string): RoomState | undefined {
    return this.rooms.get(roomId)
  }

  getRtpCapabilities(roomId: string): RtpCapabilities | null {
    const room = this.rooms.get(roomId)
    return room?.router.rtpCapabilities ?? null
  }

  // Participant management
  async addParticipant(roomId: string, participantId: string, displayName: string): Promise<ParticipantState> {
    const room = await this.getOrCreateRoom(roomId)

    const participant: ParticipantState = {
      id: participantId,
      displayName,
      sendTransport: null,
      recvTransport: null,
      producer: null,
      producers: new Map(),
      consumers: new Map(),
    }

    room.participants.set(participantId, participant)
    console.log(`[MediasoupService] Added participant ${participantId} to room ${roomId}`)

    return participant
  }

  closeParticipant(roomId: string, participantId: string): void {
    const room = this.rooms.get(roomId)
    if (!room) return

    const participant = room.participants.get(participantId)
    if (!participant) return

    // Close all consumers
    for (const consumer of participant.consumers.values()) {
      consumer.close()
    }

    // Close all producers (including bus outputs)
    for (const { producer } of participant.producers.values()) {
      producer.close()
    }
    participant.producer?.close()

    // Close transports
    participant.sendTransport?.close()
    participant.recvTransport?.close()

    room.participants.delete(participantId)
    console.log(`[MediasoupService] Removed participant ${participantId} from room ${roomId}`)
  }

  getParticipant(roomId: string, participantId: string): ParticipantState | undefined {
    return this.rooms.get(roomId)?.participants.get(participantId)
  }

  // Transport management
  async createWebRtcTransport(
    roomId: string,
    participantId: string,
    direction: 'send' | 'recv'
  ): Promise<{
    id: string
    iceParameters: mediasoup.types.IceParameters
    iceCandidates: mediasoup.types.IceCandidate[]
    dtlsParameters: DtlsParameters
  }> {
    const room = this.rooms.get(roomId)
    if (!room) throw new Error('Room not found')

    const participant = room.participants.get(participantId)
    if (!participant) throw new Error('Participant not found')

    const transport = await room.router.createWebRtcTransport(mediasoupConfig.webRtcTransportOptions)

    console.log(`[MediasoupService] Transport created:`, {
      id: transport.id,
      direction,
      iceCandidates: transport.iceCandidates.map(c => `${c.protocol}://${c.ip}:${c.port}`),
    })

    transport.on('dtlsstatechange', (dtlsState: DtlsState) => {
      console.log(`[MediasoupService] Transport ${transport.id} DTLS state: ${dtlsState}`)
      if (dtlsState === 'closed') {
        transport.close()
      }
    })

    transport.on('icestatechange', (iceState) => {
      console.log(`[MediasoupService] Transport ${transport.id} ICE state: ${iceState}`)
    })

    if (direction === 'send') {
      participant.sendTransport = transport
    } else {
      participant.recvTransport = transport
    }

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    }
  }

  async connectTransport(
    roomId: string,
    participantId: string,
    transportId: string,
    dtlsParameters: DtlsParameters
  ): Promise<void> {
    const participant = this.getParticipant(roomId, participantId)
    if (!participant) throw new Error('Participant not found')

    const transport =
      participant.sendTransport?.id === transportId
        ? participant.sendTransport
        : participant.recvTransport?.id === transportId
          ? participant.recvTransport
          : null

    if (!transport) throw new Error('Transport not found')

    await transport.connect({ dtlsParameters })
    console.log(`[MediasoupService] Transport ${transportId} connected`)
  }

  // Producer management (sending audio)
  async createProducer(
    roomId: string,
    participantId: string,
    transportId: string,
    kind: MediaKind,
    rtpParameters: RtpParameters,
    appData?: { busType?: string; isBusOutput?: boolean }
  ): Promise<{ id: string }> {
    const participant = this.getParticipant(roomId, participantId)
    if (!participant) throw new Error('Participant not found')

    if (participant.sendTransport?.id !== transportId) {
      throw new Error('Invalid transport')
    }

    const producer = await participant.sendTransport.produce({
      kind,
      rtpParameters,
      appData: appData || {},
    })

    producer.on('transportclose', () => {
      producer.close()
    })

    // Store in producers map with metadata
    participant.producers.set(producer.id, {
      producer,
      busType: appData?.busType,
      isBusOutput: appData?.isBusOutput,
    })

    // Also set as main producer if not a bus output (backwards compat)
    if (!appData?.isBusOutput) {
      participant.producer = producer
    }

    console.log(`[MediasoupService] Producer ${producer.id} created for participant ${participantId}`, appData || '')

    return { id: producer.id }
  }

  // Get a bus producer for a specific bus type with validation
  // Returns the first valid (not closed, not paused) producer
  getBusProducer(roomId: string, busType: string): { producerId: string; participantId: string } | null {
    const room = this.rooms.get(roomId)
    if (!room) {
      console.warn(`[MediasoupService] getBusProducer: Room ${roomId} not found`)
      return null
    }

    const normalizedBusType = busType.toUpperCase()

    for (const [participantId, participant] of room.participants) {
      for (const [producerId, info] of participant.producers) {
        const producerBusType = info.busType?.toUpperCase()
        if (producerBusType === normalizedBusType && info.isBusOutput) {
          // Validate producer state
          if (info.producer.closed) {
            console.warn(`[MediasoupService] getBusProducer: Producer ${producerId} for ${busType} is closed, skipping`)
            continue
          }
          if (info.producer.paused) {
            console.warn(`[MediasoupService] getBusProducer: Producer ${producerId} for ${busType} is paused, skipping`)
            continue
          }
          console.log(`[MediasoupService] getBusProducer: Found valid ${busType} producer ${producerId} from ${participantId}`)
          return { producerId, participantId }
        }
      }
    }

    console.warn(`[MediasoupService] getBusProducer: No valid ${busType} producer found in room ${roomId}`)
    return null
  }

  // Get ALL bus producers of a specific type (for multi-producer scenarios)
  getAllBusProducers(roomId: string, busType: string): Array<{ producerId: string; participantId: string; paused: boolean }> {
    const room = this.rooms.get(roomId)
    if (!room) return []

    const normalizedBusType = busType.toUpperCase()
    const producers: Array<{ producerId: string; participantId: string; paused: boolean }> = []

    for (const [participantId, participant] of room.participants) {
      for (const [producerId, info] of participant.producers) {
        const producerBusType = info.busType?.toUpperCase()
        if (producerBusType === normalizedBusType && info.isBusOutput && !info.producer.closed) {
          producers.push({
            producerId,
            participantId,
            paused: info.producer.paused,
          })
        }
      }
    }

    return producers
  }

  // Validate that a specific producer exists and is valid
  validateProducer(roomId: string, producerId: string): { valid: boolean; reason?: string; busType?: string } {
    const room = this.rooms.get(roomId)
    if (!room) {
      return { valid: false, reason: 'Room not found' }
    }

    for (const [_participantId, participant] of room.participants) {
      const producerInfo = participant.producers.get(producerId)
      if (producerInfo) {
        if (producerInfo.producer.closed) {
          return { valid: false, reason: 'Producer is closed', busType: producerInfo.busType }
        }
        if (producerInfo.producer.paused) {
          return { valid: false, reason: 'Producer is paused', busType: producerInfo.busType }
        }
        return { valid: true, busType: producerInfo.busType }
      }
    }

    // Check SRT source producers
    for (const [_sourceId, transportInfo] of room.plainProducerTransports) {
      if (transportInfo.producer?.id === producerId) {
        if (transportInfo.producer.closed) {
          return { valid: false, reason: 'SRT producer is closed' }
        }
        if (transportInfo.producer.paused) {
          return { valid: false, reason: 'SRT producer is paused' }
        }
        return { valid: true, busType: 'SRT_SOURCE' }
      }
    }

    return { valid: false, reason: 'Producer not found' }
  }

  // Get diagnostic info about room's WebRTC state
  getRoomDiagnostics(roomId: string): {
    exists: boolean
    participantCount: number
    producers: Array<{ participantId: string; producerId: string; busType?: string; isBusOutput: boolean; closed: boolean; paused: boolean }>
    plainTransports: number
    srtSources: number
  } | null {
    const room = this.rooms.get(roomId)
    if (!room) return null

    const producers: Array<{ participantId: string; producerId: string; busType?: string; isBusOutput: boolean; closed: boolean; paused: boolean }> = []

    for (const [participantId, participant] of room.participants) {
      // Main producer (legacy)
      if (participant.producer) {
        producers.push({
          participantId,
          producerId: participant.producer.id,
          busType: undefined,
          isBusOutput: false,
          closed: participant.producer.closed,
          paused: participant.producer.paused,
        })
      }

      // All producers from Map
      for (const [producerId, info] of participant.producers) {
        producers.push({
          participantId,
          producerId,
          busType: info.busType,
          isBusOutput: info.isBusOutput || false,
          closed: info.producer.closed,
          paused: info.producer.paused,
        })
      }
    }

    return {
      exists: true,
      participantCount: room.participants.size,
      producers,
      plainTransports: room.plainTransports.size,
      srtSources: room.plainProducerTransports.size,
    }
  }

  // Consumer management (receiving audio)
  // Handles both participant producers and SRT source producers (prefixed with "source:")
  // If specificProducerId is provided, consume that specific producer (for bus outputs)
  async createConsumer(
    roomId: string,
    consumerParticipantId: string,
    producerParticipantId: string,
    rtpCapabilities: RtpCapabilities,
    specificProducerId?: string
  ): Promise<{
    id: string
    producerId: string
    kind: MediaKind
    rtpParameters: RtpParameters
  } | null> {
    const room = this.rooms.get(roomId)
    if (!room) throw new Error('Room not found')

    const consumerParticipant = room.participants.get(consumerParticipantId)
    if (!consumerParticipant) {
      throw new Error('Consumer participant not found')
    }

    if (!consumerParticipant.recvTransport) {
      throw new Error('Receive transport not created')
    }

    let producer: Producer | null = null

    // Check if this is an SRT source producer (prefixed with "source:")
    if (producerParticipantId.startsWith('source:')) {
      const sourceId = producerParticipantId.replace('source:', '')
      const transportInfo = room.plainProducerTransports.get(sourceId)
      if (transportInfo?.producer && !transportInfo.producer.closed) {
        producer = transportInfo.producer
        console.log(`[MediasoupService] Found SRT source producer for ${sourceId}: ${producer.id}`)
      }
    } else {
      // Regular participant producer
      const producerParticipant = room.participants.get(producerParticipantId)

      // If a specific producer ID is requested, find it in the producers Map
      if (specificProducerId && producerParticipant?.producers) {
        const producerInfo = producerParticipant.producers.get(specificProducerId)
        if (producerInfo?.producer && !producerInfo.producer.closed) {
          producer = producerInfo.producer
          console.log(`[MediasoupService] Found specific producer ${specificProducerId} for ${producerParticipantId}, busType: ${producerInfo.busType}`)
        }
      }

      // Fall back to main producer if no specific producer found
      if (!producer && producerParticipant?.producer && !producerParticipant.producer.closed) {
        producer = producerParticipant.producer
      }
    }

    if (!producer) {
      console.warn(`[MediasoupService] Producer not found for ${producerParticipantId}`)
      return null // Producer doesn't exist yet
    }

    // Check if router can consume
    if (
      !room.router.canConsume({
        producerId: producer.id,
        rtpCapabilities,
      })
    ) {
      console.warn(`[MediasoupService] Cannot consume producer ${producer.id}`)
      return null
    }

    const consumer = await consumerParticipant.recvTransport.consume({
      producerId: producer.id,
      rtpCapabilities,
      paused: true, // Start paused, client will resume
    })

    consumer.on('transportclose', () => {
      consumer.close()
      consumerParticipant.consumers.delete(consumer.id)
    })

    consumer.on('producerclose', () => {
      consumer.close()
      consumerParticipant.consumers.delete(consumer.id)
    })

    consumerParticipant.consumers.set(consumer.id, consumer)

    console.log(
      `[MediasoupService] Consumer ${consumer.id} created for participant ${consumerParticipantId} ` +
        `consuming producer from ${producerParticipantId}`
    )

    return {
      id: consumer.id,
      producerId: producer.id,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
    }
  }

  async resumeConsumer(roomId: string, participantId: string, consumerId: string): Promise<void> {
    const participant = this.getParticipant(roomId, participantId)
    if (!participant) throw new Error('Participant not found')

    const consumer = participant.consumers.get(consumerId)
    if (!consumer) throw new Error('Consumer not found')

    await consumer.resume()
    console.log(`[MediasoupService] Consumer ${consumerId} resumed`)
  }

  // Get all producers in a room (for new participants to consume)
  // Includes both participant producers and SRT source producers
  getProducersInRoom(roomId: string, excludeParticipantId?: string): Array<{
    participantId: string
    producerId: string
    displayName: string
    isSource?: boolean // true for SRT/audio sources, undefined for participants
  }> {
    const room = this.rooms.get(roomId)
    if (!room) return []

    const producers: Array<{
      participantId: string
      producerId: string
      displayName: string
      isSource?: boolean
    }> = []

    // Include participant producers
    for (const [participantId, participant] of room.participants) {
      if (excludeParticipantId && participantId === excludeParticipantId) continue
      if (participant.producer && !participant.producer.closed) {
        producers.push({
          participantId,
          producerId: participant.producer.id,
          displayName: participant.displayName,
        })
      }
    }

    // Include SRT source producers
    for (const [sourceId, transportInfo] of room.plainProducerTransports) {
      if (transportInfo.producer && !transportInfo.producer.closed) {
        producers.push({
          participantId: `source:${sourceId}`, // Prefix to distinguish from participants
          producerId: transportInfo.producer.id,
          displayName: `SRT Source`, // Will be resolved to actual name by frontend
          isSource: true,
        })
      }
    }

    return producers
  }

  // ============================================================================
  // PLAIN TRANSPORT METHODS (for bus output encoding)
  // ============================================================================

  /**
   * Create a plain transport for consuming bus audio via RTP
   * This is used to pipe audio to FFmpeg for encoding to Icecast/SRT
   */
  async createPlainTransport(
    roomId: string,
    outputId: string
  ): Promise<{ localIp: string; localPort: number; rtcpPort: number }> {
    const room = this.rooms.get(roomId)
    if (!room) throw new Error('Room not found')

    // Close existing transport for this output if any
    const existing = room.plainTransports.get(outputId)
    if (existing) {
      existing.consumer?.close()
      existing.transport.close()
      room.plainTransports.delete(outputId)
    }

    const transport = await room.router.createPlainTransport({
      listenInfo: {
        protocol: 'udp',
        ip: '127.0.0.1',
        announcedAddress: undefined,
        portRange: { min: 20000, max: 25000 },
      },
      rtcpMux: false, // Separate RTP and RTCP ports for FFmpeg compatibility
      comedia: false, // We specify the remote address explicitly
    })

    // Allocate a separate port for FFmpeg to listen on (in a different range)
    // This avoids the conflict where both mediasoup and FFmpeg try to bind the same port
    const ffmpegPort = transport.tuple.localPort + 5000 // Offset to avoid conflicts
    const ffmpegRtcpPort = ffmpegPort + 1

    // Connect transport to send RTP to FFmpeg's listening port
    await transport.connect({
      ip: '127.0.0.1',
      port: ffmpegPort,
      rtcpPort: ffmpegRtcpPort,
    })

    const localPort = transport.tuple.localPort
    const localIp = transport.tuple.localIp

    room.plainTransports.set(outputId, {
      transport,
      consumer: null,
      localPort,
      localIp,
      ffmpegPort,
      ffmpegRtcpPort,
    })

    console.log(`[MediasoupService] Created plain transport for output ${outputId}: mediasoup ${localIp}:${localPort} -> FFmpeg 127.0.0.1:${ffmpegPort}`)

    // Return the FFmpeg port (where FFmpeg should listen), not mediasoup's port
    return { localIp, localPort: ffmpegPort, rtcpPort: ffmpegRtcpPort }
  }

  /**
   * Consume a bus producer with the plain transport
   * Returns RTP parameters needed for FFmpeg to receive the stream
   */
  async consumeWithPlainTransport(
    roomId: string,
    outputId: string,
    producerId: string
  ): Promise<{
    rtpParameters: RtpParameters
    localPort: number
    rtcpPort: number
  } | null> {
    const room = this.rooms.get(roomId)
    if (!room) throw new Error('Room not found')

    const transportInfo = room.plainTransports.get(outputId)
    if (!transportInfo) throw new Error('Plain transport not found for this output')

    // Find the producer across all participants (check both legacy producer and producers Map)
    let producer: Producer | null = null
    for (const participant of room.participants.values()) {
      // Check legacy producer field
      if (participant.producer?.id === producerId && !participant.producer.closed) {
        producer = participant.producer
        break
      }
      // Check producers Map (where bus producers are stored)
      const producerInfo = participant.producers.get(producerId)
      if (producerInfo && !producerInfo.producer.closed) {
        producer = producerInfo.producer
        break
      }
    }

    if (!producer) {
      console.warn(`[MediasoupService] Producer ${producerId} not found in room ${roomId}`)
      return null
    }

    // Create consumer on the plain transport
    const consumer = await transportInfo.transport.consume({
      producerId: producer.id,
      rtpCapabilities: room.router.rtpCapabilities,
      paused: false,
    })

    transportInfo.consumer = consumer

    // Ensure consumer is not paused
    if (consumer.paused) {
      console.log(`[MediasoupService] Consumer was paused, resuming...`)
      await consumer.resume()
    }

    console.log(`[MediasoupService] Consumer ${consumer.id} created on plain transport for output ${outputId}`)
    console.log(`[MediasoupService] Consumer paused: ${consumer.paused}, producer paused: ${producer.paused}`)
    console.log(`[MediasoupService] Transport tuple: ${JSON.stringify(transportInfo.transport.tuple)}`)
    console.log(`[MediasoupService] FFmpeg should listen on: 127.0.0.1:${transportInfo.ffmpegPort}`)
    console.log(`[MediasoupService] Producer ID: ${producer.id}, kind: ${producer.kind}, type: ${producer.type}`)
    console.log(`[MediasoupService] RTP Parameters:`, JSON.stringify(consumer.rtpParameters, null, 2))

    // Log stats after 2 seconds to check if data is flowing
    setTimeout(async () => {
      try {
        const producerStats = await producer.getStats()
        const consumerStats = await consumer.getStats()
        console.log(`[MediasoupService] Producer stats after 2s:`, JSON.stringify(Array.from(producerStats), null, 2))
        console.log(`[MediasoupService] Consumer stats after 2s:`, JSON.stringify(Array.from(consumerStats), null, 2))
      } catch (err) {
        console.error(`[MediasoupService] Error getting stats:`, err)
      }
    }, 2000)

    return {
      rtpParameters: consumer.rtpParameters,
      localPort: transportInfo.ffmpegPort,
      rtcpPort: transportInfo.ffmpegRtcpPort,
    }
  }

  /**
   * Close a plain transport and its consumer
   */
  closePlainTransport(roomId: string, outputId: string): void {
    const room = this.rooms.get(roomId)
    if (!room) return

    const transportInfo = room.plainTransports.get(outputId)
    if (transportInfo) {
      transportInfo.consumer?.close()
      transportInfo.transport.close()
      room.plainTransports.delete(outputId)
      console.log(`[MediasoupService] Closed plain transport for output ${outputId}`)
    }
  }

  /**
   * Get plain transport info for an output
   */
  getPlainTransportInfo(roomId: string, outputId: string): PlainTransportInfo | undefined {
    return this.rooms.get(roomId)?.plainTransports.get(outputId)
  }

  // ============================================================================
  // PLAIN PRODUCER TRANSPORT METHODS (for SRT input sources)
  // ============================================================================

  /**
   * Create a plain transport for receiving RTP from FFmpeg (SRT input)
   * This transport will receive Opus audio and create a producer
   */
  async createPlainTransportForProducer(
    roomId: string,
    sourceId: string
  ): Promise<{ rtpPort: number; rtcpPort: number }> {
    const room = this.rooms.get(roomId)
    if (!room) throw new Error('Room not found')

    // Close existing transport for this source if any
    const existing = room.plainProducerTransports.get(sourceId)
    if (existing) {
      existing.producer?.close()
      existing.transport.close()
      room.plainProducerTransports.delete(sourceId)
    }

    // Create transport with comedia mode so it can receive RTP from FFmpeg
    const transport = await room.router.createPlainTransport({
      listenInfo: {
        protocol: 'udp',
        ip: '127.0.0.1',
        announcedAddress: undefined,
        portRange: { min: 20000, max: 25000 },
      },
      rtcpMux: false, // Separate RTP and RTCP ports for FFmpeg compatibility
      comedia: true, // Let FFmpeg tell us where to send RTCP
    })

    const rtpPort = transport.tuple.localPort
    const rtcpPort = transport.rtcpTuple?.localPort || rtpPort + 1

    room.plainProducerTransports.set(sourceId, {
      transport,
      producer: null,
      rtpPort,
      rtcpPort,
    })

    console.log(`[MediasoupService] Created plain producer transport for source ${sourceId}: RTP port ${rtpPort}, RTCP port ${rtcpPort}`)

    return { rtpPort, rtcpPort }
  }

  /**
   * Create a producer on a plain transport for SRT input
   * FFmpeg sends Opus RTP to this transport
   */
  async createProducerOnPlainTransport(
    roomId: string,
    sourceId: string,
    _rtpPort: number // Not used but kept for API consistency
  ): Promise<string> {
    const room = this.rooms.get(roomId)
    if (!room) throw new Error('Room not found')

    const transportInfo = room.plainProducerTransports.get(sourceId)
    if (!transportInfo) throw new Error('Plain producer transport not found for this source')

    // Close existing producer if any
    if (transportInfo.producer) {
      transportInfo.producer.close()
      transportInfo.producer = null
    }

    // Create producer with Opus codec
    // FFmpeg is configured to send Opus with payload type 111
    const producer = await transportInfo.transport.produce({
      kind: 'audio',
      rtpParameters: {
        codecs: [
          {
            mimeType: 'audio/opus',
            payloadType: 111,
            clockRate: 48000,
            channels: 2,
            parameters: {
              minptime: 10,
              useinbandfec: 1,
            },
          },
        ],
        encodings: [{ ssrc: 11111111 }], // FFmpeg will use its own SSRC
      },
      paused: false,
    })

    producer.on('transportclose', () => {
      console.log(`[MediasoupService] Producer ${producer.id} transport closed for source ${sourceId}`)
      producer.close()
    })

    transportInfo.producer = producer

    console.log(`[MediasoupService] Created producer ${producer.id} on plain transport for source ${sourceId}`)

    return producer.id
  }

  /**
   * Get producer ID for an SRT source
   */
  getProducerForSource(roomId: string, sourceId: string): string | null {
    const transportInfo = this.rooms.get(roomId)?.plainProducerTransports.get(sourceId)
    return transportInfo?.producer?.id ?? null
  }

  /**
   * Close a plain producer transport and its producer
   */
  closePlainProducerTransport(roomId: string, sourceId: string): void {
    const room = this.rooms.get(roomId)
    if (!room) return

    const transportInfo = room.plainProducerTransports.get(sourceId)
    if (transportInfo) {
      transportInfo.producer?.close()
      transportInfo.transport.close()
      room.plainProducerTransports.delete(sourceId)
      console.log(`[MediasoupService] Closed plain producer transport for source ${sourceId}`)
    }
  }

  // Cleanup
  async shutdown(): Promise<void> {
    console.log('[MediasoupService] Shutting down...')

    // Close all rooms
    for (const roomId of this.rooms.keys()) {
      await this.closeRoom(roomId)
    }

    // Close all workers
    for (const worker of this.workers) {
      worker.close()
    }

    this.workers = []
    this.initialized = false
    console.log('[MediasoupService] Shutdown complete')
  }
}

export const mediasoupService = new MediasoupService()
