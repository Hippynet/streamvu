import type { Server, Socket } from 'socket.io'
import type { RtpCapabilities, DtlsParameters, RtpParameters, MediaKind } from 'mediasoup/types'
import { mediasoupService } from '../services/mediasoup.service.js'
import { mediasoupConfig } from '../config/mediasoup.js'
import { prisma } from '../lib/prisma.js'
import { verifyToken } from '../utils/jwt.js'
import { mixCoordinatorService, type MixStateChange, type RoomMixState } from '../services/mixCoordinator.service.js'

interface SocketData {
  participantId: string | null
  roomId: string | null
  userId: string | null
  displayName: string | null
  isAuthenticated: boolean
  isInWaitingRoom: boolean
}

interface JoinRoomPayload {
  roomId: string
  displayName: string
  accessCode?: string
  token?: string // JWT for authenticated users
  timeZoneOffset?: number // UTC offset in minutes (e.g., -300 for EST)
}

interface TransportPayload {
  roomId: string
  direction: 'send' | 'recv'
}

interface ConnectTransportPayload {
  roomId: string
  transportId: string
  dtlsParameters: DtlsParameters
}

interface ProducePayload {
  roomId: string
  transportId: string
  kind: MediaKind
  rtpParameters: RtpParameters
  appData?: { busType?: string; isBusOutput?: boolean }
}

interface ConsumePayload {
  roomId: string
  producerParticipantId: string
  producerId?: string // Optional: specific producer to consume (for bus outputs)
  rtpCapabilities: RtpCapabilities
}

interface ResumeConsumerPayload {
  roomId: string
  consumerId: string
}

// Phase 1.5: Cue System
interface SendCuePayload {
  roomId: string
  cueType: 'OFF' | 'RED' | 'YELLOW' | 'GREEN' | 'CUSTOM'
  cueText?: string
  targetParticipantId?: string // null = all participants
}

// Phase 1.4: Rundown
interface RundownItemPayload {
  roomId: string
  itemId: string
}

// Phase 3.1: Chat
interface SendChatPayload {
  roomId: string
  content: string
  recipientId?: string
  type?: 'CHAT' | 'PRODUCER_NOTE' | 'SYSTEM'
}

// Phase 3.2: Timers
interface CreateTimerPayload {
  roomId: string
  name?: string
  type: 'COUNTDOWN' | 'STOPWATCH'
  durationMs?: number
  visibleToAll?: boolean
}

interface TimerActionPayload {
  roomId: string
  timerId: string
}

// Store reference to the call center namespace for external use
let callCenterNamespace: ReturnType<Server['of']> | null = null

/**
 * Emit an event to a room when a new source producer is created (e.g., SRT source)
 */
export function emitSourceProducerNew(
  roomId: string,
  sourceId: string,
  producerId: string,
  sourceName: string
): void {
  if (!callCenterNamespace) {
    console.warn('[CallCenter] Namespace not initialized, cannot emit source producer event')
    return
  }

  console.log(`[CallCenter] Emitting producer:new for source ${sourceName} (${sourceId}), producerId: ${producerId}`)
  callCenterNamespace.to(roomId).emit('producer:new', {
    participantId: `source:${sourceId}`,
    producerId,
    displayName: sourceName,
    isSource: true,
  })
}

/**
 * Emit SRT source state change to room
 */
export function emitSRTSourceStateChange(
  roomId: string,
  sourceId: string,
  state: {
    connectionState: string
    remoteAddress?: string | null
    listenerPort?: number | null
    errorMessage?: string | null
  }
): void {
  if (!callCenterNamespace) {
    console.warn('[CallCenter] Namespace not initialized, cannot emit SRT source state')
    return
  }

  console.log(`[CallCenter] SRT source ${sourceId} state: ${state.connectionState}`)
  callCenterNamespace.to(roomId).emit('srt:source-state', {
    sourceId,
    ...state,
  })
}

/**
 * Emit WHIP stream state change to room
 */
export function emitWHIPStreamUpdate(
  roomId: string,
  stream: {
    id: string
    roomId: string
    name: string
    token: string
    state: string
    clientIp: string | null
    clientUserAgent: string | null
    createdAt: Date
    connectedAt: Date | null
    disconnectedAt: Date | null
    errorMessage: string | null
  }
): void {
  if (!callCenterNamespace) {
    console.warn('[CallCenter] Namespace not initialized, cannot emit WHIP stream update')
    return
  }

  console.log(`[CallCenter] WHIP stream ${stream.id} state: ${stream.state}`)
  callCenterNamespace.to(roomId).emit('whip:stream-updated', {
    stream: {
      ...stream,
      createdAt: stream.createdAt.toISOString(),
      connectedAt: stream.connectedAt?.toISOString() || null,
      disconnectedAt: stream.disconnectedAt?.toISOString() || null,
    },
  })
}

/**
 * Emit WHIP stream deletion to room
 */
export function emitWHIPStreamDeleted(roomId: string, streamId: string): void {
  if (!callCenterNamespace) {
    console.warn('[CallCenter] Namespace not initialized, cannot emit WHIP stream deletion')
    return
  }

  console.log(`[CallCenter] WHIP stream ${streamId} deleted`)
  callCenterNamespace.to(roomId).emit('whip:stream-deleted', { streamId })
}

/**
 * Emit RIST source state change to room (simplified version)
 */
export function emitRISTSourceStateChange(
  roomId: string,
  sourceId: string,
  state: {
    connectionState: string
    remoteAddress?: string | null
    listenerPort?: number | null
    errorMessage?: string | null
  }
): void {
  if (!callCenterNamespace) {
    console.warn('[CallCenter] Namespace not initialized, cannot emit RIST source state')
    return
  }

  console.log(`[CallCenter] RIST source ${sourceId} state: ${state.connectionState}`)
  callCenterNamespace.to(roomId).emit('rist:source-state', {
    sourceId,
    ...state,
  })
}

/**
 * Emit RIST source state change to room (legacy - full update)
 */
export function emitRISTSourceUpdate(
  roomId: string,
  source: {
    id: string
    name: string
    state: string
    remoteAddress: string | null
    listenerPort: number | null
    error: string | null
  }
): void {
  if (!callCenterNamespace) {
    console.warn('[CallCenter] Namespace not initialized, cannot emit RIST source update')
    return
  }

  console.log(`[CallCenter] RIST source ${source.id} state: ${source.state}`)
  callCenterNamespace.to(roomId).emit('rist:source-updated', { source })
}

/**
 * Emit transcription job progress to organization
 */
export function emitTranscriptionProgress(
  _organizationId: string,
  job: {
    id: string
    roomId?: string
    recordingId?: string
    status: string
    progress: number
    currentSegment?: number
    totalSegments?: number
    estimatedTimeRemaining?: number
  }
): void {
  if (!callCenterNamespace) {
    console.warn('[CallCenter] Namespace not initialized, cannot emit transcription progress')
    return
  }

  console.log(`[CallCenter] Transcription job ${job.id} progress: ${job.progress}%`)

  // Emit to the room if roomId is specified, otherwise broadcast to org channel
  if (job.roomId) {
    callCenterNamespace.to(job.roomId).emit('transcription:progress', { job })
  }
  // TODO: Consider adding organization-level room for broader broadcasts
}

/**
 * Emit transcription job completed to organization
 */
export function emitTranscriptionCompleted(
  _organizationId: string,
  result: {
    jobId: string
    roomId?: string
    recordingId?: string
    text: string
    wordCount: number
    duration: number
    language: string
  }
): void {
  if (!callCenterNamespace) {
    console.warn('[CallCenter] Namespace not initialized, cannot emit transcription completed')
    return
  }

  console.log(`[CallCenter] Transcription job ${result.jobId} completed`)

  if (result.roomId) {
    callCenterNamespace.to(result.roomId).emit('transcription:completed', { result })
  }
}

/**
 * Emit cloud upload progress to room
 */
export function emitUploadProgress(
  roomId: string,
  upload: {
    uploadId: string
    progress: number
    uploadedBytes: number
    totalBytes: number
    speed: number
    estimatedTimeRemaining: number
  }
): void {
  if (!callCenterNamespace) {
    console.warn('[CallCenter] Namespace not initialized, cannot emit upload progress')
    return
  }

  callCenterNamespace.to(roomId).emit('upload:progress', { upload })
}

/**
 * Emit cloud upload completed to room
 */
export function emitUploadCompleted(
  roomId: string,
  upload: {
    uploadId: string
    filename: string
    remoteUrl: string
    remotePath: string
    fileSize: number
  }
): void {
  if (!callCenterNamespace) {
    console.warn('[CallCenter] Namespace not initialized, cannot emit upload completed')
    return
  }

  console.log(`[CallCenter] Upload ${upload.uploadId} completed: ${upload.remoteUrl}`)
  callCenterNamespace.to(roomId).emit('upload:completed', { upload })
}

/**
 * Emit cloud upload failed to room
 */
export function emitUploadFailed(
  roomId: string,
  upload: {
    uploadId: string
    filename: string
    error: string
  }
): void {
  if (!callCenterNamespace) {
    console.warn('[CallCenter] Namespace not initialized, cannot emit upload failed')
    return
  }

  console.log(`[CallCenter] Upload ${upload.uploadId} failed: ${upload.error}`)
  callCenterNamespace.to(roomId).emit('upload:failed', { upload })
}

/**
 * Emit bus level change to room (for real-time multi-bus mixing)
 */
export function emitBusLevelChange(
  roomId: string,
  outputId: string,
  busRouting: Record<string, number>,
  changedBy?: string
): void {
  if (!callCenterNamespace) {
    console.warn('[CallCenter] Namespace not initialized, cannot emit bus level change')
    return
  }

  callCenterNamespace.to(roomId).emit('output:busLevelsChanged', {
    outputId,
    busRouting,
    changedBy,
    timestamp: Date.now(),
  })
}

/**
 * Emit output state change (encoder starting, running, stopped, error)
 */
