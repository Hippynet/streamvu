import { useCallback, useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { Device, types as mediasoupTypes } from 'mediasoup-client'
import { useAuthStore } from '../stores/authStore'
import { getWsUrl } from '../config'

type Transport = mediasoupTypes.Transport
type Producer = mediasoupTypes.Producer
type Consumer = mediasoupTypes.Consumer
type RtpCapabilities = mediasoupTypes.RtpCapabilities

interface IceServer {
  urls: string | string[]
  username?: string
  credential?: string
}

type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'unknown'

interface ConnectionStats {
  quality: ConnectionQuality
  packetLoss: number // percentage
  jitter: number // ms
  roundTripTime: number // ms
}

interface RemoteParticipant {
  participantId: string
  displayName: string
  producerId: string
  consumer?: Consumer
  stream?: MediaStream
  isSpeaking: boolean
  isMuted: boolean
  connectionQuality: ConnectionQuality
  timeZoneOffset?: number // UTC offset in minutes (e.g., -300 for EST)
  localTime?: string // ISO string of participant's local time
}

interface WaitingParticipant {
  participantId: string
  displayName: string
}

interface AudioDevice {
  deviceId: string
  label: string
}

interface AudioOutputDevice {
  deviceId: string
  label: string
}

type AudioChannel = 'program' | 'talkback'

// Bus types for audio output routing
type BusType = 'PGM' | 'TB' | 'AUX1' | 'AUX2' | 'AUX3' | 'AUX4'

interface BusProducerInfo {
  busType: BusType
  producerId: string
  stream: MediaStream
}

interface UseMediasoupOptions {
  roomId: string
  displayName: string
  accessCode?: string
  onParticipantJoined?: (participantId: string, displayName: string) => void
  onParticipantLeft?: (participantId: string) => void
  onKicked?: () => void
  onRoomClosed?: () => void
  onWaitingRoomAdmitted?: () => void
  onWaitingRoomRejected?: () => void
  onNewWaitingParticipant?: (participant: WaitingParticipant) => void
  onError?: (error: string) => void
}

interface UseMediasoupReturn {
  isConnected: boolean
  isConnecting: boolean
  isReconnecting: boolean
  isInWaitingRoom: boolean
  localStream: MediaStream | null
  remoteParticipants: RemoteParticipant[]
  waitingParticipants: WaitingParticipant[]
  isMuted: boolean
  isSpeaking: boolean
  connectionStats: ConnectionStats
  error: string | null
  participantId: string | null
  // Audio input device selection
  audioDevices: AudioDevice[]
  selectedAudioDevice: string | null
  refreshAudioDevices: () => Promise<void>
  selectAudioDevice: (deviceId: string) => Promise<void>
  // Audio output device selection
  audioOutputDevices: AudioOutputDevice[]
  selectedAudioOutput: string | null
  selectAudioOutput: (deviceId: string) => Promise<void>
  registerAudioElement: (participantId: string, element: HTMLAudioElement | null) => void
  // Talkback channel routing
  selectedTalkbackOutput: string | null
  selectTalkbackOutput: (deviceId: string) => Promise<void>
  participantChannels: Map<string, AudioChannel>
  setParticipantChannel: (participantId: string, channel: AudioChannel) => Promise<void>
  // Auxiliary audio (for audio sources like HTTP streams)
  produceAuxiliaryAudio: (stream: MediaStream, sourceId: string) => Promise<string | null>
  closeAuxiliaryProducer: (sourceId: string) => void
  // Bus output (for streaming mixed bus audio to server)
  produceBusOutput: (busType: BusType, stream: MediaStream) => Promise<string | null>
  stopBusOutput: (busType: BusType) => void
  activeBusProducers: Map<BusType, BusProducerInfo>
  // Tally/on-air state
  updateOnAirChannels: (channelIds: string[]) => void
  // Actions
  connect: () => Promise<void>
  disconnect: () => void
  toggleMute: () => void
  kickParticipant: (participantId: string) => void
  admitParticipant: (participantId: string) => void
  rejectParticipant: (participantId: string) => void
  closeRoom: () => void
}

export function useMediasoup({
  roomId,
  displayName,
  accessCode,
  onParticipantJoined,
  onParticipantLeft,
  onKicked,
  onRoomClosed,
  onWaitingRoomAdmitted,
  onWaitingRoomRejected,
  onNewWaitingParticipant,
  onError,
}: UseMediasoupOptions): UseMediasoupReturn {
  const tokens = useAuthStore((state) => state.tokens)

  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [isInWaitingRoom, setIsInWaitingRoom] = useState(false)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([])
  const [waitingParticipants, setWaitingParticipants] = useState<WaitingParticipant[]>([])
  const [isMuted, setIsMuted] = useState(true)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [connectionStats, setConnectionStats] = useState<ConnectionStats>({
    quality: 'unknown',
    packetLoss: 0,
    jitter: 0,
    roundTripTime: 0,
  })
  const [error, setError] = useState<string | null>(null)
  const [participantId, setParticipantId] = useState<string | null>(null)
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([])
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string | null>(null)
  const [audioOutputDevices, setAudioOutputDevices] = useState<AudioOutputDevice[]>([])
  const [selectedAudioOutput, setSelectedAudioOutput] = useState<string | null>(null)
  const [selectedTalkbackOutput, setSelectedTalkbackOutput] = useState<string | null>(null)
  const [participantChannels, setParticipantChannels] = useState<Map<string, AudioChannel>>(new Map())

  const socketRef = useRef<Socket | null>(null)
  const deviceRef = useRef<Device | null>(null)
  const sendTransportRef = useRef<Transport | null>(null)
  const recvTransportRef = useRef<Transport | null>(null)
  const producerRef = useRef<Producer | null>(null)
  const auxiliaryProducersRef = useRef<Map<string, Producer>>(new Map()) // For audio sources
  const busProducersRef = useRef<Map<BusType, { producer: Producer; stream: MediaStream }>>(new Map()) // For bus outputs
  const [activeBusProducers, setActiveBusProducers] = useState<Map<BusType, BusProducerInfo>>(new Map())
  const consumersRef = useRef<Map<string, Consumer>>(new Map())
  const localStreamRef = useRef<MediaStream | null>(null)
  const iceServersRef = useRef<IceServer[]>([])
  const selectedAudioDeviceRef = useRef<string | null>(null)
  const selectedAudioOutputRef = useRef<string | null>(null)
  const selectedTalkbackOutputRef = useRef<string | null>(null)
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const participantChannelsRef = useRef<Map<string, AudioChannel>>(new Map())
  const participantTimeZonesRef = useRef<Map<string, number>>(new Map()) // participantId -> UTC offset in minutes

  // IFB (Interruptible Foldback) audio refs
  const ifbConsumerRef = useRef<Consumer | null>(null)
  const ifbAudioElementRef = useRef<HTMLAudioElement | null>(null)
  const ifbActiveRef = useRef(false)

  // VAD (Voice Activity Detection) refs
  const vadContextRef = useRef<AudioContext | null>(null)
  const vadAnalyserRef = useRef<AnalyserNode | null>(null)
  const vadAnimationRef = useRef<number | null>(null)
  const vadStoppedRef = useRef(false) // Flag to prevent zombie animation frames
  const lastSpeakingRef = useRef(false)

  // Connection quality monitoring
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Reconnection state
  const reconnectAttemptsRef = useRef(0)
  const intentionalDisconnectRef = useRef(false)
  const maxReconnectAttempts = 5
  const reconnectDelayBase = 1000 // 1 second base delay

  // Session recovery state - preserved across reconnects
  const sessionStateRef = useRef<{
    wasConnected: boolean
    wasMuted: boolean
    savedLocalStream: MediaStream | null
    savedParticipantId: string | null
  }>({
    wasConnected: false,
    wasMuted: true,
    savedLocalStream: null,
    savedParticipantId: null,
  })

  // Refresh list of available audio input and output devices
  const refreshAudioDevices = useCallback(async () => {
    try {
      // Need to request permission first to get device labels
      if (!navigator.mediaDevices?.enumerateDevices) {
        console.warn('[useMediasoup] enumerateDevices not supported')
        return
      }

      const devices = await navigator.mediaDevices.enumerateDevices()

      // Input devices (microphones)
      const audioInputs = devices
        .filter((device) => device.kind === 'audioinput')
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${index + 1}`,
        }))

      setAudioDevices(audioInputs)

      // If no device selected yet, select the first one (or default)
      if (!selectedAudioDeviceRef.current && audioInputs.length > 0) {
        const defaultDevice = audioInputs.find((d) => d.deviceId === 'default') || audioInputs[0]
        selectedAudioDeviceRef.current = defaultDevice.deviceId
        setSelectedAudioDevice(defaultDevice.deviceId)
      }

      // Output devices (speakers/headphones)
      const audioOutputs = devices
        .filter((device) => device.kind === 'audiooutput')
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Speaker ${index + 1}`,
        }))

      setAudioOutputDevices(audioOutputs)

      // If no output selected yet, select the first one (or default)
      if (!selectedAudioOutputRef.current && audioOutputs.length > 0) {
        const defaultOutput = audioOutputs.find((d) => d.deviceId === 'default') || audioOutputs[0]
        selectedAudioOutputRef.current = defaultOutput.deviceId
        setSelectedAudioOutput(defaultOutput.deviceId)
      }

      console.log('[useMediasoup] Audio devices refreshed:', audioInputs.length, 'inputs,', audioOutputs.length, 'outputs')
    } catch (err) {
      console.error('[useMediasoup] Failed to enumerate devices:', err)
    }
  }, [])

  // Select a different audio device and switch to it
  const selectAudioDevice = useCallback(async (deviceId: string) => {
    selectedAudioDeviceRef.current = deviceId
    setSelectedAudioDevice(deviceId)

    // If we're connected and have a producer, switch to the new device
    if (producerRef.current && sendTransportRef.current && !producerRef.current.closed) {
      try {
        console.log('[useMediasoup] Switching to audio device:', deviceId)

        // Get new stream with selected device
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: deviceId },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        })

        const newTrack = newStream.getAudioTracks()[0]

        // Preserve mute state
        newTrack.enabled = !isMuted

        // Replace the track on the producer
        await producerRef.current.replaceTrack({ track: newTrack })

        // Stop old tracks
        localStreamRef.current?.getTracks().forEach((track) => track.stop())

        // Update refs and state
        localStreamRef.current = newStream
        setLocalStream(newStream)

        // Update VAD to use new stream
        if (vadContextRef.current && vadAnalyserRef.current) {
          const vadSource = vadContextRef.current.createMediaStreamSource(newStream)
          vadSource.connect(vadAnalyserRef.current)
        }

        console.log('[useMediasoup] Switched to audio device:', deviceId)
      } catch (err) {
        console.error('[useMediasoup] Failed to switch audio device:', err)
        setError(`Failed to switch microphone: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }
  }, [isMuted])

  // Select a different audio output device (program output)
  const selectAudioOutput = useCallback(async (deviceId: string) => {
    selectedAudioOutputRef.current = deviceId
    setSelectedAudioOutput(deviceId)

    // Update audio elements for participants on the program channel
    for (const [pId, audioElement] of audioElementsRef.current) {
      const channel = participantChannelsRef.current.get(pId) || 'program'
      if (channel === 'program') {
        try {
          if ('setSinkId' in audioElement && typeof audioElement.setSinkId === 'function') {
            await (audioElement as any).setSinkId(deviceId)
            console.log(`[useMediasoup] Set program output for ${pId} to ${deviceId}`)
          }
        } catch (err) {
          console.error(`[useMediasoup] Failed to set output device for ${pId}:`, err)
        }
      }
    }
  }, [])

  // Select a different talkback output device
  const selectTalkbackOutput = useCallback(async (deviceId: string) => {
    selectedTalkbackOutputRef.current = deviceId
    setSelectedTalkbackOutput(deviceId)

    // Update audio elements for participants on the talkback channel
    for (const [pId, audioElement] of audioElementsRef.current) {
      const channel = participantChannelsRef.current.get(pId)
      if (channel === 'talkback') {
        try {
          if ('setSinkId' in audioElement && typeof audioElement.setSinkId === 'function') {
            await (audioElement as any).setSinkId(deviceId)
            console.log(`[useMediasoup] Set talkback output for ${pId} to ${deviceId}`)
          }
        } catch (err) {
          console.error(`[useMediasoup] Failed to set talkback output for ${pId}:`, err)
        }
      }
    }
  }, [])

  // Set a participant's audio channel (program or talkback)
  const setParticipantChannel = useCallback(async (pId: string, channel: AudioChannel) => {
    participantChannelsRef.current.set(pId, channel)
    setParticipantChannels(new Map(participantChannelsRef.current))

    // Update the audio element's output device based on channel
    const audioElement = audioElementsRef.current.get(pId)
    if (audioElement && 'setSinkId' in audioElement) {
      const targetDevice = channel === 'talkback'
        ? selectedTalkbackOutputRef.current
        : selectedAudioOutputRef.current

      if (targetDevice) {
        try {
          await (audioElement as any).setSinkId(targetDevice)
          console.log(`[useMediasoup] Routed ${pId} to ${channel} (device: ${targetDevice})`)
        } catch (err) {
          console.error(`[useMediasoup] Failed to route ${pId} to ${channel}:`, err)
        }
      }
    }
  }, [])

  // Register an audio element for output device management
  const registerAudioElement = useCallback((pId: string, element: HTMLAudioElement | null) => {
    if (element) {
      audioElementsRef.current.set(pId, element)

      // Determine which output device to use based on channel assignment
      const channel = participantChannelsRef.current.get(pId) || 'program'
      const targetDevice = channel === 'talkback'
        ? selectedTalkbackOutputRef.current
        : selectedAudioOutputRef.current

      if (targetDevice && 'setSinkId' in element) {
        (element as any).setSinkId(targetDevice).catch((err: Error) => {
          console.warn(`[useMediasoup] Could not set initial output device for ${pId}:`, err.message)
        })
      }
    } else {
      audioElementsRef.current.delete(pId)
    }
  }, [])

  // List of socket events we register - used for cleanup
  const SOCKET_EVENTS = [
    'connect',
    'connect_error',
    'disconnect',
    'waitingroom:admitted',
    'waitingroom:rejected',
    'waitingroom:new-participant',
    'room:participant-joined',
    'room:participant-left',
    'room:kicked',
    'room:closed',
    'producer:new',
    'vad:participant-speaking',
    'mute:participant-update',
    'ifb:started',
    'ifb:ended',
  ] as const

  // Remove all socket event listeners to prevent accumulation
  const removeSocketListeners = useCallback((socket: Socket | null) => {
    if (!socket) return
    SOCKET_EVENTS.forEach((event) => {
      socket.removeAllListeners(event)
    })
    console.log('[useMediasoup] Removed all socket event listeners')
  }, [])

  // Cleanup function
  const cleanup = useCallback(() => {
    // Reset reconnection state
    reconnectAttemptsRef.current = 0
    setIsReconnecting(false)

    // Stop connection stats polling
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current)
      statsIntervalRef.current = null
    }
    setConnectionStats({ quality: 'unknown', packetLoss: 0, jitter: 0, roundTripTime: 0 })

    // Stop VAD - use flag to prevent zombie animation frames
    vadStoppedRef.current = true
    if (vadAnimationRef.current) {
      cancelAnimationFrame(vadAnimationRef.current)
      vadAnimationRef.current = null
    }
    vadAnalyserRef.current = null
    vadContextRef.current?.close().catch(() => {}) // Ignore close errors
    vadContextRef.current = null
    setIsSpeaking(false)

    // Stop local stream tracks
    localStreamRef.current?.getTracks().forEach((track) => track.stop())
    localStreamRef.current = null
    setLocalStream(null)

    // Close producer
    producerRef.current?.close()
    producerRef.current = null

    // Close auxiliary producers (audio sources)
    auxiliaryProducersRef.current.forEach((producer) => {
      producer.close()
    })
    auxiliaryProducersRef.current.clear()

    // Close bus producers
    busProducersRef.current.forEach(({ producer }) => {
      producer.close()
    })
    busProducersRef.current.clear()
    setActiveBusProducers(new Map())

    // Close all consumers explicitly
    consumersRef.current.forEach((consumer) => {
      try {
        consumer.close()
      } catch (e) {
        // Consumer already closed
      }
    })
    consumersRef.current.clear()

    // Close transports
    sendTransportRef.current?.close()
    recvTransportRef.current?.close()
    sendTransportRef.current = null
    recvTransportRef.current = null

    // Remove socket event listeners BEFORE disconnecting
    removeSocketListeners(socketRef.current)

    // Disconnect socket
    socketRef.current?.disconnect()
    socketRef.current = null

    // Reset device
    deviceRef.current = null

    setRemoteParticipants([])
    setWaitingParticipants([])
    setIsConnected(false)
    setIsConnecting(false)
    setIsInWaitingRoom(false)
  }, [removeSocketListeners])

  // Create consumer for a remote participant
  const createConsumer = useCallback(
    async (participantId: string, displayName: string, producerId: string) => {
      console.log(`[useMediasoup] Creating consumer for ${displayName} (${participantId}), producer: ${producerId}`)

      if (!socketRef.current || !deviceRef.current || !recvTransportRef.current) {
        console.warn('[useMediasoup] Cannot create consumer - not ready:', {
          socket: !!socketRef.current,
          device: !!deviceRef.current,
          recvTransport: !!recvTransportRef.current,
        })
        return
      }

      return new Promise<void>((resolve, reject) => {
        socketRef.current!.emit(
          'consumer:create',
          {
            roomId,
            producerParticipantId: participantId,
            rtpCapabilities: deviceRef.current!.rtpCapabilities,
          },
          async (response: {
            success?: boolean
            error?: string
            id?: string
            producerId?: string
            kind?: 'audio' | 'video'
            rtpParameters?: RtpCapabilities
          }) => {
            if (response.error || !response.success) {
              console.error('[useMediasoup] Failed to create consumer:', response.error)
              reject(new Error(response.error || 'Failed to create consumer'))
              return
            }

            console.log(`[useMediasoup] Consumer response:`, { id: response.id, kind: response.kind })

            try {
              const consumer = await recvTransportRef.current!.consume({
                id: response.id!,
                producerId: response.producerId!,
                kind: response.kind!,
                rtpParameters: response.rtpParameters as never,
              })

              console.log(`[useMediasoup] Consumer created:`, consumer.id, 'track:', consumer.track.kind, consumer.track.readyState, 'paused:', consumer.paused)

              // Listen for track state changes
              consumer.track.onended = () => {
                console.warn(`[useMediasoup] Consumer track ended for ${displayName}`)
              }
              consumer.track.onmute = () => {
                console.log(`[useMediasoup] Consumer track muted for ${displayName}`)
              }
              consumer.track.onunmute = () => {
                console.log(`[useMediasoup] Consumer track unmuted for ${displayName}`)
              }

              consumersRef.current.set(consumer.id, consumer)

              // Create media stream
              const stream = new MediaStream([consumer.track])
              console.log(`[useMediasoup] Created MediaStream for ${displayName}, active: ${stream.active}, tracks:`, stream.getAudioTracks().length)

              // Add to remote participants
              setRemoteParticipants((prev) => {
                const existing = prev.find((p) => p.participantId === participantId)
                // Get timezone offset if stored
                const timeZoneOffset = participantTimeZonesRef.current.get(participantId)
                if (existing) {
                  return prev.map((p) =>
                    p.participantId === participantId
                      ? { ...p, consumer, stream, producerId, timeZoneOffset }
                      : p
                  )
                }
                return [
                  ...prev,
                  {
                    participantId,
                    displayName,
                    producerId,
                    consumer,
                    stream,
                    isSpeaking: false,
                    isMuted: false,
                    connectionQuality: 'unknown' as ConnectionQuality,
                    timeZoneOffset,
                  },
                ]
              })

              // Resume consumer
              socketRef.current!.emit('consumer:resume', { roomId, consumerId: consumer.id }, (resumeResponse: { success?: boolean; error?: string }) => {
                if (resumeResponse.error) {
                  console.error(`[useMediasoup] Failed to resume consumer ${consumer.id}:`, resumeResponse.error)
                } else {
                  console.log(`[useMediasoup] Consumer ${consumer.id} resumed successfully, track state:`, consumer.track.readyState, 'paused:', consumer.paused)
                }
              })

              resolve()
            } catch (err) {
              console.error('[useMediasoup] Error creating consumer:', err)
              reject(err)
            }
          }
        )
      })
    },
    [roomId]
  )

  // Connect to room
  const connect = useCallback(async () => {
    if (isConnecting || isConnected) return

    setIsConnecting(true)
    setError(null)

    try {
      // Early check for secure context (required for getUserMedia)
      if (!window.isSecureContext) {
        throw new Error(
          'Microphone access requires HTTPS. ' +
          'For local network access, use Chrome and navigate to chrome://flags/#unsafely-treat-insecure-origin-as-secure ' +
          `then add "${window.location.origin}" to the list and restart Chrome.`
        )
      }

      // Create socket connection
      const socket = io(`${getWsUrl()}/call-center`, {
        transports: ['websocket'],
      })
      socketRef.current = socket

      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        socket.on('connect', () => resolve())
        socket.on('connect_error', (err) => reject(err))
        setTimeout(() => reject(new Error('Connection timeout')), 10000)
      })

      console.log('[useMediasoup] Socket connected')

      // Set up waiting room event handlers early (needed for participants in waiting room)
      socket.on('waitingroom:admitted', async (data: {
        participantId: string
        rtpCapabilities: RtpCapabilities
        iceServers: IceServer[]
        existingProducers: Array<{
          participantId: string
          producerId: string
          displayName: string
        }>
      }) => {
        console.log('[useMediasoup] Admitted from waiting room!')
        setIsInWaitingRoom(false)
        onWaitingRoomAdmitted?.()

        // Now proceed with WebRTC setup using the data from admission
        try {
          iceServersRef.current = data.iceServers || []

          const device = new Device()
          await device.load({ routerRtpCapabilities: data.rtpCapabilities })
          deviceRef.current = device

          // Continue with transport setup (simplified - in production you'd factor this out)
          // For now, we'll call a helper or emit an event
          setIsConnected(true)
        } catch (err) {
          console.error('[useMediasoup] Error after admission:', err)
          setError('Failed to set up connection after admission')
        }
      })

      socket.on('waitingroom:rejected', ({ participantId: _rejectedId }) => {
        // We were rejected from the waiting room
        console.log('[useMediasoup] Rejected from waiting room')
        cleanup()
        onWaitingRoomRejected?.()
      })

      // Join room
      const joinResponse = await new Promise<{
        success?: boolean
        error?: string
        participantId?: string
        inWaitingRoom?: boolean
        roomName?: string
        rtpCapabilities?: RtpCapabilities
        iceServers?: IceServer[]
        existingProducers?: Array<{
          participantId: string
          producerId: string
          displayName: string
        }>
      }>((resolve) => {
        socket.emit(
          'room:join',
          {
            roomId,
            displayName,
            accessCode,
            token: tokens?.accessToken,
            timeZoneOffset: new Date().getTimezoneOffset(), // Minutes from UTC
          },
          resolve
        )
      })

      if (joinResponse.error || !joinResponse.success) {
        throw new Error(joinResponse.error || 'Failed to join room')
      }

      console.log('[useMediasoup] Joined room:', joinResponse.participantId)

      // Store participant ID
      setParticipantId(joinResponse.participantId || null)

      // *** IMPORTANT: Set up event handlers IMMEDIATELY after joining ***
      // This prevents race conditions where we miss producer:new events during setup
      socket.on('room:participant-joined', ({ participantId, displayName: name, timeZoneOffset }) => {
        console.log(`[useMediasoup] Participant joined: ${name}, timezone offset: ${timeZoneOffset}`)
        // Store timezone offset if provided
        if (typeof timeZoneOffset === 'number') {
          participantTimeZonesRef.current.set(participantId, timeZoneOffset)
        }
        onParticipantJoined?.(participantId, name)
      })

      socket.on('room:participant-left', ({ participantId }) => {
        console.log(`[useMediasoup] Participant left: ${participantId}`)
        setRemoteParticipants((prev) => prev.filter((p) => p.participantId !== participantId))
        onParticipantLeft?.(participantId)
      })

      socket.on('producer:new', async ({ participantId, producerId, displayName: name }) => {
        console.log(`[useMediasoup] *** NEW PRODUCER EVENT *** from ${name} (${participantId}), producerId: ${producerId}`)
        try {
          await createConsumer(participantId, name, producerId)
          console.log(`[useMediasoup] Successfully created consumer for ${name}`)
        } catch (err) {
          console.error(`[useMediasoup] Failed to create consumer for ${name}:`, err)
        }
      })

      socket.on('vad:participant-speaking', ({ participantId, isSpeaking: speaking }) => {
        setRemoteParticipants((prev) =>
          prev.map((p) => (p.participantId === participantId ? { ...p, isSpeaking: speaking } : p))
        )
      })

      socket.on('mute:participant-update', ({ participantId: pId, isMuted: muted }) => {
        setRemoteParticipants((prev) =>
          prev.map((p) => (p.participantId === pId ? { ...p, isMuted: muted } : p))
        )
      })

      socket.on('room:kicked', ({ participantId: kickedId }) => {
        if (kickedId === joinResponse.participantId) {
          console.log('[useMediasoup] You were kicked from the room')
          cleanup()
          onKicked?.()
        } else {
          setRemoteParticipants((prev) => prev.filter((p) => p.participantId !== kickedId))
        }
      })

      socket.on('room:closed', () => {
        console.log('[useMediasoup] Room was closed')
        cleanup()
        onRoomClosed?.()
      })

      socket.on('waitingroom:new-participant', ({ participantId: pid, displayName: name }) => {
        console.log(`[useMediasoup] New participant in waiting room: ${name}`)
        setWaitingParticipants((prev) => [...prev, { participantId: pid, displayName: name }])
        onNewWaitingParticipant?.({ participantId: pid, displayName: name })
      })

      // IFB (Interruptible Foldback) handling - receive talkback audio from producer
      socket.on('ifb:started', async (data: {
        session: {
          id: string
          senderId: string
          targetType: 'ALL' | 'PARTICIPANT' | 'GROUP'
          level: number
          duckingLevel: number
        }
        forParticipantId?: string
        forParticipantIds?: string[]
        tbProducerId?: string | null // The producer ID for the TB bus
        tbProducerParticipantId?: string | null // The participant who owns the TB producer
      }) => {
        const { session, forParticipantId, forParticipantIds, tbProducerId, tbProducerParticipantId } = data
        const myId = joinResponse.participantId

        // Check if we are a target of this IFB session
        const isTarget =
          session.targetType === 'ALL' ||
          forParticipantId === myId ||
          (forParticipantIds && forParticipantIds.includes(myId || ''))

        if (!isTarget || !tbProducerId || !tbProducerParticipantId) {
          console.log('[useMediasoup] IFB started but not targeting us or no TB producer available')
          return
        }

        console.log('[useMediasoup] IFB started - consuming TB audio from producer', tbProducerId)

        // Clean up any existing IFB before starting new one (prevents orphaned resources)
        if (ifbConsumerRef.current) {
          try {
            ifbConsumerRef.current.close()
          } catch (e) {
            // Already closed
          }
          ifbConsumerRef.current = null
        }
        if (ifbAudioElementRef.current) {
          ifbAudioElementRef.current.pause()
          ifbAudioElementRef.current.srcObject = null
          ifbAudioElementRef.current = null
        }

        ifbActiveRef.current = true

        try {
          // Request to consume the TB producer
          const recvTransport = recvTransportRef.current
          const device = deviceRef.current
          if (!recvTransport || !device) {
            console.error('[useMediasoup] No receive transport for IFB')
            return
          }

          const consumeResponse = await new Promise<{
            success?: boolean
            error?: string
            id?: string
            producerId?: string
            kind?: 'audio' | 'video'
            rtpParameters?: mediasoupTypes.RtpParameters
          }>((resolve) => {
            socket.emit(
              'consumer:create',
              {
                roomId,
                producerParticipantId: tbProducerParticipantId,
                producerId: tbProducerId, // Specific producer to consume
                rtpCapabilities: device.rtpCapabilities,
              },
              resolve
            )
          })

          if (consumeResponse.error || !consumeResponse.success) {
            console.error('[useMediasoup] Failed to create IFB consumer:', consumeResponse.error)
            return
          }

          // Create the consumer
          const consumer = await recvTransport.consume({
            id: consumeResponse.id!,
            producerId: consumeResponse.producerId!,
            kind: consumeResponse.kind!,
            rtpParameters: consumeResponse.rtpParameters!,
          })

          ifbConsumerRef.current = consumer

          // Create an audio element for playback
          const stream = new MediaStream([consumer.track])
          const audioElement = new Audio()
          audioElement.srcObject = stream
          audioElement.volume = session.level
          ifbAudioElementRef.current = audioElement

          // Route to talkback output if available, otherwise default
          if (selectedTalkbackOutputRef.current && 'setSinkId' in audioElement) {
            try {
              await (audioElement as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(selectedTalkbackOutputRef.current)
            } catch (err) {
              console.warn('[useMediasoup] Could not set IFB output device:', err)
            }
          }

          // Resume the consumer and play
          socket.emit('consumer:resume', { roomId, consumerId: consumer.id })
          await audioElement.play()

          console.log('[useMediasoup] IFB audio playing, ducking level:', session.duckingLevel)

          // Apply ducking to program audio (reduce volume of other participants)
          for (const [_, el] of audioElementsRef.current) {
            el.volume = session.duckingLevel
          }
        } catch (err) {
          console.error('[useMediasoup] Error setting up IFB audio:', err)
          ifbActiveRef.current = false
        }
      })

      socket.on('ifb:ended', ({ sessionId }: { sessionId: string }) => {
        console.log('[useMediasoup] IFB ended:', sessionId)
        ifbActiveRef.current = false

        // Close the IFB consumer
        if (ifbConsumerRef.current) {
          ifbConsumerRef.current.close()
          ifbConsumerRef.current = null
        }

        // Stop the audio element
        if (ifbAudioElementRef.current) {
          ifbAudioElementRef.current.pause()
          ifbAudioElementRef.current.srcObject = null
          ifbAudioElementRef.current = null
        }

        // Restore program audio volume
        for (const [_, el] of audioElementsRef.current) {
          el.volume = 1.0
        }
      })

      socket.on('disconnect', (reason) => {
        console.log(`[useMediasoup] Socket disconnected: ${reason}`)
        setIsConnected(false)

        // Save session state for recovery (before any cleanup)
        sessionStateRef.current = {
          wasConnected: true,
          wasMuted: isMuted,
          savedLocalStream: localStream,
          savedParticipantId: participantId,
        }

        if (intentionalDisconnectRef.current) {
          console.log('[useMediasoup] Intentional disconnect, not reconnecting')
          // Clear saved state on intentional disconnect
          sessionStateRef.current = {
            wasConnected: false,
            wasMuted: true,
            savedLocalStream: null,
            savedParticipantId: null,
          }
          return
        }

        if (reason === 'io server disconnect') {
          console.log('[useMediasoup] Server disconnected, not auto-reconnecting')
          return
        }

        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++
          const delay = reconnectDelayBase * Math.pow(2, reconnectAttemptsRef.current - 1)
          console.log(`[useMediasoup] Reconnect attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts} in ${delay}ms`)

          setIsReconnecting(true)
          setTimeout(() => {
            if (!intentionalDisconnectRef.current) {
              socket.connect()
            }
          }, delay)
        } else {
          console.log('[useMediasoup] Max reconnect attempts reached')
          setIsReconnecting(false)
          setError('Connection lost. Please refresh to reconnect.')
        }
      })

      socket.on('connect', async () => {
        if (reconnectAttemptsRef.current > 0) {
          console.log('[useMediasoup] Socket reconnected, initiating session recovery...')
          reconnectAttemptsRef.current = 0
          setIsReconnecting(false)

          // Session recovery: re-join the room and restore producers
          try {
            // Re-join the room
            const rejoinResponse = await new Promise<{
              success?: boolean
              error?: string
              participantId?: string
              rtpCapabilities?: RtpCapabilities
              iceServers?: IceServer[]
              existingProducers?: Array<{
                participantId: string
                producerId: string
                displayName: string
              }>
            }>((resolve) => {
              socket.emit(
                'room:join',
                {
                  roomId,
                  displayName,
                  accessCode,
                  token: tokens?.accessToken,
                  timeZoneOffset: new Date().getTimezoneOffset(), // Minutes from UTC
                  isReconnect: true, // Signal this is a reconnect
                  previousParticipantId: sessionStateRef.current.savedParticipantId,
                },
                resolve
              )
            })

            if (rejoinResponse.error || !rejoinResponse.success) {
              throw new Error(rejoinResponse.error || 'Failed to rejoin room')
            }

            console.log('[useMediasoup] Session recovery: rejoined room as', rejoinResponse.participantId)

            // Update participant ID if changed
            setParticipantId(rejoinResponse.participantId || null)

            // Recreate mediasoup device
            iceServersRef.current = rejoinResponse.iceServers || []
            const device = new Device()
            await device.load({ routerRtpCapabilities: rejoinResponse.rtpCapabilities! })
            deviceRef.current = device

            // Recreate send transport
            const sendTransportInfo = await new Promise<{
              success?: boolean
              error?: string
              id?: string
              iceParameters?: mediasoupTypes.IceParameters
              iceCandidates?: mediasoupTypes.IceCandidate[]
              dtlsParameters?: mediasoupTypes.DtlsParameters
            }>((resolve) => {
              socket.emit('transport:create', { roomId, direction: 'send' }, resolve)
            })

            if (sendTransportInfo.error || !sendTransportInfo.success) {
              throw new Error(sendTransportInfo.error || 'Failed to create send transport')
            }

            const sendTransport = device.createSendTransport({
              id: sendTransportInfo.id!,
              iceParameters: sendTransportInfo.iceParameters as never,
              iceCandidates: sendTransportInfo.iceCandidates as never,
              dtlsParameters: sendTransportInfo.dtlsParameters as never,
              iceServers: iceServersRef.current as never,
            })

            sendTransport.on('connect', ({ dtlsParameters: dtls }, callback, errback) => {
              socket.emit(
                'transport:connect',
                { roomId, transportId: sendTransport.id, dtlsParameters: dtls },
                (response: { success?: boolean; error?: string }) => {
                  if (response.error) {
                    errback(new Error(response.error))
                  } else {
                    callback()
                  }
                }
              )
            })

            sendTransport.on('produce', ({ kind, rtpParameters: params }, callback, errback) => {
              socket.emit(
                'producer:create',
                { roomId, transportId: sendTransport.id, kind, rtpParameters: params },
                (response: { success?: boolean; error?: string; producerId?: string }) => {
                  if (response.error) {
                    errback(new Error(response.error))
                  } else {
                    callback({ id: response.producerId! })
                  }
                }
              )
            })

            sendTransportRef.current = sendTransport

            // Recreate receive transport
            const recvTransportInfo = await new Promise<{
              success?: boolean
              error?: string
              id?: string
              iceParameters?: mediasoupTypes.IceParameters
              iceCandidates?: mediasoupTypes.IceCandidate[]
              dtlsParameters?: mediasoupTypes.DtlsParameters
            }>((resolve) => {
              socket.emit('transport:create', { roomId, direction: 'recv' }, resolve)
            })

            if (recvTransportInfo.error || !recvTransportInfo.success) {
              throw new Error(recvTransportInfo.error || 'Failed to create recv transport')
            }

            const recvTransport = device.createRecvTransport({
              id: recvTransportInfo.id!,
              iceParameters: recvTransportInfo.iceParameters as never,
              iceCandidates: recvTransportInfo.iceCandidates as never,
              dtlsParameters: recvTransportInfo.dtlsParameters as never,
              iceServers: iceServersRef.current as never,
            })

            recvTransport.on('connect', ({ dtlsParameters: dtls }, callback, errback) => {
              socket.emit(
                'transport:connect',
                { roomId, transportId: recvTransport.id, dtlsParameters: dtls },
                (response: { success?: boolean; error?: string }) => {
                  if (response.error) {
                    errback(new Error(response.error))
                  } else {
                    callback()
                  }
                }
              )
            })

            recvTransportRef.current = recvTransport

            // Restore producer if we had one
            if (sessionStateRef.current.savedLocalStream) {
              const audioTrack = sessionStateRef.current.savedLocalStream.getAudioTracks()[0]
              if (audioTrack && audioTrack.readyState === 'live') {
                console.log('[useMediasoup] Session recovery: restoring audio producer')
                const producer = await sendTransport.produce({ track: audioTrack })
                producerRef.current = producer

                // Restore mute state
                if (sessionStateRef.current.wasMuted) {
                  await producer.pause()
                  socket.emit('producer:pause', { roomId, producerId: producer.id })
                }
              }
            }

            // Consume existing producers
            if (rejoinResponse.existingProducers) {
              console.log('[useMediasoup] Session recovery: consuming', rejoinResponse.existingProducers.length, 'existing producers')
              for (const ep of rejoinResponse.existingProducers) {
                if (ep.participantId !== rejoinResponse.participantId) {
                  await createConsumer(ep.participantId, ep.displayName, ep.producerId)
                }
              }
            }

            // Clear saved session state
            sessionStateRef.current = {
              wasConnected: false,
              wasMuted: true,
              savedLocalStream: null,
              savedParticipantId: null,
            }

            setIsConnected(true)
            console.log('[useMediasoup] Session recovery complete!')
          } catch (err) {
            console.error('[useMediasoup] Session recovery failed:', err)
            setError('Failed to recover session. Please refresh the page.')
            setIsReconnecting(false)
          }
        }
      })

      console.log('[useMediasoup] Event handlers registered')

      // Check if we're in the waiting room
      if (joinResponse.inWaitingRoom) {
        console.log('[useMediasoup] Placed in waiting room')
        setIsInWaitingRoom(true)
        setIsConnecting(false)
        // Don't proceed with WebRTC setup - wait for admission
        return
      }

      // Store ICE servers
      iceServersRef.current = joinResponse.iceServers || []
      console.log('[useMediasoup] ICE servers:', iceServersRef.current.map(s => s.urls))

      // Create mediasoup device
      const device = new Device()
      await device.load({ routerRtpCapabilities: joinResponse.rtpCapabilities! })
      deviceRef.current = device

      console.log('[useMediasoup] Device loaded, can produce audio:', device.canProduce('audio'))

      // Create send transport
      const sendTransportInfo = await new Promise<{
        success?: boolean
        error?: string
        id?: string
        iceParameters?: mediasoupTypes.IceParameters
        iceCandidates?: mediasoupTypes.IceCandidate[]
        dtlsParameters?: mediasoupTypes.DtlsParameters
      }>((resolve) => {
        socket.emit('transport:create', { roomId, direction: 'send' }, resolve)
      })

      if (sendTransportInfo.error || !sendTransportInfo.success) {
        throw new Error(sendTransportInfo.error || 'Failed to create send transport')
      }

      const sendTransport = device.createSendTransport({
        id: sendTransportInfo.id!,
        iceParameters: sendTransportInfo.iceParameters as never,
        iceCandidates: sendTransportInfo.iceCandidates as never,
        dtlsParameters: sendTransportInfo.dtlsParameters as never,
        iceServers: iceServersRef.current as never,
      })

      sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        console.log('[useMediasoup] Send transport connecting...')
        socket.emit(
          'transport:connect',
          { roomId, transportId: sendTransport.id, dtlsParameters },
          (response: { success?: boolean; error?: string }) => {
            if (response.error) {
              console.error('[useMediasoup] Send transport connect failed:', response.error)
              errback(new Error(response.error))
            } else {
              console.log('[useMediasoup] Send transport connected!')
              callback()
            }
          }
        )
      })

      sendTransport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
        console.log('[useMediasoup] Creating producer for:', kind, appData)
        socket.emit(
          'producer:create',
          { roomId, transportId: sendTransport.id, kind, rtpParameters, appData },
          (response: { success?: boolean; error?: string; producerId?: string }) => {
            if (response.error) {
              console.error('[useMediasoup] Producer create failed:', response.error)
              errback(new Error(response.error))
            } else {
              console.log('[useMediasoup] Producer created:', response.producerId)
              callback({ id: response.producerId! })
            }
          }
        )
      })

      sendTransport.on('connectionstatechange', (state) => {
        console.log('[useMediasoup] Send transport connection state:', state)
      })

      sendTransportRef.current = sendTransport
      console.log('[useMediasoup] Send transport created, ICE candidates:', sendTransportInfo.iceCandidates?.map((c: any) => `${c.protocol}://${c.ip}:${c.port}`))

      // Create receive transport
      const recvTransportInfo = await new Promise<{
        success?: boolean
        error?: string
        id?: string
        iceParameters?: mediasoupTypes.IceParameters
        iceCandidates?: mediasoupTypes.IceCandidate[]
        dtlsParameters?: mediasoupTypes.DtlsParameters
      }>((resolve) => {
        socket.emit('transport:create', { roomId, direction: 'recv' }, resolve)
      })

      if (recvTransportInfo.error || !recvTransportInfo.success) {
        throw new Error(recvTransportInfo.error || 'Failed to create receive transport')
      }

      const recvTransport = device.createRecvTransport({
        id: recvTransportInfo.id!,
        iceParameters: recvTransportInfo.iceParameters as never,
        iceCandidates: recvTransportInfo.iceCandidates as never,
        dtlsParameters: recvTransportInfo.dtlsParameters as never,
        iceServers: iceServersRef.current as never,
      })

      recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        console.log('[useMediasoup] Recv transport connecting...')
        socket.emit(
          'transport:connect',
          { roomId, transportId: recvTransport.id, dtlsParameters },
          (response: { success?: boolean; error?: string }) => {
            if (response.error) {
              console.error('[useMediasoup] Recv transport connect failed:', response.error)
              errback(new Error(response.error))
            } else {
              console.log('[useMediasoup] Recv transport connected!')
              callback()
            }
          }
        )
      })

      recvTransport.on('connectionstatechange', (state) => {
        console.log('[useMediasoup] Recv transport connection state:', state)
      })

      recvTransportRef.current = recvTransport
      console.log('[useMediasoup] Receive transport created, ICE candidates:', recvTransportInfo.iceCandidates?.map((c: any) => `${c.protocol}://${c.ip}:${c.port}`))

      // Get local audio stream (use selected device if available)
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }

      // Use selected device if one is set
      if (selectedAudioDeviceRef.current) {
        audioConstraints.deviceId = { ideal: selectedAudioDeviceRef.current }
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      })

      // Now that we have permission, refresh device list to get labels
      await refreshAudioDevices()

      // Update selected device to match what we actually got
      const activeTrack = stream.getAudioTracks()[0]
      if (activeTrack) {
        const settings = activeTrack.getSettings()
        if (settings.deviceId) {
          selectedAudioDeviceRef.current = settings.deviceId
          setSelectedAudioDevice(settings.deviceId)
        }
      }

      // Start muted
      stream.getAudioTracks().forEach((track) => {
        track.enabled = false
      })

      localStreamRef.current = stream
      setLocalStream(stream)
      setIsMuted(true)

      // Create producer
      const audioTrack = stream.getAudioTracks()[0]
      console.log('[useMediasoup] Creating producer with track:', {
        id: audioTrack.id,
        enabled: audioTrack.enabled,
        muted: audioTrack.muted,
        readyState: audioTrack.readyState,
      })

      const producer = await sendTransport.produce({
        track: audioTrack,
        codecOptions: {
          opusStereo: true,
          opusDtx: false,
          opusFec: true,
          opusMaxPlaybackRate: 48000,
        },
      })

      producerRef.current = producer
      console.log('[useMediasoup] Producer created successfully:', producer.id, 'paused:', producer.paused)

      // Set up Voice Activity Detection (VAD)
      const vadContext = new AudioContext()
      const vadSource = vadContext.createMediaStreamSource(stream)
      const vadAnalyser = vadContext.createAnalyser()
      vadAnalyser.fftSize = 512
      vadAnalyser.smoothingTimeConstant = 0.4
      vadSource.connect(vadAnalyser)
      // Don't connect to destination - we just want to analyze

      vadContextRef.current = vadContext
      vadAnalyserRef.current = vadAnalyser

      const VAD_THRESHOLD = 15 // Audio level threshold (0-255)
      const VAD_DEBOUNCE = 200 // ms

      let speakingStartTime = 0
      let silenceStartTime = 0

      const detectVoiceActivity = () => {
        // Check if VAD was stopped (prevent zombie animation frames)
        if (vadStoppedRef.current || !vadAnalyserRef.current) return

        const dataArray = new Uint8Array(vadAnalyser.frequencyBinCount)
        vadAnalyser.getByteFrequencyData(dataArray)

        // Calculate average level
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i]
        }
        const average = sum / dataArray.length
        const now = Date.now()

        // Detect speaking state with debouncing
        if (average > VAD_THRESHOLD) {
          speakingStartTime = speakingStartTime || now
          silenceStartTime = 0

          if (!lastSpeakingRef.current && now - speakingStartTime > VAD_DEBOUNCE) {
            lastSpeakingRef.current = true
            setIsSpeaking(true)
            socketRef.current?.emit('vad:speaking', { isSpeaking: true })
          }
        } else {
          silenceStartTime = silenceStartTime || now
          speakingStartTime = 0

          if (lastSpeakingRef.current && now - silenceStartTime > VAD_DEBOUNCE) {
            lastSpeakingRef.current = false
            setIsSpeaking(false)
            socketRef.current?.emit('vad:speaking', { isSpeaking: false })
          }
        }

        // Only reschedule if not stopped
        if (!vadStoppedRef.current) {
          vadAnimationRef.current = requestAnimationFrame(detectVoiceActivity)
        }
      }

      // Reset stop flag before starting
      vadStoppedRef.current = false
      vadAnimationRef.current = requestAnimationFrame(detectVoiceActivity)
      console.log('[useMediasoup] VAD started')

      // Start connection quality monitoring
      const calculateQuality = (packetLoss: number, jitter: number, rtt: number): ConnectionQuality => {
        // Quality thresholds based on WebRTC best practices
        if (packetLoss > 10 || jitter > 100 || rtt > 500) return 'poor'
        if (packetLoss > 5 || jitter > 50 || rtt > 300) return 'fair'
        if (packetLoss > 2 || jitter > 30 || rtt > 150) return 'good'
        return 'excellent'
      }

      const pollStats = async () => {
        try {
          const transport = sendTransportRef.current
          if (!transport) return

          const stats = await transport.getStats()
          let packetLoss = 0
          let jitter = 0
          let rtt = 0

          stats.forEach((report) => {
            if (report.type === 'outbound-rtp' && report.kind === 'audio') {
              const sent = report.packetsSent || 0
              const lost = report.packetsLost || 0
              packetLoss = sent > 0 ? (lost / sent) * 100 : 0
            }
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
              rtt = report.currentRoundTripTime ? report.currentRoundTripTime * 1000 : 0
            }
            if (report.type === 'remote-inbound-rtp') {
              jitter = report.jitter ? report.jitter * 1000 : 0
            }
          })

          const quality = calculateQuality(packetLoss, jitter, rtt)
          setConnectionStats({ quality, packetLoss, jitter, roundTripTime: rtt })
        } catch (err) {
          console.warn('[useMediasoup] Error getting stats:', err)
        }
      }

      // Poll stats every 2 seconds - wrap async call to handle errors
      statsIntervalRef.current = setInterval(() => {
        pollStats().catch((err) => {
          console.warn('[useMediasoup] Stats polling error:', err)
        })
      }, 2000)
      // Initial poll with error handling
      pollStats().catch((err) => {
        console.warn('[useMediasoup] Initial stats poll error:', err)
      })
      console.log('[useMediasoup] Connection quality monitoring started')

      // Consume existing producers
      if (joinResponse.existingProducers && joinResponse.existingProducers.length > 0) {
        console.log(`[useMediasoup] Consuming ${joinResponse.existingProducers.length} existing producers`)
        for (const { participantId, producerId, displayName: name } of joinResponse.existingProducers) {
          await createConsumer(participantId, name, producerId)
        }
      }

      setIsConnected(true)
      setIsConnecting(false)
      console.log('[useMediasoup] Fully connected')
    } catch (err) {
      console.error('[useMediasoup] Connection error:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect'
      setError(errorMessage)
      onError?.(errorMessage)
      cleanup()
    }
  }, [
    roomId,
    displayName,
    accessCode,
    tokens?.accessToken,
    isConnecting,
    isConnected,
    cleanup,
    createConsumer,
    onParticipantJoined,
    onParticipantLeft,
    onKicked,
    onRoomClosed,
    onWaitingRoomAdmitted,
    onWaitingRoomRejected,
    onNewWaitingParticipant,
    onError,
  ])

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return

    const newMutedState = !isMuted
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !newMutedState
    })
    setIsMuted(newMutedState)

    // Notify server
    socketRef.current?.emit('mute:update', { isMuted: newMutedState })
  }, [isMuted])

  // Kick participant (host action - must call API first, this just notifies)
  const kickParticipant = useCallback((targetParticipantId: string) => {
    socketRef.current?.emit('host:kick', { participantId: targetParticipantId })
  }, [])

  // Close room (host action - must call API first, this just notifies)
  const closeRoom = useCallback(() => {
    socketRef.current?.emit('host:close-room', {})
  }, [])

  // Admit participant from waiting room (host action - must call API first, this just notifies)
  const admitParticipant = useCallback((targetParticipantId: string) => {
    socketRef.current?.emit('host:admit', { participantId: targetParticipantId })
    // Remove from waiting list
    setWaitingParticipants((prev) => prev.filter((p) => p.participantId !== targetParticipantId))
  }, [])

  // Reject participant from waiting room (host action)
  const rejectParticipant = useCallback((targetParticipantId: string) => {
    socketRef.current?.emit('host:reject', { participantId: targetParticipantId })
    // Remove from waiting list
    setWaitingParticipants((prev) => prev.filter((p) => p.participantId !== targetParticipantId))
  }, [])

  // Produce auxiliary audio (for audio sources like HTTP streams)
  // This sends the audio to all participants in the room
  const produceAuxiliaryAudio = useCallback(async (stream: MediaStream, sourceId: string): Promise<string | null> => {
    if (!sendTransportRef.current || !isConnected) {
      console.warn('[useMediasoup] Cannot produce auxiliary audio: not connected')
      return null
    }

    try {
      const audioTrack = stream.getAudioTracks()[0]
      if (!audioTrack) {
        console.error('[useMediasoup] No audio track in stream for source:', sourceId)
        return null
      }

      console.log('[useMediasoup] Creating auxiliary producer for source:', sourceId, {
        trackId: audioTrack.id,
        enabled: audioTrack.enabled,
        readyState: audioTrack.readyState,
      })

      const producer = await sendTransportRef.current.produce({
        track: audioTrack,
        codecOptions: {
          opusStereo: true,
          opusDtx: false,
          opusFec: true,
          opusMaxPlaybackRate: 48000,
        },
        appData: { sourceId, isAudioSource: true }, // Mark this as an audio source
      })

      auxiliaryProducersRef.current.set(sourceId, producer)
      console.log('[useMediasoup] Auxiliary producer created:', producer.id, 'for source:', sourceId)

      return producer.id
    } catch (err) {
      console.error('[useMediasoup] Failed to create auxiliary producer:', err)
      return null
    }
  }, [isConnected])

  // Close an auxiliary producer (when audio source is stopped)
  const closeAuxiliaryProducer = useCallback((sourceId: string) => {
    const producer = auxiliaryProducersRef.current.get(sourceId)
    if (producer) {
      console.log('[useMediasoup] Closing auxiliary producer for source:', sourceId)
      producer.close()
      auxiliaryProducersRef.current.delete(sourceId)
    }
  }, [])

  // Produce bus output (for streaming mixed bus audio to server for encoding)
  // This is used when the host wants to stream a bus to Icecast/SRT
  const produceBusOutput = useCallback(async (busType: BusType, stream: MediaStream): Promise<string | null> => {
    if (!sendTransportRef.current || !isConnected) {
      console.warn('[useMediasoup] Cannot produce bus output: not connected')
      return null
    }

    // Check if already producing this bus
    if (busProducersRef.current.has(busType)) {
      console.warn(`[useMediasoup] Bus ${busType} is already being produced`)
      return busProducersRef.current.get(busType)!.producer.id
    }

    try {
      const audioTrack = stream.getAudioTracks()[0]
      if (!audioTrack) {
        console.error('[useMediasoup] No audio track in bus stream:', busType)
        return null
      }

      console.log('[useMediasoup] Creating bus producer for:', busType, {
        trackId: audioTrack.id,
        enabled: audioTrack.enabled,
        readyState: audioTrack.readyState,
      })

      const producer = await sendTransportRef.current.produce({
        track: audioTrack,
        codecOptions: {
          opusStereo: true,
          opusDtx: false,
          opusFec: true,
          opusMaxPlaybackRate: 48000,
        },
        appData: { busType, isBusOutput: true }, // Tag this as a bus output
      })

      busProducersRef.current.set(busType, { producer, stream })

      // Update state
      setActiveBusProducers(prev => {
        const next = new Map(prev)
        next.set(busType, { busType, producerId: producer.id, stream })
        return next
      })

      // Notify server that bus producer is ready
      socketRef.current?.emit('bus:producer:ready', {
        busType,
        producerId: producer.id,
      })

      console.log('[useMediasoup] Bus producer created:', producer.id, 'for bus:', busType)
      return producer.id
    } catch (err) {
      console.error('[useMediasoup] Failed to create bus producer:', err)
      return null
    }
  }, [isConnected])

  // Stop producing bus output
  const stopBusOutput = useCallback((busType: BusType) => {
    const busInfo = busProducersRef.current.get(busType)
    if (busInfo) {
      console.log('[useMediasoup] Stopping bus producer for:', busType)
      busInfo.producer.close()
      busProducersRef.current.delete(busType)

      // Update state
      setActiveBusProducers(prev => {
        const next = new Map(prev)
        next.delete(busType)
        return next
      })

      // Notify server
      socketRef.current?.emit('bus:producer:stopped', { busType })
    }
  }, [])

  // Update on-air/tally state for channels
  // This emits socket events so other participants and external tally systems can know which channels are on-air
  const updateOnAirChannels = useCallback((channelIds: string[]) => {
    if (!socketRef.current || !isConnected) return

    socketRef.current.emit('tally:update', {
      onAirChannelIds: channelIds,
    })
    console.log('[useMediasoup] Tally update emitted:', channelIds)
  }, [isConnected])

  // Disconnect
  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true
    socketRef.current?.emit('room:leave', { roomId })
    cleanup()
  }, [roomId, cleanup])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  return {
    isConnected,
    isConnecting,
    isReconnecting,
    isInWaitingRoom,
    localStream,
    remoteParticipants,
    waitingParticipants,
    isMuted,
    isSpeaking,
    connectionStats,
    error,
    participantId,
    // Audio input device selection
    audioDevices,
    selectedAudioDevice,
    refreshAudioDevices,
    selectAudioDevice,
    // Audio output device selection
    audioOutputDevices,
    selectedAudioOutput,
    selectAudioOutput,
    registerAudioElement,
    // Talkback channel routing
    selectedTalkbackOutput,
    selectTalkbackOutput,
    participantChannels,
    setParticipantChannel,
    // Auxiliary audio (for audio sources like HTTP streams)
    produceAuxiliaryAudio,
    closeAuxiliaryProducer,
    // Bus output (for streaming mixed bus audio to server)
    produceBusOutput,
    stopBusOutput,
    activeBusProducers,
    // Tally/on-air state
    updateOnAirChannels,
    // Actions
    connect,
    disconnect,
    toggleMute,
    kickParticipant,
    admitParticipant,
    rejectParticipant,
    closeRoom,
  }
}