export function emitOutputStateChange(
  roomId: string,
  outputId: string,
  state: 'starting' | 'running' | 'stopping' | 'stopped' | 'error' | 'restarting',
  details?: { error?: string; reason?: string }
): void {
  if (!callCenterNamespace) {
    console.warn('[CallCenter] Namespace not initialized, cannot emit output state change')
    return
  }

  callCenterNamespace.to(roomId).emit('output:stateChanged', {
    outputId,
    state,
    details,
    timestamp: Date.now(),
  })
}

export function setupCallCenterNamespace(io: Server): void {
  const callCenter = io.of('/call-center')
  callCenterNamespace = callCenter // Store reference for external use

  callCenter.on('connection', (socket: Socket) => {
    const socketData: SocketData = {
      participantId: null,
      roomId: null,
      userId: null,
      displayName: null,
      isAuthenticated: false,
      isInWaitingRoom: false,
    }

    console.log(`[CallCenter] Socket connected: ${socket.id}`)

    // Join a room
    socket.on('room:join', async (payload: JoinRoomPayload, callback) => {
      try {
        const { roomId, displayName, accessCode, token, timeZoneOffset } = payload

        // Verify room exists and is active
        const room = await prisma.callRoom.findUnique({
          where: { id: roomId },
          include: { _count: { select: { participants: true } } },
        })

        if (!room) {
          return callback({ error: 'Room not found' })
        }

        if (!room.isActive) {
          return callback({ error: 'Room is closed' })
        }

        // Check capacity
        const connectedCount = await prisma.roomParticipant.count({
          where: { roomId, isConnected: true },
        })

        if (connectedCount >= room.maxParticipants) {
          return callback({ error: 'Room is full' })
        }

        // Verify access for public rooms with access code
        if (room.visibility === 'PUBLIC' && room.accessCode) {
          if (accessCode !== room.accessCode) {
            return callback({ error: 'Invalid access code' })
          }
        }

        // Check authentication if private room
        let userId: string | null = null
        if (token) {
          try {
            const decoded = verifyToken(token)
            userId = decoded.sub
            socketData.isAuthenticated = true
          } catch {
            if (room.visibility === 'PRIVATE') {
              return callback({ error: 'Authentication required for private rooms' })
            }
          }
        } else if (room.visibility === 'PRIVATE') {
          return callback({ error: 'Authentication required for private rooms' })
        }

        // Determine if this participant should go to waiting room
        // - Room must have waitingRoom enabled
        // - Participant must NOT be the room creator
        const shouldWait = room.waitingRoom && userId !== room.createdById

        // Create participant in database
        // Note: Same user can join from multiple devices (no unique constraint)
        const participant = await prisma.roomParticipant.create({
          data: {
            roomId,
            userId,
            displayName,
            role: userId === room.createdById ? 'HOST' : (userId ? 'PARTICIPANT' : 'LISTENER'),
            isConnected: true,
            isInWaitingRoom: shouldWait,
          },
        })

        // Store socket data
        socketData.participantId = participant.id
        socketData.roomId = roomId
        socketData.userId = userId
        socketData.displayName = displayName
        socketData.isInWaitingRoom = shouldWait

        // Join socket.io room (all participants join, even those in waiting room, for notifications)
        socket.join(roomId)
        // Also join a waiting room specific channel if in waiting room
        if (shouldWait) {
          socket.join(`${roomId}:waiting`)
        }
        // If this is a green room (has parent), also join parent room's IFB channel
        // This allows green room participants to receive IFB/talkback from the main live room
        if (room.parentId) {
          socket.join(`${room.parentId}:ifb`)
          console.log(`[CallCenter] ${displayName} joined parent room IFB channel: ${room.parentId}:ifb`)
        }

        if (shouldWait) {
          // Participant goes to waiting room
          // Notify host of new waiting participant
          socket.to(roomId).emit('waitingroom:new-participant', {
            participantId: participant.id,
            displayName,
          })

          callback({
            success: true,
            participantId: participant.id,
            inWaitingRoom: true,
            roomName: room.name,
          })

          console.log(`[CallCenter] ${displayName} entered waiting room for ${roomId}`)
        } else {
          // Add to mediasoup room (only for admitted participants)
          await mediasoupService.addParticipant(roomId, participant.id, displayName)

          // Notify others in room (excluding waiting room participants)
          socket.to(roomId).emit('room:participant-joined', {
            participantId: participant.id,
            displayName,
            userId,
            timeZoneOffset,
          })

          // Get RTP capabilities for the room
          const rtpCapabilities = mediasoupService.getRtpCapabilities(roomId)

          // Get existing producers in room
          const producers = mediasoupService.getProducersInRoom(roomId, participant.id)
          console.log(`[CallCenter] Existing producers for ${displayName}:`, producers.length, producers.map(p => ({ participantId: p.participantId, displayName: p.displayName })))

          // Get ICE servers
          const iceServers = mediasoupConfig.getIceServers()

          callback({
            success: true,
            participantId: participant.id,
            inWaitingRoom: false,
            rtpCapabilities,
            iceServers,
            existingProducers: producers,
          })

          console.log(`[CallCenter] ${displayName} joined room ${roomId}, got ${producers.length} existing producers`)
        }
      } catch (error) {
        console.error('[CallCenter] Error joining room:', error)
        // Provide more specific error message when possible
        const errorMessage = error instanceof Error ? error.message : 'Failed to join room'
        callback({ error: errorMessage })
      }
    })

    // Leave room
    socket.on('room:leave', async (_payload: { roomId: string }, callback) => {
      try {
        await handleLeaveRoom(socket, socketData)
        callback?.({ success: true })
      } catch (error) {
        console.error('[CallCenter] Error leaving room:', error)
        callback?.({ error: 'Failed to leave room' })
      }
    })

    // Create WebRTC transport
    socket.on('transport:create', async (payload: TransportPayload, callback) => {
      try {
        const { roomId, direction } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback({ error: 'Not in room' })
        }

        const transport = await mediasoupService.createWebRtcTransport(
          roomId,
          socketData.participantId,
          direction
        )

        callback({
          success: true,
          ...transport,
        })

        console.log(`[CallCenter] Created ${direction} transport for ${socketData.displayName}`)
      } catch (error) {
        console.error('[CallCenter] Error creating transport:', error)
        callback({ error: 'Failed to create transport' })
      }
    })

    // Connect transport
    socket.on('transport:connect', async (payload: ConnectTransportPayload, callback) => {
      try {
        const { roomId, transportId, dtlsParameters } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback({ error: 'Not in room' })
        }

        await mediasoupService.connectTransport(
          roomId,
          socketData.participantId,
          transportId,
          dtlsParameters
        )

        callback({ success: true })
      } catch (error) {
        console.error('[CallCenter] Error connecting transport:', error)
        callback({ error: 'Failed to connect transport' })
      }
    })

    // Start producing (sending audio)
    socket.on('producer:create', async (payload: ProducePayload, callback) => {
      try {
        const { roomId, transportId, kind, rtpParameters, appData } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback({ error: 'Not in room' })
        }

        const producer = await mediasoupService.createProducer(
          roomId,
          socketData.participantId,
          transportId,
          kind,
          rtpParameters,
          appData
        )

        // Only broadcast producer:new for non-bus outputs
        // Bus outputs are used internally (PGM for encoding, TB for IFB) and don't need to be consumed by all
        if (!appData?.isBusOutput) {
          console.log(`[CallCenter] Broadcasting producer:new to room ${roomId} for ${socketData.displayName} (${socketData.participantId}), producerId: ${producer.id}`)
          socket.to(roomId).emit('producer:new', {
            participantId: socketData.participantId,
            producerId: producer.id,
            displayName: socketData.displayName,
          })
        } else {
          console.log(`[CallCenter] Bus output ${appData.busType} producer created: ${producer.id}`)
        }

        callback({
          success: true,
          producerId: producer.id,
        })

        console.log(`[CallCenter] ${socketData.displayName} started producing, producer: ${producer.id}`, appData || '')
      } catch (error) {
        console.error('[CallCenter] Error creating producer:', error)
        callback({ error: 'Failed to create producer' })
      }
    })

    // Start consuming (receiving audio from another participant)
    socket.on('consumer:create', async (payload: ConsumePayload, callback) => {
      try {
        const { roomId, producerParticipantId, producerId, rtpCapabilities } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback({ error: 'Not in room' })
        }

        const consumer = await mediasoupService.createConsumer(
          roomId,
          socketData.participantId,
          producerParticipantId,
          rtpCapabilities,
          producerId // Optional: specific producer to consume
        )

        if (!consumer) {
          return callback({ error: 'Cannot consume this producer' })
        }

        callback({
          success: true,
          ...consumer,
        })

        console.log(`[CallCenter] ${socketData.displayName} consuming from participant ${producerParticipantId}${producerId ? ` (producer: ${producerId})` : ''}`)
      } catch (error) {
        console.error('[CallCenter] Error creating consumer:', error)
        callback({ error: 'Failed to create consumer' })
      }
    })

    // Resume consumer
    socket.on('consumer:resume', async (payload: ResumeConsumerPayload, callback) => {
      try {
        const { roomId, consumerId } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback({ error: 'Not in room' })
        }

        await mediasoupService.resumeConsumer(roomId, socketData.participantId, consumerId)

        callback({ success: true })
      } catch (error) {
        console.error('[CallCenter] Error resuming consumer:', error)
        callback({ error: 'Failed to resume consumer' })
      }
    })

    // Voice activity detection
    socket.on('vad:speaking', (payload: { isSpeaking: boolean }) => {
      if (!socketData.roomId || !socketData.participantId) return

      // Broadcast to others in room
      socket.to(socketData.roomId).emit('vad:participant-speaking', {
        participantId: socketData.participantId,
        isSpeaking: payload.isSpeaking,
      })

      // Update database
      prisma.roomParticipant
        .update({
          where: { id: socketData.participantId },
          data: { isSpeaking: payload.isSpeaking },
        })
        .catch(console.error)
    })

    // Tally state update (on-air channels)
    socket.on('tally:update', (payload: { onAirChannelIds: string[] }) => {
      if (!socketData.roomId) return

      // Broadcast to all participants in the room (including sender for confirmation)
      callCenterNamespace?.to(socketData.roomId).emit('tally:changed', {
        onAirChannelIds: payload.onAirChannelIds,
      })

      console.log(`[CallCenter] Tally update in room ${socketData.roomId}:`, payload.onAirChannelIds)
    })

    // Mute state
    socket.on('mute:update', async (payload: { isMuted: boolean }) => {
      if (!socketData.roomId || !socketData.participantId) return

      // Broadcast to others in room
      socket.to(socketData.roomId).emit('mute:participant-update', {
        participantId: socketData.participantId,
        isMuted: payload.isMuted,
      })

      // Update database
      await prisma.roomParticipant.update({
        where: { id: socketData.participantId },
        data: { isMuted: payload.isMuted },
      })
    })

    // Kick participant (host only - verified via REST API, this just notifies)
    socket.on('host:kick', async (payload: { participantId: string }, callback) => {
      if (!socketData.roomId) {
        return callback?.({ error: 'Not in room' })
      }

      // Notify the kicked participant
      callCenter.to(socketData.roomId).emit('room:kicked', {
        participantId: payload.participantId,
      })

      callback?.({ success: true })
    })

    // Close room (host only - verified via REST API, this notifies all)
    socket.on('host:close-room', async (_payload: Record<string, never>, callback) => {
      if (!socketData.roomId) {
        return callback?.({ error: 'Not in room' })
      }

      // Notify all participants
      callCenter.to(socketData.roomId).emit('room:closed', {
        roomId: socketData.roomId,
      })

      callback?.({ success: true })
    })

    // Admit participant from waiting room (host only - verified via REST API, this notifies)
    socket.on('host:admit', async (payload: { participantId: string }, callback) => {
      if (!socketData.roomId) {
        return callback?.({ error: 'Not in room' })
      }

      const roomId = socketData.roomId

      // Get participant info from database
      const participant = await prisma.roomParticipant.findUnique({
        where: { id: payload.participantId },
      })

      if (!participant || participant.roomId !== roomId) {
        return callback?.({ error: 'Participant not found' })
      }

      // Add to mediasoup room
      await mediasoupService.addParticipant(roomId, participant.id, participant.displayName)

      // Get RTP capabilities for the admitted participant
      const rtpCapabilities = mediasoupService.getRtpCapabilities(roomId)
      const iceServers = mediasoupConfig.getIceServers()
      const producers = mediasoupService.getProducersInRoom(roomId, participant.id)

      // Notify the admitted participant
      callCenter.to(roomId).emit('waitingroom:admitted', {
        participantId: payload.participantId,
        rtpCapabilities,
        iceServers,
        existingProducers: producers,
      })

      // Notify other participants that someone joined
      socket.to(roomId).emit('room:participant-joined', {
        participantId: participant.id,
        displayName: participant.displayName,
        userId: participant.userId,
      })

      callback?.({ success: true })
    })

    // Reject participant from waiting room (host only)
    socket.on('host:reject', async (payload: { participantId: string }, callback) => {
      if (!socketData.roomId) {
        return callback?.({ error: 'Not in room' })
      }

      // Notify the rejected participant
      callCenter.to(socketData.roomId).emit('waitingroom:rejected', {
        participantId: payload.participantId,
      })

      // Update database
      await prisma.roomParticipant.update({
        where: { id: payload.participantId },
        data: {
          isConnected: false,
          leftAt: new Date(),
        },
      })

      callback?.({ success: true })
    })

    // =========================================================================
    // Phase 1.5: CUE SYSTEM
    // =========================================================================

    // Send a cue to participants
    socket.on('cue:send', async (payload: SendCuePayload, callback) => {
      try {
        const { roomId, cueType, cueText, targetParticipantId } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        // Create cue in database
        const cue = await prisma.roomCue.create({
          data: {
            roomId,
            cueType,
            cueText: cueText || null,
            targetParticipantId: targetParticipantId || null,
            sentById: socketData.participantId,
          },
        })

        // Broadcast to room
        if (targetParticipantId) {
          // Send to specific participant
          callCenter.to(roomId).emit('cue:received', {
            cue: {
              ...cue,
              sentAt: cue.sentAt.toISOString(),
            },
          })
        } else {
          // Send to all participants
          callCenter.to(roomId).emit('cue:received', {
            cue: {
              ...cue,
              sentAt: cue.sentAt.toISOString(),
            },
          })
        }

        callback?.({ success: true, cue })
        console.log(`[CallCenter] Cue sent: ${cueType} in room ${roomId}`)
      } catch (error) {
        console.error('[CallCenter] Error sending cue:', error)
        callback?.({ error: 'Failed to send cue' })
      }
    })

    // Clear cue
    socket.on('cue:clear', async (payload: { roomId: string; targetParticipantId?: string }, callback) => {
      try {
        const { roomId, targetParticipantId } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        // Delete cues from database
        if (targetParticipantId) {
          await prisma.roomCue.deleteMany({
            where: { roomId, targetParticipantId },
          })
        } else {
          await prisma.roomCue.deleteMany({
            where: { roomId, targetParticipantId: null },
          })
        }

        // Broadcast clear event
        callCenter.to(roomId).emit('cue:cleared', {
          roomId,
          targetParticipantId,
        })

        callback?.({ success: true })
      } catch (error) {
        console.error('[CallCenter] Error clearing cue:', error)
        callback?.({ error: 'Failed to clear cue' })
      }
    })

    // =========================================================================
    // Phase 3.1: CHAT SYSTEM
    // =========================================================================

    // Send chat message
    socket.on('chat:send', async (payload: SendChatPayload, callback) => {
      try {
        const { roomId, content, recipientId, type } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        // Create message in database
        const message = await prisma.chatMessage.create({
          data: {
            roomId,
            senderId: socketData.participantId,
            senderName: socketData.displayName || 'Unknown',
            recipientId: recipientId || null,
            content,
            type: type || 'CHAT',
          },
        })

        const messageData = {
          ...message,
          createdAt: message.createdAt.toISOString(),
        }

        // Broadcast based on type and recipient
        if (recipientId) {
          // Private message - send only to sender and recipient
          socket.emit('chat:message', { message: messageData })
          // Find recipient's socket and send to them
          callCenter.to(roomId).emit('chat:private', {
            message: messageData,
            forParticipantId: recipientId,
          })
        } else if (type === 'PRODUCER_NOTE') {
          // Producer note - only to hosts/moderators
          callCenter.to(roomId).emit('chat:producer-note', { message: messageData })
        } else {
          // Room-wide message
          callCenter.to(roomId).emit('chat:message', { message: messageData })
        }

        callback?.({ success: true, message: messageData })
      } catch (error) {
        console.error('[CallCenter] Error sending chat:', error)
        callback?.({ error: 'Failed to send message' })
      }
    })

    // Get chat history
    socket.on('chat:history', async (payload: { roomId: string; limit?: number }, callback) => {
      try {
        const { roomId, limit = 100 } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        const messages = await prisma.chatMessage.findMany({
          where: {
            roomId,
            OR: [
              { recipientId: null }, // Room-wide messages
              { senderId: socketData.participantId }, // Messages I sent
              { recipientId: socketData.participantId }, // Messages sent to me
            ],
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
        })

        callback?.({
          success: true,
          messages: messages.reverse().map((m) => ({
            ...m,
            createdAt: m.createdAt.toISOString(),
          })),
        })
      } catch (error) {
        console.error('[CallCenter] Error getting chat history:', error)
        callback?.({ error: 'Failed to get chat history' })
      }
    })

    // =========================================================================
    // Phase 3.2: TIMER SYSTEM
    // =========================================================================

    // Create timer
    socket.on('timer:create', async (payload: CreateTimerPayload, callback) => {
      try {
        const { roomId, name, type, durationMs, visibleToAll } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        const timer = await prisma.roomTimer.create({
          data: {
            roomId,
            name: name || 'Timer',
            type,
            durationMs: durationMs || null,
            visibleToAll: visibleToAll ?? true,
          },
        })

        const timerData = {
          ...timer,
          startedAt: timer.startedAt?.toISOString() || null,
          pausedAt: timer.pausedAt?.toISOString() || null,
          createdAt: timer.createdAt.toISOString(),
          updatedAt: timer.updatedAt.toISOString(),
        }

        callCenter.to(roomId).emit('timer:created', { timer: timerData })
        callback?.({ success: true, timer: timerData })
      } catch (error) {
        console.error('[CallCenter] Error creating timer:', error)
        callback?.({ error: 'Failed to create timer' })
      }
    })

    // Start timer
    socket.on('timer:start', async (payload: TimerActionPayload, callback) => {
      try {
        const { roomId, timerId } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        const now = new Date()
        await prisma.roomTimer.update({
          where: { id: timerId },
          data: {
            isRunning: true,
            startedAt: now,
            pausedAt: null,
          },
        })

        callCenter.to(roomId).emit('timer:started', {
          timerId,
          startedAt: now.toISOString(),
        })

        callback?.({ success: true })
      } catch (error) {
        console.error('[CallCenter] Error starting timer:', error)
        callback?.({ error: 'Failed to start timer' })
      }
    })

    // Pause timer
    socket.on('timer:pause', async (payload: TimerActionPayload, callback) => {
      try {
        const { roomId, timerId } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        const timer = await prisma.roomTimer.findUnique({ where: { id: timerId } })
        if (!timer || !timer.startedAt) {
          return callback?.({ error: 'Timer not running' })
        }

        const now = new Date()
        const elapsedMs = now.getTime() - timer.startedAt.getTime()
        const remainingMs = timer.durationMs ? timer.durationMs - elapsedMs : elapsedMs

        await prisma.roomTimer.update({
          where: { id: timerId },
          data: {
            isRunning: false,
            pausedAt: now,
          },
        })

        callCenter.to(roomId).emit('timer:paused', {
          timerId,
          pausedAt: now.toISOString(),
          remainingMs: Math.max(0, remainingMs),
        })

        callback?.({ success: true })
      } catch (error) {
        console.error('[CallCenter] Error pausing timer:', error)
        callback?.({ error: 'Failed to pause timer' })
      }
    })

    // Reset timer
    socket.on('timer:reset', async (payload: TimerActionPayload, callback) => {
      try {
        const { roomId, timerId } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        await prisma.roomTimer.update({
          where: { id: timerId },
          data: {
            isRunning: false,
            startedAt: null,
            pausedAt: null,
          },
        })

        callCenter.to(roomId).emit('timer:reset', { timerId })
        callback?.({ success: true })
      } catch (error) {
        console.error('[CallCenter] Error resetting timer:', error)
        callback?.({ error: 'Failed to reset timer' })
      }
    })

    // Delete timer
    socket.on('timer:delete', async (payload: TimerActionPayload, callback) => {
      try {
        const { roomId, timerId } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        await prisma.roomTimer.delete({ where: { id: timerId } })
        callCenter.to(roomId).emit('timer:deleted', { timerId })
        callback?.({ success: true })
      } catch (error) {
        console.error('[CallCenter] Error deleting timer:', error)
        callback?.({ error: 'Failed to delete timer' })
      }
    })

    // Get timers for room
    socket.on('timer:list', async (payload: { roomId: string }, callback) => {
      try {
        const { roomId } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        const timers = await prisma.roomTimer.findMany({
          where: { roomId },
          orderBy: { createdAt: 'asc' },
        })

        callback?.({
          success: true,
          timers: timers.map((t) => ({
            ...t,
            startedAt: t.startedAt?.toISOString() || null,
            pausedAt: t.pausedAt?.toISOString() || null,
            createdAt: t.createdAt.toISOString(),
            updatedAt: t.updatedAt.toISOString(),
          })),
        })
      } catch (error) {
        console.error('[CallCenter] Error listing timers:', error)
        callback?.({ error: 'Failed to list timers' })
      }
    })

    // =========================================================================
    // Phase 1.4: RUNDOWN SYSTEM
    // =========================================================================

    // Set current rundown item
    socket.on('rundown:set-current', async (payload: RundownItemPayload, callback) => {
      try {
        const { roomId, itemId } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        // Get current item and its rundown
        const item = await prisma.rundownItem.findUnique({
          where: { id: itemId },
          include: { rundown: true },
        })

        if (!item || item.rundown.roomId !== roomId) {
          return callback?.({ error: 'Item not found' })
        }

        // Find previous current item
        const previousCurrent = await prisma.rundownItem.findFirst({
          where: { rundownId: item.rundownId, isCurrent: true },
        })

        // Update: unset previous current, set new current
        await prisma.$transaction([
          prisma.rundownItem.updateMany({
            where: { rundownId: item.rundownId, isCurrent: true },
            data: { isCurrent: false },
          }),
          prisma.rundownItem.update({
            where: { id: itemId },
            data: { isCurrent: true, actualStartAt: new Date() },
          }),
          // Mark previous as completed if it exists
          ...(previousCurrent
            ? [
                prisma.rundownItem.update({
                  where: { id: previousCurrent.id },
                  data: { isCompleted: true, actualEndAt: new Date() },
                }),
              ]
            : []),
        ])

        callCenter.to(roomId).emit('rundown:item-current', {
          itemId,
          previousItemId: previousCurrent?.id,
        })

        callback?.({ success: true })
      } catch (error) {
        console.error('[CallCenter] Error setting current item:', error)
        callback?.({ error: 'Failed to set current item' })
      }
    })

    // Get rundown for room
    socket.on('rundown:get', async (payload: { roomId: string }, callback) => {
      try {
        const { roomId } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        const rundown = await prisma.rundown.findUnique({
          where: { roomId },
          include: {
            items: { orderBy: { order: 'asc' } },
          },
        })

        if (!rundown) {
          return callback?.({ success: true, rundown: null })
        }

        callback?.({
          success: true,
          rundown: {
            ...rundown,
            createdAt: rundown.createdAt.toISOString(),
            updatedAt: rundown.updatedAt.toISOString(),
            items: rundown.items.map((item) => ({
              ...item,
              actualStartAt: item.actualStartAt?.toISOString() || null,
              actualEndAt: item.actualEndAt?.toISOString() || null,
            })),
          },
        })
      } catch (error) {
        console.error('[CallCenter] Error getting rundown:', error)
        callback?.({ error: 'Failed to get rundown' })
      }
    })

    // =========================================================================
    // Phase 1.1: RECORDING SYSTEM
    // =========================================================================

    interface StartRecordingPayload {
      roomId: string
      type: 'INDIVIDUAL' | 'MIX'
      participantId?: string
      format?: string
      sampleRate?: number
      bitDepth?: number
      channels?: number
    }

    interface RecordingActionPayload {
      roomId: string
      recordingId: string
    }

    // Start a recording
    socket.on('recording:start', async (payload: StartRecordingPayload, callback) => {
      try {
        const { roomId, type, participantId, format, sampleRate, bitDepth, channels } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        // Verify host permissions
        const participant = await prisma.roomParticipant.findUnique({
          where: { id: socketData.participantId },
          include: {
            room: {
              include: {
                organization: {
                  include: { members: { where: { userId: socketData.userId || '' } } },
                },
              },
            },
          },
        })

        const isHost = participant?.room.createdById === socketData.userId
        const isAdmin = participant?.room.organization.members[0]?.role === 'OWNER' ||
          participant?.room.organization.members[0]?.role === 'ADMIN'

        if (!isHost && !isAdmin) {
          return callback?.({ error: 'Only hosts can start recordings' })
        }

        // Get participant name if individual recording
        let participantName: string | null = null
        if (type === 'INDIVIDUAL' && participantId) {
          const targetParticipant = await prisma.roomParticipant.findUnique({
            where: { id: participantId },
          })
          participantName = targetParticipant?.displayName || null
        }

        // Create recording
        const recording = await prisma.recording.create({
          data: {
            roomId,
            participantId: type === 'INDIVIDUAL' ? participantId : null,
            participantName,
            type,
            format: format || 'wav',
            sampleRate: sampleRate || 48000,
            bitDepth: bitDepth || 24,
            channels: channels || 2,
            status: 'RECORDING',
            storageProvider: 'local',
          },
        })

        // Notify all participants
        callCenter.to(roomId).emit('recording:started', {
          recording: {
            ...recording,
            fileSize: recording.fileSize?.toString() || null,
            startedAt: recording.startedAt.toISOString(),
            endedAt: null,
          },
        })

        callback?.({
          success: true,
          recording: {
            ...recording,
            fileSize: recording.fileSize?.toString() || null,
            startedAt: recording.startedAt.toISOString(),
            endedAt: null,
          },
        })
      } catch (error) {
        console.error('[CallCenter] Error starting recording:', error)
        callback?.({ error: 'Failed to start recording' })
      }
    })

    // Stop a recording
    socket.on('recording:stop', async (payload: RecordingActionPayload, callback) => {
      try {
        const { roomId, recordingId } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        const recording = await prisma.recording.findUnique({
          where: { id: recordingId },
        })

        if (!recording || recording.roomId !== roomId) {
          return callback?.({ error: 'Recording not found' })
        }

        if (recording.status !== 'RECORDING') {
          return callback?.({ error: 'Recording is not active' })
        }

        // Update recording
        const updatedRecording = await prisma.recording.update({
          where: { id: recordingId },
          data: {
            status: 'PROCESSING',
            endedAt: new Date(),
            durationMs: Date.now() - recording.startedAt.getTime(),
          },
        })

        // Notify all participants
        callCenter.to(roomId).emit('recording:stopped', {
          recording: {
            ...updatedRecording,
            fileSize: updatedRecording.fileSize?.toString() || null,
            startedAt: updatedRecording.startedAt.toISOString(),
            endedAt: updatedRecording.endedAt?.toISOString() || null,
          },
        })

        callback?.({
          success: true,
          recording: {
            ...updatedRecording,
            fileSize: updatedRecording.fileSize?.toString() || null,
            startedAt: updatedRecording.startedAt.toISOString(),
            endedAt: updatedRecording.endedAt?.toISOString() || null,
          },
        })
      } catch (error) {
        console.error('[CallCenter] Error stopping recording:', error)
        callback?.({ error: 'Failed to stop recording' })
      }
    })

    // Get recordings for room
    socket.on('recording:list', async (payload: { roomId: string }, callback) => {
      try {
        const { roomId } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        const recordings = await prisma.recording.findMany({
          where: { roomId },
          orderBy: { startedAt: 'desc' },
        })

        callback?.({
          success: true,
          recordings: recordings.map((r) => ({
            ...r,
            fileSize: r.fileSize?.toString() || null,
            startedAt: r.startedAt.toISOString(),
            endedAt: r.endedAt?.toISOString() || null,
          })),
        })
      } catch (error) {
        console.error('[CallCenter] Error listing recordings:', error)
        callback?.({ error: 'Failed to list recordings' })
      }
    })

    // =========================================================================
    // Phase 1.2: IFB/TALKBACK SYSTEM
    // =========================================================================

    interface CreateTalkbackGroupPayload {
      roomId: string
      name: string
      color?: string
      participantIds?: string[]
    }

    interface UpdateTalkbackGroupPayload {
      roomId: string
      groupId: string
      name?: string
      color?: string
    }

    interface TalkbackGroupMemberPayload {
      roomId: string
      groupId: string
      participantId: string
    }

    interface StartIFBPayload {
      roomId: string
      targetType: 'PARTICIPANT' | 'GROUP' | 'ALL'
      targetParticipantId?: string
      targetGroupId?: string
      level?: number
      duckingLevel?: number
    }

    interface UpdateIFBPayload {
      roomId: string
      sessionId: string
      level?: number
      duckingLevel?: number
    }

    interface EndIFBPayload {
      roomId: string
      sessionId: string
    }

    // Create talkback group
    socket.on('talkback:create-group', async (payload: CreateTalkbackGroupPayload, callback) => {
      try {
        const { roomId, name, color, participantIds } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        // Create group
        const group = await prisma.talkbackGroup.create({
          data: {
            roomId,
            name,
            color: color || null,
            members: participantIds
              ? {
                  create: participantIds.map((id) => ({ participantId: id })),
                }
              : undefined,
          },
          include: {
            members: {
              include: { participant: true },
            },
          },
        })

        const groupData = {
          ...group,
          createdAt: group.createdAt.toISOString(),
          updatedAt: group.updatedAt.toISOString(),
          members: group.members.map((m) => ({
            ...m,
            createdAt: m.createdAt.toISOString(),
          })),
        }

        callCenter.to(roomId).emit('talkback:group-created', { group: groupData })
        callback?.({ success: true, group: groupData })
        console.log(`[CallCenter] Talkback group created: ${name} in room ${roomId}`)
      } catch (error) {
        console.error('[CallCenter] Error creating talkback group:', error)
        callback?.({ error: 'Failed to create talkback group' })
      }
    })

    // Update talkback group
    socket.on('talkback:update-group', async (payload: UpdateTalkbackGroupPayload, callback) => {
      try {
        const { roomId, groupId, name, color } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        const group = await prisma.talkbackGroup.update({
          where: { id: groupId },
          data: {
            ...(name && { name }),
            ...(color !== undefined && { color }),
          },
          include: {
            members: {
              include: { participant: true },
            },
          },
        })

        const groupData = {
          ...group,
          createdAt: group.createdAt.toISOString(),
          updatedAt: group.updatedAt.toISOString(),
          members: group.members.map((m) => ({
            ...m,
            createdAt: m.createdAt.toISOString(),
          })),
        }

        callCenter.to(roomId).emit('talkback:group-updated', { group: groupData })
        callback?.({ success: true, group: groupData })
      } catch (error) {
        console.error('[CallCenter] Error updating talkback group:', error)
        callback?.({ error: 'Failed to update talkback group' })
      }
    })

    // Delete talkback group
    socket.on('talkback:delete-group', async (payload: { roomId: string; groupId: string }, callback) => {
      try {
        const { roomId, groupId } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        await prisma.talkbackGroup.delete({ where: { id: groupId } })

        callCenter.to(roomId).emit('talkback:group-deleted', { groupId })
        callback?.({ success: true })
      } catch (error) {
        console.error('[CallCenter] Error deleting talkback group:', error)
        callback?.({ error: 'Failed to delete talkback group' })
      }
    })

    // Add member to talkback group
    socket.on('talkback:add-member', async (payload: TalkbackGroupMemberPayload, callback) => {
      try {
        const { roomId, groupId, participantId } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        const member = await prisma.talkbackGroupMember.create({
          data: { groupId, participantId },
          include: { participant: true },
        })

        const memberData = {
          ...member,
          createdAt: member.createdAt.toISOString(),
        }

        callCenter.to(roomId).emit('talkback:member-added', { groupId, member: memberData })
        callback?.({ success: true, member: memberData })
      } catch (error) {
        console.error('[CallCenter] Error adding talkback member:', error)
        callback?.({ error: 'Failed to add member to group' })
      }
    })

    // Remove member from talkback group
    socket.on('talkback:remove-member', async (payload: TalkbackGroupMemberPayload, callback) => {
      try {
        const { roomId, groupId, participantId } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        await prisma.talkbackGroupMember.delete({
          where: { groupId_participantId: { groupId, participantId } },
        })

        callCenter.to(roomId).emit('talkback:member-removed', { groupId, participantId })
        callback?.({ success: true })
      } catch (error) {
        console.error('[CallCenter] Error removing talkback member:', error)
        callback?.({ error: 'Failed to remove member from group' })
      }
    })

    // List talkback groups for room
    socket.on('talkback:list-groups', async (payload: { roomId: string }, callback) => {
      try {
        const { roomId } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        const groups = await prisma.talkbackGroup.findMany({
          where: { roomId },
          include: {
            members: {
              include: { participant: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        })

        callback?.({
          success: true,
          groups: groups.map((g) => ({
            ...g,
            createdAt: g.createdAt.toISOString(),
            updatedAt: g.updatedAt.toISOString(),
            members: g.members.map((m) => ({
              ...m,
              createdAt: m.createdAt.toISOString(),
            })),
          })),
        })
      } catch (error) {
        console.error('[CallCenter] Error listing talkback groups:', error)
        callback?.({ error: 'Failed to list talkback groups' })
      }
    })

    // Start IFB session (talk to someone's earpiece)
    socket.on('ifb:start', async (payload: StartIFBPayload, callback) => {
      try {
        const { roomId, targetType, targetParticipantId, targetGroupId, level, duckingLevel } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        // Validate target based on type
        if (targetType === 'PARTICIPANT' && !targetParticipantId) {
          return callback?.({ error: 'Participant ID required' })
        }
        if (targetType === 'GROUP' && !targetGroupId) {
          return callback?.({ error: 'Group ID required' })
        }

        // Create IFB session
        const session = await prisma.iFBSession.create({
          data: {
            roomId,
            senderId: socketData.participantId,
            targetType,
            targetParticipantId: targetType === 'PARTICIPANT' ? targetParticipantId : null,
            targetGroupId: targetType === 'GROUP' ? targetGroupId : null,
            level: level ?? 1.0,
            duckingLevel: duckingLevel ?? 0.3,
            isActive: true,
          },
          include: {
            sender: true,
            targetParticipant: true,
          },
        })

        const sessionData = {
          ...session,
          startedAt: session.startedAt.toISOString(),
          endedAt: null,
        }

        // Get the TB bus producer so clients can consume it
        // Try multiple times in case producer is still being created
        let tbProducer = mediasoupService.getBusProducer(roomId, 'TB')

        if (!tbProducer) {
          // Wait and retry a few times (host may still be creating producers)
          console.log(`[CallCenter] TB producer not immediately available, waiting...`)
          for (let i = 0; i < 5; i++) {
            await new Promise(resolve => setTimeout(resolve, 500))
            tbProducer = mediasoupService.getBusProducer(roomId, 'TB')
            if (tbProducer) break
          }
        }

        if (!tbProducer) {
          // Still not found - warn but also include diagnostic info
          console.warn(`[CallCenter] IFB started but no TB producer found in room ${roomId}`)
          const diagnostics = mediasoupService.getRoomDiagnostics(roomId)
          console.warn(`[CallCenter] Room diagnostics:`, JSON.stringify(diagnostics, null, 2))

          // Include warning in the payload so clients know there's an issue
          console.warn(`[CallCenter] IFB session ${session.id} has no TB producer - audio will not be available`)
        }

        // Build the IFB event payload with TB producer info
        const ifbPayload = {
          session: sessionData,
          tbProducerId: tbProducer?.producerId || null,
          tbProducerParticipantId: tbProducer?.participantId || null,
          warning: !tbProducer ? 'No TB producer available - ensure host has talkback bus enabled' : undefined,
        }

        // Notify relevant participants
        // Also emit to IFB channel for green room participants
        const ifbChannel = `${roomId}:ifb`

        if (targetType === 'ALL') {
          callCenter.to(roomId).emit('ifb:started', ifbPayload)
          // Also notify green room participants via IFB channel
          callCenter.to(ifbChannel).emit('ifb:started', ifbPayload)
        } else if (targetType === 'PARTICIPANT' && targetParticipantId) {
          // Send to specific participant
          const participantPayload = {
            ...ifbPayload,
            forParticipantId: targetParticipantId,
          }
          callCenter.to(roomId).emit('ifb:started', participantPayload)
          callCenter.to(ifbChannel).emit('ifb:started', participantPayload)
        } else if (targetType === 'GROUP' && targetGroupId) {
          // Get group members and notify them
          const group = await prisma.talkbackGroup.findUnique({
            where: { id: targetGroupId },
            include: { members: true },
          })
          const memberIds = group?.members.map((m) => m.participantId) || []
          const groupPayload = {
            ...ifbPayload,
            forParticipantIds: memberIds,
          }
          callCenter.to(roomId).emit('ifb:started', groupPayload)
          callCenter.to(ifbChannel).emit('ifb:started', groupPayload)
        }

        callback?.({ success: true, session: sessionData })
        console.log(`[CallCenter] IFB started: ${targetType} from ${socketData.displayName}`)
      } catch (error) {
        console.error('[CallCenter] Error starting IFB:', error)
        callback?.({ error: 'Failed to start IFB' })
      }
    })

    // Update IFB session (adjust levels)
    socket.on('ifb:update', async (payload: UpdateIFBPayload, callback) => {
      try {
        const { roomId, sessionId, level, duckingLevel } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        await prisma.iFBSession.update({
          where: { id: sessionId },
          data: {
            ...(level !== undefined && { level }),
            ...(duckingLevel !== undefined && { duckingLevel }),
          },
        })

        const ifbUpdatePayload = {
          sessionId,
          level,
          duckingLevel,
        }
        callCenter.to(roomId).emit('ifb:updated', ifbUpdatePayload)
        // Also notify green room participants
        callCenter.to(`${roomId}:ifb`).emit('ifb:updated', ifbUpdatePayload)

        callback?.({ success: true })
      } catch (error) {
        console.error('[CallCenter] Error updating IFB:', error)
        callback?.({ error: 'Failed to update IFB' })
      }
    })

    // End IFB session
    socket.on('ifb:end', async (payload: EndIFBPayload, callback) => {
      try {
        const { roomId, sessionId } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        await prisma.iFBSession.update({
          where: { id: sessionId },
          data: {
            isActive: false,
            endedAt: new Date(),
          },
        })

        callCenter.to(roomId).emit('ifb:ended', { sessionId })
        // Also notify green room participants
        callCenter.to(`${roomId}:ifb`).emit('ifb:ended', { sessionId })
        callback?.({ success: true })
      } catch (error) {
        console.error('[CallCenter] Error ending IFB:', error)
        callback?.({ error: 'Failed to end IFB' })
      }
    })

    // List active IFB sessions for room
    socket.on('ifb:list', async (payload: { roomId: string }, callback) => {
      try {
        const { roomId } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        const sessions = await prisma.iFBSession.findMany({
          where: { roomId, isActive: true },
          include: {
            sender: true,
            targetParticipant: true,
          },
        })

        callback?.({
          success: true,
          sessions: sessions.map((s) => ({
            ...s,
            startedAt: s.startedAt.toISOString(),
            endedAt: s.endedAt?.toISOString() || null,
          })),
        })
      } catch (error) {
        console.error('[CallCenter] Error listing IFB sessions:', error)
        callback?.({ error: 'Failed to list IFB sessions' })
      }
    })

    // =========================================================================
    // Phase 2.5: REMOTE CONTROL SYSTEM
    // Producer can remotely adjust contributor's input gain, mute, EQ, etc.
    // =========================================================================

    interface RemoteGainPayload {
      roomId: string
      participantId: string
      gain: number // 0.0 - 2.0
    }

    interface RemoteMutePayload {
      roomId: string
      participantId: string
      muted: boolean
    }

    interface RemoteEQPayload {
      roomId: string
      participantId: string
      lowGain?: number
      midGain?: number
      highGain?: number
      lowFreq?: number
      midFreq?: number
      highFreq?: number
    }

    interface RemoteCompressorPayload {
      roomId: string
      participantId: string
      threshold?: number
      ratio?: number
      attack?: number
      release?: number
      makeupGain?: number
      enabled?: boolean
    }

    interface RemoteGatePayload {
      roomId: string
      participantId: string
      threshold?: number
      attack?: number
      hold?: number
      release?: number
      enabled?: boolean
    }

    interface RemoteResetPayload {
      roomId: string
      participantId: string
      controlType?: 'GAIN' | 'MUTE' | 'EQ' | 'COMPRESSOR' | 'GATE'
    }

    // Check if user is a producer (host or moderator)
    async function isProducer(participantId: string, roomId: string): Promise<boolean> {
      const participant = await prisma.roomParticipant.findUnique({
        where: { id: participantId },
        include: { room: true },
      })
      if (!participant || participant.roomId !== roomId) return false
      // Host or moderator can control
      return participant.role === 'HOST' || participant.role === 'MODERATOR'
    }

    // Set remote gain for a participant
    socket.on('remote:set-gain', async (payload: RemoteGainPayload, callback) => {
      try {
        const { roomId, participantId, gain } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        // Verify producer permissions
        const hasPermission = await isProducer(socketData.participantId, roomId)
        if (!hasPermission) {
          return callback?.({ error: 'Only producers can use remote control' })
        }

        // Validate gain range
        const clampedGain = Math.max(0, Math.min(2, gain))

        // Broadcast to room - the target participant will apply this
        callCenter.to(roomId).emit('remote:gain-changed', {
          participantId,
          gain: clampedGain,
          changedById: socketData.participantId,
          changedByName: socketData.displayName,
        })

        callback?.({ success: true, gain: clampedGain })
        console.log(`[CallCenter] Remote gain set: ${clampedGain} for ${participantId} by ${socketData.displayName}`)
      } catch (error) {
        console.error('[CallCenter] Error setting remote gain:', error)
        callback?.({ error: 'Failed to set remote gain' })
      }
    })

    // Set remote mute for a participant
    socket.on('remote:set-mute', async (payload: RemoteMutePayload, callback) => {
      try {
        const { roomId, participantId, muted } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        const hasPermission = await isProducer(socketData.participantId, roomId)
        if (!hasPermission) {
          return callback?.({ error: 'Only producers can use remote control' })
        }

        // Broadcast to room
        callCenter.to(roomId).emit('remote:mute-changed', {
          participantId,
          muted,
          changedById: socketData.participantId,
          changedByName: socketData.displayName,
        })

        callback?.({ success: true, muted })
        console.log(`[CallCenter] Remote mute set: ${muted} for ${participantId} by ${socketData.displayName}`)
      } catch (error) {
        console.error('[CallCenter] Error setting remote mute:', error)
        callback?.({ error: 'Failed to set remote mute' })
      }
    })

    // Set remote EQ for a participant
    socket.on('remote:set-eq', async (payload: RemoteEQPayload, callback) => {
      try {
        const { roomId, participantId, ...eqSettings } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        const hasPermission = await isProducer(socketData.participantId, roomId)
        if (!hasPermission) {
          return callback?.({ error: 'Only producers can use remote control' })
        }

        // Clamp EQ values to valid ranges
        const clampedEQ = {
          ...(eqSettings.lowGain !== undefined && { lowGain: Math.max(-12, Math.min(12, eqSettings.lowGain)) }),
          ...(eqSettings.midGain !== undefined && { midGain: Math.max(-12, Math.min(12, eqSettings.midGain)) }),
          ...(eqSettings.highGain !== undefined && { highGain: Math.max(-12, Math.min(12, eqSettings.highGain)) }),
          ...(eqSettings.lowFreq !== undefined && { lowFreq: Math.max(20, Math.min(500, eqSettings.lowFreq)) }),
          ...(eqSettings.midFreq !== undefined && { midFreq: Math.max(200, Math.min(5000, eqSettings.midFreq)) }),
          ...(eqSettings.highFreq !== undefined && { highFreq: Math.max(2000, Math.min(20000, eqSettings.highFreq)) }),
        }

        // Broadcast to room
        callCenter.to(roomId).emit('remote:eq-changed', {
          participantId,
          eq: clampedEQ,
          changedById: socketData.participantId,
          changedByName: socketData.displayName,
        })

        callback?.({ success: true, eq: clampedEQ })
        console.log(`[CallCenter] Remote EQ set for ${participantId} by ${socketData.displayName}`)
      } catch (error) {
        console.error('[CallCenter] Error setting remote EQ:', error)
        callback?.({ error: 'Failed to set remote EQ' })
      }
    })

    // Set remote compressor for a participant
    socket.on('remote:set-compressor', async (payload: RemoteCompressorPayload, callback) => {
      try {
        const { roomId, participantId, ...compSettings } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        const hasPermission = await isProducer(socketData.participantId, roomId)
        if (!hasPermission) {
          return callback?.({ error: 'Only producers can use remote control' })
        }

        // Clamp compressor values to valid ranges
        const clampedComp = {
          ...(compSettings.threshold !== undefined && { threshold: Math.max(-60, Math.min(0, compSettings.threshold)) }),
          ...(compSettings.ratio !== undefined && { ratio: Math.max(1, Math.min(20, compSettings.ratio)) }),
          ...(compSettings.attack !== undefined && { attack: Math.max(0.1, Math.min(100, compSettings.attack)) }),
          ...(compSettings.release !== undefined && { release: Math.max(10, Math.min(1000, compSettings.release)) }),
          ...(compSettings.makeupGain !== undefined && { makeupGain: Math.max(0, Math.min(24, compSettings.makeupGain)) }),
          ...(compSettings.enabled !== undefined && { enabled: compSettings.enabled }),
        }

        // Broadcast to room
        callCenter.to(roomId).emit('remote:compressor-changed', {
          participantId,
          compressor: clampedComp,
          changedById: socketData.participantId,
          changedByName: socketData.displayName,
        })

        callback?.({ success: true, compressor: clampedComp })
        console.log(`[CallCenter] Remote compressor set for ${participantId} by ${socketData.displayName}`)
      } catch (error) {
        console.error('[CallCenter] Error setting remote compressor:', error)
        callback?.({ error: 'Failed to set remote compressor' })
      }
    })

    // Set remote gate for a participant
    socket.on('remote:set-gate', async (payload: RemoteGatePayload, callback) => {
      try {
        const { roomId, participantId, ...gateSettings } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        const hasPermission = await isProducer(socketData.participantId, roomId)
        if (!hasPermission) {
          return callback?.({ error: 'Only producers can use remote control' })
        }

        // Clamp gate values to valid ranges
        const clampedGate = {
          ...(gateSettings.threshold !== undefined && { threshold: Math.max(-100, Math.min(0, gateSettings.threshold)) }),
          ...(gateSettings.attack !== undefined && { attack: Math.max(0.1, Math.min(50, gateSettings.attack)) }),
          ...(gateSettings.hold !== undefined && { hold: Math.max(0, Math.min(500, gateSettings.hold)) }),
          ...(gateSettings.release !== undefined && { release: Math.max(10, Math.min(1000, gateSettings.release)) }),
          ...(gateSettings.enabled !== undefined && { enabled: gateSettings.enabled }),
        }

        // Broadcast to room
        callCenter.to(roomId).emit('remote:gate-changed', {
          participantId,
          gate: clampedGate,
          changedById: socketData.participantId,
          changedByName: socketData.displayName,
        })

        callback?.({ success: true, gate: clampedGate })
        console.log(`[CallCenter] Remote gate set for ${participantId} by ${socketData.displayName}`)
      } catch (error) {
        console.error('[CallCenter] Error setting remote gate:', error)
        callback?.({ error: 'Failed to set remote gate' })
      }
    })

    // Reset remote control settings for a participant
    socket.on('remote:reset', async (payload: RemoteResetPayload, callback) => {
      try {
        const { roomId, participantId, controlType } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        const hasPermission = await isProducer(socketData.participantId, roomId)
        if (!hasPermission) {
          return callback?.({ error: 'Only producers can use remote control' })
        }

        // Broadcast reset event
        callCenter.to(roomId).emit('remote:control-reset', {
          participantId,
          controlType,
          changedById: socketData.participantId,
          changedByName: socketData.displayName,
        })

        callback?.({ success: true })
        console.log(`[CallCenter] Remote control reset: ${controlType || 'ALL'} for ${participantId} by ${socketData.displayName}`)
      } catch (error) {
        console.error('[CallCenter] Error resetting remote control:', error)
        callback?.({ error: 'Failed to reset remote control' })
      }
    })

    // Request current remote control state for a participant
    socket.on('remote:get-state', async (payload: { roomId: string; participantId: string }, callback) => {
      try {
        const { roomId, participantId } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        // Request state from the target participant
        // The target will respond via 'remote:state-response'
        callCenter.to(roomId).emit('remote:state-request', {
          participantId,
          requestedBy: socketData.participantId,
        })

        callback?.({ success: true })
      } catch (error) {
        console.error('[CallCenter] Error requesting remote state:', error)
        callback?.({ error: 'Failed to request remote state' })
      }
    })

    // Participant responds with their current state
    socket.on('remote:state-response', async (payload: { roomId: string; state: unknown }, callback) => {
      try {
        const { roomId, state } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        // Broadcast the state to producers
        callCenter.to(roomId).emit('remote:state-updated', {
          participantId: socketData.participantId,
          state,
        })

        callback?.({ success: true })
      } catch (error) {
        console.error('[CallCenter] Error sending remote state:', error)
        callback?.({ error: 'Failed to send remote state' })
      }
    })

    // =========================================================================
    // Phase 2.2: GREEN ROOM / MULTI-ROOM SYSTEM
    // Pre-show staging and seamless participant movement between rooms
    // =========================================================================

    interface CreateGreenRoomPayload {
      parentRoomId: string
      name: string
      type?: 'GREEN_ROOM' | 'BREAKOUT'
    }

    interface MoveParticipantPayload {
      roomId: string
      participantId: string
      targetRoomId: string
      queuePosition?: number
    }

    interface UpdateQueuePayload {
      roomId: string
      participantId: string
      queuePosition: number
    }

    interface CountdownPayload {
      roomId: string
      participantId: string
      seconds: number
      targetRoomId: string
    }

    // Create a green room or breakout room
    socket.on('greenroom:create', async (payload: CreateGreenRoomPayload, callback) => {
      try {
        const { parentRoomId, name, type } = payload

        if (!socketData.participantId || socketData.roomId !== parentRoomId) {
          return callback?.({ error: 'Not in room' })
        }

        // Verify producer permissions
        const hasPermission = await isProducer(socketData.participantId, parentRoomId)
        if (!hasPermission) {
          return callback?.({ error: 'Only producers can create green rooms' })
        }

        // Get parent room to copy organization
        const parentRoom = await prisma.callRoom.findUnique({
          where: { id: parentRoomId },
        })

        if (!parentRoom) {
          return callback?.({ error: 'Parent room not found' })
        }

        // Create the green room
        const greenRoom = await prisma.callRoom.create({
          data: {
            name,
            type: type || 'GREEN_ROOM',
            parentId: parentRoomId,
            organizationId: parentRoom.organizationId,
            createdById: parentRoom.createdById,
            visibility: parentRoom.visibility,
            isActive: true,
            maxParticipants: parentRoom.maxParticipants,
          },
        })

        const greenRoomInfo = {
          id: greenRoom.id,
          name: greenRoom.name,
          type: greenRoom.type,
          parentId: greenRoom.parentId,
          participantCount: 0,
          queuePosition: greenRoom.queuePosition,
          participants: [],
        }

        // Notify all participants in the parent room
        callCenter.to(parentRoomId).emit('greenroom:created', {
          room: greenRoomInfo,
          parentRoomId,
        })

        callback?.({ success: true, room: greenRoomInfo })
        console.log(`[CallCenter] Green room created: ${name} for parent ${parentRoomId}`)
      } catch (error) {
        console.error('[CallCenter] Error creating green room:', error)
        callback?.({ error: 'Failed to create green room' })
      }
    })

    // Delete a green room
    socket.on('greenroom:delete', async (payload: { roomId: string; greenRoomId: string }, callback) => {
      try {
        const { roomId, greenRoomId } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        const hasPermission = await isProducer(socketData.participantId, roomId)
        if (!hasPermission) {
          return callback?.({ error: 'Only producers can delete green rooms' })
        }

        // Verify it's a child room
        const greenRoom = await prisma.callRoom.findUnique({
          where: { id: greenRoomId },
        })

        if (!greenRoom || greenRoom.parentId !== roomId) {
          return callback?.({ error: 'Green room not found' })
        }

        // Move all participants back to parent room first
        const participants = await prisma.roomParticipant.findMany({
          where: { roomId: greenRoomId, isConnected: true },
        })

        for (const participant of participants) {
          await prisma.roomParticipant.update({
            where: { id: participant.id },
            data: { roomId },
          })
        }

        // Delete the green room
        await prisma.callRoom.delete({ where: { id: greenRoomId } })

        // Notify all participants
        callCenter.to(roomId).emit('greenroom:deleted', {
          roomId: greenRoomId,
          parentRoomId: roomId,
        })

        callback?.({ success: true })
        console.log(`[CallCenter] Green room deleted: ${greenRoomId}`)
      } catch (error) {
        console.error('[CallCenter] Error deleting green room:', error)
        callback?.({ error: 'Failed to delete green room' })
      }
    })

    // List green rooms for a live room
    socket.on('greenroom:list', async (payload: { roomId: string }, callback) => {
      try {
        const { roomId } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        const greenRooms = await prisma.callRoom.findMany({
          where: { parentId: roomId },
          include: {
            participants: {
              where: { isConnected: true },
              orderBy: { joinedAt: 'asc' },
            },
          },
        })

        const greenRoomInfos = greenRooms.map((room) => ({
          id: room.id,
          name: room.name,
          type: room.type,
          parentId: room.parentId,
          participantCount: room.participants.length,
          queuePosition: room.queuePosition,
          participants: room.participants.map((p) => ({
            id: p.id,
            displayName: p.displayName,
            role: p.role,
            isConnected: p.isConnected,
            isSpeaking: p.isSpeaking,
            queuePosition: 0, // Would need to be stored separately
            joinedAt: p.joinedAt.toISOString(),
          })),
        }))

        callback?.({ success: true, greenRooms: greenRoomInfos, liveRoomId: roomId })
      } catch (error) {
        console.error('[CallCenter] Error listing green rooms:', error)
        callback?.({ error: 'Failed to list green rooms' })
      }
    })

    // Move a participant between rooms
    socket.on('greenroom:move-participant', async (payload: MoveParticipantPayload, callback) => {
      try {
        const { roomId, participantId, targetRoomId, queuePosition } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        const hasPermission = await isProducer(socketData.participantId, roomId)
        if (!hasPermission) {
          return callback?.({ error: 'Only producers can move participants' })
        }

        // Get participant info
        const participant = await prisma.roomParticipant.findUnique({
          where: { id: participantId },
          include: { room: true },
        })

        if (!participant) {
          return callback?.({ error: 'Participant not found' })
        }

        // Get target room info
        const targetRoom = await prisma.callRoom.findUnique({
          where: { id: targetRoomId },
        })

        if (!targetRoom) {
          return callback?.({ error: 'Target room not found' })
        }

        const fromRoomId = participant.roomId

        // Update participant's room
        await prisma.roomParticipant.update({
          where: { id: participantId },
          data: { roomId: targetRoomId },
        })

        // Notify source room
        callCenter.to(fromRoomId).emit('greenroom:participant-moved', {
          participantId,
          participantName: participant.displayName,
          fromRoomId,
          toRoomId: targetRoomId,
          toRoomType: targetRoom.type,
          queuePosition: queuePosition || 0,
        })

        // Notify target room
        callCenter.to(targetRoomId).emit('greenroom:participant-moved', {
          participantId,
          participantName: participant.displayName,
          fromRoomId,
          toRoomId: targetRoomId,
          toRoomType: targetRoom.type,
          queuePosition: queuePosition || 0,
        })

        // If moving to live room, also notify parent room hierarchy
        const parentRoomId = targetRoom.parentId || fromRoomId
        if (parentRoomId && parentRoomId !== fromRoomId && parentRoomId !== targetRoomId) {
          callCenter.to(parentRoomId).emit('greenroom:participant-moved', {
            participantId,
            participantName: participant.displayName,
            fromRoomId,
            toRoomId: targetRoomId,
            toRoomType: targetRoom.type,
            queuePosition: queuePosition || 0,
          })
        }

        callback?.({ success: true })
        console.log(`[CallCenter] Participant ${participant.displayName} moved from ${fromRoomId} to ${targetRoomId}`)
      } catch (error) {
        console.error('[CallCenter] Error moving participant:', error)
        callback?.({ error: 'Failed to move participant' })
      }
    })

    // Update participant queue position
    socket.on('greenroom:update-queue', async (payload: UpdateQueuePayload, callback) => {
      try {
        const { roomId, participantId, queuePosition } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        const hasPermission = await isProducer(socketData.participantId, roomId)
        if (!hasPermission) {
          return callback?.({ error: 'Only producers can update queue' })
        }

        // Get participant
        const participant = await prisma.roomParticipant.findUnique({
          where: { id: participantId },
        })

        if (!participant) {
          return callback?.({ error: 'Participant not found' })
        }

        // Notify all rooms in hierarchy
        callCenter.to(roomId).emit('greenroom:queue-position-changed', {
          participantId,
          participantName: participant.displayName,
          roomId: participant.roomId,
          queuePosition,
        })

        callback?.({ success: true })
      } catch (error) {
        console.error('[CallCenter] Error updating queue:', error)
        callback?.({ error: 'Failed to update queue' })
      }
    })

    // Start countdown for participant going live
    socket.on('greenroom:countdown', async (payload: CountdownPayload, callback) => {
      try {
        const { roomId, participantId, seconds, targetRoomId } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        const hasPermission = await isProducer(socketData.participantId, roomId)
        if (!hasPermission) {
          return callback?.({ error: 'Only producers can start countdown' })
        }

        const participant = await prisma.roomParticipant.findUnique({
          where: { id: participantId },
        })

        if (!participant) {
          return callback?.({ error: 'Participant not found' })
        }

        // Broadcast countdown to all relevant rooms
        const countdownEvent = {
          participantId,
          participantName: participant.displayName,
          secondsRemaining: seconds,
          targetRoomId,
        }

        callCenter.to(roomId).emit('greenroom:countdown', countdownEvent)
        callCenter.to(participant.roomId).emit('greenroom:countdown', countdownEvent)
        if (targetRoomId !== roomId && targetRoomId !== participant.roomId) {
          callCenter.to(targetRoomId).emit('greenroom:countdown', countdownEvent)
        }

        callback?.({ success: true })
        console.log(`[CallCenter] Countdown started: ${seconds}s for ${participant.displayName} to ${targetRoomId}`)
      } catch (error) {
        console.error('[CallCenter] Error starting countdown:', error)
        callback?.({ error: 'Failed to start countdown' })
      }
    })

    // Get queue for a room
    socket.on('greenroom:get-queue', async (payload: { roomId: string }, callback) => {
      try {
        const { roomId } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        // Get all participants in green rooms for this parent
        const greenRooms = await prisma.callRoom.findMany({
          where: { parentId: roomId },
          include: {
            participants: {
              where: { isConnected: true },
              orderBy: { joinedAt: 'asc' },
            },
          },
        })

        // Flatten queue from all green rooms
        const queue = greenRooms.flatMap((room, roomIndex) =>
          room.participants.map((p, pIndex) => ({
            participantId: p.id,
            participantName: p.displayName,
            roomId: room.id,
            roomName: room.name,
            queuePosition: roomIndex * 100 + pIndex + 1,
          }))
        )

        callback?.({ success: true, queue })
      } catch (error) {
        console.error('[CallCenter] Error getting queue:', error)
        callback?.({ error: 'Failed to get queue' })
      }
    })

    // =========================================================================
    // Phase 6.2: MIX COORDINATOR SYSTEM
    // Server-side mix state tracking for redundancy and multi-device support
    // =========================================================================

    interface MixRegisterPayload {
      roomId: string
    }

    interface MixHeartbeatPayload {
      roomId: string
    }

    interface MixStateChangePayload {
      roomId: string
      change: MixStateChange
    }

    interface MixFullSyncPayload {
      roomId: string
      state: Partial<RoomMixState>
    }

    interface MixChannelPayload {
      roomId: string
      channelId: string
      participantId?: string
      sourceType?: 'participant' | 'srt' | 'rist' | 'local'
    }

    // Register as primary mixer client for a room
    socket.on('mix:register', async (payload: MixRegisterPayload, callback) => {
      try {
        const { roomId } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        // Only producers can be primary mixer
        const hasPermission = await isProducer(socketData.participantId, roomId)
        if (!hasPermission) {
          return callback?.({ error: 'Only producers can control the mix' })
        }

        const registered = mixCoordinatorService.registerPrimaryClient(roomId, socket.id)
        if (!registered) {
          // Another client is already primary - get their state
          const currentState = mixCoordinatorService.getRoomState(roomId)
          return callback?.({
            success: false,
            error: 'Another client is already the primary mixer',
            currentState,
          })
        }

        // Try to restore previous state
        const restoredState = await mixCoordinatorService.restoreState(roomId)
        const state = restoredState || mixCoordinatorService.getRoomState(roomId)

        callback?.({ success: true, state })
        console.log(`[CallCenter] Mix coordinator registered: ${socketData.displayName} in room ${roomId}`)
      } catch (error) {
        console.error('[CallCenter] Error registering mix coordinator:', error)
        callback?.({ error: 'Failed to register as primary mixer' })
      }
    })

    // Heartbeat from primary mixer (keeps connection alive)
    socket.on('mix:heartbeat', async (payload: MixHeartbeatPayload, callback) => {
      try {
        const { roomId } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        mixCoordinatorService.heartbeat(roomId, socket.id)
        callback?.({ success: true })
      } catch (error) {
        console.error('[CallCenter] Error processing mix heartbeat:', error)
        callback?.({ error: 'Failed to process heartbeat' })
      }
    })

    // Apply a mix state change (fader move, EQ change, routing change, etc.)
    socket.on('mix:state-change', async (payload: MixStateChangePayload, callback) => {
      try {
        const { roomId, change } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        const applied = mixCoordinatorService.applyStateChange(roomId, socket.id, change)
        if (!applied) {
          return callback?.({ error: 'Not the primary mixer or invalid change' })
        }

        // Broadcast to other clients in the room (for multi-device sync)
        socket.to(roomId).emit('mix:state-changed', {
          change,
          sourceClientId: socket.id,
        })

        callback?.({ success: true })
      } catch (error) {
        console.error('[CallCenter] Error applying mix state change:', error)
        callback?.({ error: 'Failed to apply state change' })
      }
    })

    // Full state sync (initial sync or periodic sync)
    socket.on('mix:full-sync', async (payload: MixFullSyncPayload, callback) => {
      try {
        const { roomId, state } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        const synced = mixCoordinatorService.syncFullState(roomId, socket.id, state)
        if (!synced) {
          return callback?.({ error: 'Not the primary mixer' })
        }

        // Persist to database
        await mixCoordinatorService.persistState(roomId)

        // Broadcast to other clients
        socket.to(roomId).emit('mix:full-synced', {
          state: mixCoordinatorService.getRoomState(roomId),
          sourceClientId: socket.id,
        })

        callback?.({ success: true })
      } catch (error) {
        console.error('[CallCenter] Error syncing full mix state:', error)
        callback?.({ error: 'Failed to sync state' })
      }
    })

    // Add a channel to the mix
    socket.on('mix:add-channel', async (payload: MixChannelPayload, callback) => {
      try {
        const { roomId, channelId, participantId, sourceType } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        const channel = mixCoordinatorService.addChannel(roomId, channelId, participantId, sourceType)

        // Broadcast to all clients
        callCenter.to(roomId).emit('mix:channel-added', {
          channel,
          sourceClientId: socket.id,
        })

        callback?.({ success: true, channel })
      } catch (error) {
        console.error('[CallCenter] Error adding mix channel:', error)
        callback?.({ error: 'Failed to add channel' })
      }
    })

    // Remove a channel from the mix
    socket.on('mix:remove-channel', async (payload: MixChannelPayload, callback) => {
      try {
        const { roomId, channelId } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        mixCoordinatorService.removeChannel(roomId, channelId)

        // Broadcast to all clients
        callCenter.to(roomId).emit('mix:channel-removed', {
          channelId,
          sourceClientId: socket.id,
        })

        callback?.({ success: true })
      } catch (error) {
        console.error('[CallCenter] Error removing mix channel:', error)
        callback?.({ error: 'Failed to remove channel' })
      }
    })

    // Get current mix state (for new clients joining)
    socket.on('mix:get-state', async (payload: { roomId: string }, callback) => {
      try {
        const { roomId } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        const state = mixCoordinatorService.getRoomState(roomId)
        const failoverStatus = mixCoordinatorService.getFailoverStatus(roomId)

        callback?.({
          success: true,
          state,
          failoverStatus,
        })
      } catch (error) {
        console.error('[CallCenter] Error getting mix state:', error)
        callback?.({ error: 'Failed to get state' })
      }
    })

    // Request to take over as primary mixer (when current primary is unresponsive)
    socket.on('mix:takeover', async (payload: { roomId: string }, callback) => {
      try {
        const { roomId } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        const hasPermission = await isProducer(socketData.participantId, roomId)
        if (!hasPermission) {
          return callback?.({ error: 'Only producers can take over mix control' })
        }

        const failoverStatus = mixCoordinatorService.getFailoverStatus(roomId)
        if (!failoverStatus.needsFailover) {
          return callback?.({ error: 'Current primary mixer is still active' })
        }

        // Force takeover
        const registered = mixCoordinatorService.registerPrimaryClient(roomId, socket.id)
        const state = mixCoordinatorService.getRoomState(roomId)

        // Notify all clients
        callCenter.to(roomId).emit('mix:takeover', {
          newPrimaryClientId: socket.id,
          previousClientId: failoverStatus.primaryClientId,
        })

        callback?.({ success: registered, state })
        console.log(`[CallCenter] Mix takeover by ${socketData.displayName} in room ${roomId}`)
      } catch (error) {
        console.error('[CallCenter] Error taking over mix control:', error)
        callback?.({ error: 'Failed to take over' })
      }
    })

    // Persist current mix state to database
    socket.on('mix:persist', async (payload: { roomId: string }, callback) => {
      try {
        const { roomId } = payload

        if (!socketData.participantId || socketData.roomId !== roomId) {
          return callback?.({ error: 'Not in room' })
        }

        await mixCoordinatorService.persistState(roomId)
        callback?.({ success: true })
      } catch (error) {
        console.error('[CallCenter] Error persisting mix state:', error)
        callback?.({ error: 'Failed to persist state' })
      }
    })

    // Handle disconnection
    socket.on('disconnect', async () => {
      console.log(`[CallCenter] Socket disconnected: ${socket.id}`)
      await handleLeaveRoom(socket, socketData)
    })
  })

  async function handleLeaveRoom(socket: Socket, socketData: SocketData): Promise<void> {
    if (!socketData.roomId || !socketData.participantId) return

    const { roomId, participantId, displayName } = socketData

    try {
      // Unregister from mix coordinator if this was the primary mixer
      mixCoordinatorService.unregisterClient(roomId, socket.id)

      // Remove from mediasoup
      mediasoupService.closeParticipant(roomId, participantId)

      // Update database
      await prisma.roomParticipant.update({
        where: { id: participantId },
        data: {
          isConnected: false,
          leftAt: new Date(),
        },
      })

      // Notify others
      socket.to(roomId).emit('room:participant-left', {
        participantId,
      })

      // Leave socket.io room
      socket.leave(roomId)

      console.log(`[CallCenter] ${displayName} left room ${roomId}`)
    } catch (error) {
      console.error('[CallCenter] Error handling leave:', error)
    }

    // Clear socket data
    socketData.participantId = null
    socketData.roomId = null
    socketData.userId = null
    socketData.displayName = null
    socketData.isInWaitingRoom = false
  }

  console.log('[CallCenter] Socket.io namespace initialized')
}
