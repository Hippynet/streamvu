import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { io, Socket } from 'socket.io-client'
import { api, ApiError } from '../services/api'
import { useMediasoup } from '../hooks/useMediasoup'
import { useAudioSources } from '../hooks/useAudioSources'
// import { useOBFeatures } from '../hooks/useCallCenterExtensions'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useRemoteControl } from '../hooks/useRemoteControl'
import { useAuthStore } from '../stores/authStore'
import { getWsUrl, getApiUrl, config } from '../config'
import { RoomSettingsModal } from '../components/callCenter/RoomSettingsModal'
import { AddSourceModal } from '../components/callCenter/AddSourceModal'
import { AddOutputModal } from '../components/callCenter/AddOutputModal'
import { FilePlayer } from '../components/callCenter/FilePlayer'
import { UnifiedSidebar } from '../components/callCenter/UnifiedSidebar'
import { LeftSidebar } from '../components/callCenter/LeftSidebar'
import { ProfessionalAudioControls } from '../components/callCenter/ProfessionalAudioControls'
import { ProMixer, type ProMixerControls } from '../components/callCenter/ProMixer'
import type { RoutingSource, SourceRouting, OutputDestination } from '../components/callCenter/AudioRoutingMatrix'
import type { BusType } from '../hooks/useAudioEngine'
import { ShortcutsOverlay } from '../components/callCenter/ShortcutsOverlay'
import { ReturnVideoPlayer } from '../components/callCenter/ReturnVideoPlayer'
import { TimecodeDisplay } from '../components/callCenter/TimecodeDisplay'
import { TemplateManager } from '../components/callCenter/TemplateManager'
import { BondedConnectionStatus } from '../components/callCenter/BondedConnectionStatus'
import { DimModeToggle } from '../components/callCenter/DimModeToggle'
import { RemoteControlIndicator } from '../components/callCenter/RemoteControlIndicator'
import { useBondedConnection } from '../services/bondedConnection'
import { useNotifications } from '../components/common/NotificationToast'
import { AudioChannel } from '@streamvu/shared'
import type { CallRoomWithParticipants, AudioSource, AudioOutput } from '@streamvu/shared'

interface RoomOutletContext {
  onToggleSidebar: () => void
  sidebarVisible: boolean
}

export default function Room() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const { onToggleSidebar, sidebarVisible } = useOutletContext<RoomOutletContext>()
  const user = useAuthStore((state) => state.user)

  const [room, setRoom] = useState<CallRoomWithParticipants | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [isClosingRoom, setIsClosingRoom] = useState(false)
  const [kickingParticipant, setKickingParticipant] = useState<string | null>(null)
  const [admittingParticipant, setAdmittingParticipant] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  // Enterprise Contribution Suite state
  const [showAddSource, setShowAddSource] = useState(false)
  const [showAddOutput, setShowAddOutput] = useState(false)
  const [showTemplateManager, setShowTemplateManager] = useState(false)
  const [selectedFileSource, setSelectedFileSource] = useState<AudioSource | null>(null)
  const [sourcesRefreshKey, setSourcesRefreshKey] = useState(0)
  const [outputsRefreshKey, setOutputsRefreshKey] = useState(0)
  const [returnFeedMinimized, setReturnFeedMinimized] = useState(false)

  // Virtual Tally - tracks which channels are on-air (routed to PGM and active)
  const [onAirChannelIds, setOnAirChannelIds] = useState<string[]>([])

  // Mixer controls ref for keyboard shortcuts
  const mixerControlsRef = useRef<ProMixerControls | null>(null)

  // Socket ref for remote control (contributors receiving remote adjustments)
  const remoteControlSocketRef = useRef<Socket | null>(null)
  const tokens = useAuthStore((state) => state.tokens)

  // Clock for header
  const [time, setTime] = useState(new Date())

  // Get display name from user or session storage (for guests)
  const displayName = user?.name || sessionStorage.getItem('guestDisplayName') || 'Guest'
  const accessCode = sessionStorage.getItem('guestAccessCode') || undefined

  // Check if current user is a host (room creator or authenticated org member)
  const isHost = user && room && room.createdById === user.id

  // Notifications
  const notifications = useNotifications()

  // useMediasoup must be called before useAudioSources so we can pass the auxiliary producer functions
  const {
    isConnected,
    isConnecting,
    isReconnecting,
    isInWaitingRoom,
    localStream,
    remoteParticipants,
    waitingParticipants,
    isMuted,
    isSpeaking: localIsSpeaking,
    connectionStats,
    error: webrtcError,
    participantId: _participantId,
    audioDevices,
    selectedAudioDevice,
    selectAudioDevice,
    audioOutputDevices,
    selectedAudioOutput,
    selectAudioOutput,
    registerAudioElement,
    selectedTalkbackOutput,
    selectTalkbackOutput,
    connect,
    disconnect,
    toggleMute,
    kickParticipant: socketKick,
    admitParticipant: socketAdmit,
    rejectParticipant: socketReject,
    closeRoom: socketCloseRoom,
    // Auxiliary audio for sharing audio sources with all participants
    produceAuxiliaryAudio,
    closeAuxiliaryProducer,
    // Bus output for streaming mixed bus audio to server
    produceBusOutput,
    stopBusOutput,
    // Tally/on-air state
    updateOnAirChannels,
  } = useMediasoup({
    roomId: roomId || '',
    displayName,
    accessCode,
    onParticipantJoined: (_participantId, name) => {
      console.log(`${name} joined the room`)
      notifications.info('Participant Joined', `${name} has joined the room`)
    },
    onParticipantLeft: (participantId) => {
      console.log('A participant left:', participantId)
      notifications.info('Participant Left', 'A participant has left the room')
    },
    onKicked: () => {
      // We were kicked from the room
      sessionStorage.removeItem('guestDisplayName')
      sessionStorage.removeItem('guestAccessCode')
      navigate('/call-center', { state: { message: 'You were removed from the room' } })
    },
    onRoomClosed: () => {
      // Room was closed by host
      sessionStorage.removeItem('guestDisplayName')
      sessionStorage.removeItem('guestAccessCode')
      navigate('/call-center', { state: { message: 'The room was closed by the host' } })
    },
    onWaitingRoomRejected: () => {
      // We were rejected from the waiting room
      sessionStorage.removeItem('guestDisplayName')
      sessionStorage.removeItem('guestAccessCode')
      navigate('/call-center', { state: { message: 'Your request to join was declined' } })
    },
    onError: (err) => {
      console.error('WebRTC error:', err)
      notifications.error('Connection Error', typeof err === 'string' ? err : 'A connection error occurred')
    },
  })

  // Audio sources management (HTTP streams, files)
  // Uses mediasoup auxiliary producers to share audio with all participants
  const {
    sources: audioSources,
    playbackState: audioPlaybackState,
    startSource,
    stopSource,
    loadSources: reloadSources,
    getSourceStream,
  } = useAudioSources({
    roomId: roomId || '',
    enabled: !!roomId && !!isHost,
    produceAuxiliaryAudio,
    closeAuxiliaryProducer,
  })

  // Get participant ID for potential future use
  const participantId = remoteParticipants.find(p => p.displayName === displayName)?.participantId

  // Audio Routing Matrix state - derived from mixer channel states
  const [routingSources, setRoutingSources] = useState<RoutingSource[]>([])
  const [routingState, setRoutingState] = useState<Record<string, SourceRouting>>({})
  const [routingOutputs, setRoutingOutputs] = useState<OutputDestination[]>([])
  const [mixerControlsReady, setMixerControlsReady] = useState(false)

  // Handle receiving mixer controls from ProMixer (and trigger routing state sync)
  const handleMixerControlsReady = useCallback((controls: ProMixerControls) => {
    mixerControlsRef.current = controls
    setMixerControlsReady(true)
  }, [])

  // Sync routing state from mixer channel states (polling every 500ms for changes)
  useEffect(() => {
    if (!mixerControlsReady || !isHost) return

    const syncRoutingState = () => {
      const controls = mixerControlsRef.current
      if (!controls) return

      const channelStates = controls.getChannelStates()
      const channelEntries = Object.entries(channelStates)
      if (channelEntries.length === 0) return

      // Build routing sources from channel states
      const sources: RoutingSource[] = channelEntries.map(([id, ch]) => ({
        id,
        label: ch.label,
        type: ch.color?.includes('blue') ? 'webrtc' :
              ch.color?.includes('green') ? 'http' :
              ch.color?.includes('orange') ? 'file' : 'webrtc',
        color: ch.color,
      }))
      setRoutingSources(sources)

      // Build routing state from channel states
      const routing: Record<string, SourceRouting> = {}
      channelEntries.forEach(([id, ch]) => {
        routing[id] = {
          buses: {
            pgm: ch.busAssignment.includes('PGM'),
            tb: ch.busAssignment.includes('TB'),
            aux1: ch.busAssignment.includes('AUX1'),
            aux2: ch.busAssignment.includes('AUX2'),
            aux3: ch.busAssignment.includes('AUX3'),
            aux4: ch.busAssignment.includes('AUX4'),
          },
          auxLevels: {
            pgm: 1,
            tb: 1,
            aux1: ch.auxSends[0],
            aux2: ch.auxSends[1],
            aux3: ch.auxSends[2],
            aux4: ch.auxSends[3],
          },
          preFader: {},
        }
      })
      setRoutingState(routing)
    }

    // Initial sync
    syncRoutingState()

    // Poll for changes every 500ms
    const interval = setInterval(syncRoutingState, 500)
    return () => clearInterval(interval)
  }, [mixerControlsReady, isHost])

  // Load outputs for routing matrix
  useEffect(() => {
    if (!roomId || !isHost) return

    const loadOutputs = async () => {
      try {
        const outputs = await api.audioOutputs.list(roomId)
        // Convert AudioOutput to OutputDestination format
        const destinations: OutputDestination[] = outputs.map((output: AudioOutput) => ({
          id: output.id,
          label: output.name,
          type: output.type === 'ICECAST' ? 'icecast' as const :
                output.type === 'SRT' ? 'srt' as const :
                output.type === 'FILE_RECORDING' ? 'recording' as const : 'monitor' as const,
          url: output.type === 'ICECAST' && output.icecastHost
            ? `${output.icecastHost}:${output.icecastPort}${output.icecastMount}`
            : output.type === 'SRT' && output.srtHost
            ? `${output.srtHost}:${output.srtPort}`
            : undefined,
          status: output.isConnected ? 'connected' as const :
                  output.isActive ? 'connecting' as const :
                  output.errorMessage ? 'error' as const : 'idle' as const,
          // Map AudioChannel to BusType
          busSource: (output.channel === 'PROGRAM' ? 'PGM' :
                     output.channel === 'TALKBACK' ? 'TB' :
                     output.channel) as BusType,
        }))
        setRoutingOutputs(destinations)
      } catch (err) {
        console.error('Failed to load outputs for routing matrix:', err)
      }
    }

    loadOutputs()
    // Refresh every 5 seconds to get status updates
    const interval = setInterval(loadOutputs, 5000)
    return () => clearInterval(interval)
  }, [roomId, isHost])

  // Handle routing change from AudioRoutingMatrix
  const handleRoutingChange = useCallback((sourceId: string, busType: BusType, enabled: boolean) => {
    const controls = mixerControlsRef.current
    if (!controls) return
    controls.updateChannelRouting(sourceId, busType, enabled)
  }, [])

  // Handle aux level change from AudioRoutingMatrix
  const handleAuxLevelChange = useCallback((sourceId: string, busType: BusType, level: number) => {
    const controls = mixerControlsRef.current
    if (!controls) return
    controls.updateAuxSend(sourceId, busType, level)
  }, [])

  // Handle output bus source change from AudioRoutingMatrix
  const handleOutputBusChange = useCallback(async (outputId: string, busSource: BusType) => {
    if (!roomId) return
    try {
      // Map BusType to AudioChannel enum value
      const channelMap: Record<BusType, AudioChannel> = {
        PGM: AudioChannel.PROGRAM,
        TB: AudioChannel.TALKBACK,
        AUX1: AudioChannel.AUX1,
        AUX2: AudioChannel.AUX2,
        AUX3: AudioChannel.AUX3,
        AUX4: AudioChannel.AUX4,
      }
      await api.audioOutputs.update(roomId, outputId, { channel: channelMap[busSource] })
      // Update local state
      setRoutingOutputs(prev => prev.map(o =>
        o.id === outputId ? { ...o, busSource } : o
      ))
    } catch (err) {
      console.error('Failed to update output bus source:', err)
    }
  }, [roomId])

  // Audio engine ref for bus output production
  const audioEngineRef = useRef<{
    getBusOutputStream: (busType: BusType) => MediaStream | null
    isInitialized: () => boolean
    isRunning: () => boolean
  } | null>(null)
  const busProducerStartedRef = useRef<{ pgm: boolean; tb: boolean }>({ pgm: false, tb: false })
  // State trigger for when audio engine becomes ready (refs don't trigger effects)
  const [audioEngineReady, setAudioEngineReady] = useState(false)

  // Handle receiving audio engine functions from ProMixer
  const handleAudioEngineReady = useCallback((audioEngine: {
    getBusOutputStream: (busType: BusType) => MediaStream | null
    isInitialized: () => boolean
    isRunning: () => boolean
  }) => {
    audioEngineRef.current = audioEngine
    // Trigger effect re-run now that audio engine is ready
    setAudioEngineReady(true)
  }, [])

  // Produce PGM and TB bus outputs when connected and audio engine is ready (host only)
  useEffect(() => {
    if (!isConnected || !isHost || !audioEngineRef.current) {
      return
    }

    const audioEngine = audioEngineRef.current
    if (!audioEngine.isInitialized()) {
      return
    }

    // Wait for AudioContext to be running before creating bus producers
    // This ensures the bus streams are producing audio when the producer is created
    if (!audioEngine.isRunning()) {
      console.log('[Room] Waiting for AudioContext to be running before creating bus producers...')
      // Set up an interval to check for running state
      const checkInterval = setInterval(() => {
        if (audioEngine.isRunning()) {
          console.log('[Room] AudioContext is now running, triggering re-render')
          clearInterval(checkInterval)
          setAudioEngineReady(prev => !prev) // Toggle to trigger re-render
        }
      }, 100)
      return () => clearInterval(checkInterval)
    }

    // Start PGM bus producer if not already started
    if (!busProducerStartedRef.current.pgm) {
      const pgmStream = audioEngine.getBusOutputStream('PGM')
      if (pgmStream) {
        console.log('[Room] Starting PGM bus production to server (AudioContext running)')
        busProducerStartedRef.current.pgm = true
        produceBusOutput('PGM', pgmStream).then((producerId) => {
          if (producerId) {
            console.log('[Room] PGM bus producer started:', producerId)
          } else {
            console.error('[Room] Failed to start PGM bus producer')
            busProducerStartedRef.current.pgm = false
          }
        }).catch((err) => {
          console.error('[Room] Error starting PGM bus producer:', err)
          busProducerStartedRef.current.pgm = false
        })
      }
    }

    // Start TB (Talkback) bus producer if not already started
    // This enables IFB audio routing to participants
    if (!busProducerStartedRef.current.tb) {
      const tbStream = audioEngine.getBusOutputStream('TB')
      if (tbStream) {
        console.log('[Room] Starting TB bus production to server for IFB routing')
        busProducerStartedRef.current.tb = true
        produceBusOutput('TB', tbStream).then((producerId) => {
          if (producerId) {
            console.log('[Room] TB bus producer started:', producerId)
          } else {
            console.error('[Room] Failed to start TB bus producer')
            busProducerStartedRef.current.tb = false
          }
        }).catch((err) => {
          console.error('[Room] Error starting TB bus producer:', err)
          busProducerStartedRef.current.tb = false
        })
      }
    }

    return () => {
      // Stop bus producers on cleanup
      if (busProducerStartedRef.current.pgm) {
        console.log('[Room] Stopping PGM bus producer')
        stopBusOutput('PGM')
        busProducerStartedRef.current.pgm = false
      }
      if (busProducerStartedRef.current.tb) {
        console.log('[Room] Stopping TB bus producer')
        stopBusOutput('TB')
        busProducerStartedRef.current.tb = false
      }
    }
  }, [isConnected, isHost, audioEngineReady, produceBusOutput, stopBusOutput])

  // Keyboard shortcuts for professional mixer control
  const { showShortcutsOverlay, setShowShortcutsOverlay, isTalkbackHeld, shortcuts } = useKeyboardShortcuts({
    enabled: isConnected && !isInWaitingRoom,
    handlers: {
      onToggleChannelMute: (index) => {
        mixerControlsRef.current?.toggleChannelMute(index)
      },
      onToggleChannelSolo: (index) => {
        mixerControlsRef.current?.toggleChannelSolo(index)
      },
      onClearAllSolos: () => {
        mixerControlsRef.current?.clearAllSolos()
      },
      onToggleMasterMute: () => {
        mixerControlsRef.current?.toggleMasterMute()
      },
      onTalkbackStart: () => {
        // Future: activate talkback to all participants
        console.log('Talkback START (push-to-talk)')
      },
      onTalkbackEnd: () => {
        // Future: deactivate talkback
        console.log('Talkback END')
      },
      onToggleTalkback: () => {
        // Future: toggle talkback mode
        console.log('Talkback TOGGLE')
      },
      onToggleRecording: () => {
        // Future: start/stop recording
        console.log('Recording TOGGLE')
      },
      onSaveSession: () => {
        // Future: save session settings
        console.log('Save session')
      },
    },
    channelCount: mixerControlsRef.current?.getChannelCount() ?? 12,
  })

  // Bonded connection for multi-path reliability (only enabled when feature is on and for hosts with auth)
  const bondedConfig = config.features.bondedConnections && isConnected && isHost && roomId && user
    ? {
        serverUrl: getApiUrl(),
        roomId,
        participantId: user.id,
        token: '', // Token would come from auth store in production
      }
    : null
  const bondedConnection = useBondedConnection(bondedConfig)

  // Socket for remote control events (contributors need this to receive notifications)
  useEffect(() => {
    // Only create socket for non-hosts who are connected
    if (!tokens?.accessToken || !roomId || !isConnected || isHost) return

    const socket = io(`${getWsUrl()}/call-center`, {
      auth: { token: tokens.accessToken },
      transports: ['websocket'],
    })

    remoteControlSocketRef.current = socket

    return () => {
      socket.disconnect()
      remoteControlSocketRef.current = null
    }
  }, [tokens?.accessToken, roomId, isConnected, isHost])

  // Remote control hook for contributors to receive remote adjustments from producer
  const remoteControl = useRemoteControl({
    socket: remoteControlSocketRef.current,
    roomId: roomId || null,
    participantId: participantId || null,
  })

  // Handle kicking a participant (host only)
  const handleKickParticipant = async (targetParticipantId: string) => {
    if (!roomId || !isHost) return

    setKickingParticipant(targetParticipantId)
    try {
      // Call API to validate permission and update database
      await api.rooms.kickParticipant(roomId, targetParticipantId)
      // Notify via socket
      socketKick(targetParticipantId)
    } catch (err) {
      console.error('Failed to kick participant:', err)
    } finally {
      setKickingParticipant(null)
    }
  }

  // Handle closing the room (host only)
  const handleCloseRoom = async () => {
    if (!roomId || !isHost) return

    setIsClosingRoom(true)
    try {
      // Call API to close room
      await api.rooms.close(roomId)
      // Notify via socket
      socketCloseRoom()
      // Navigate away
      navigate('/call-center', { state: { message: 'Room closed successfully' } })
    } catch (err) {
      console.error('Failed to close room:', err)
      setIsClosingRoom(false)
    }
  }

  // Handle admitting a participant from waiting room (host only)
  const handleAdmitParticipant = async (targetParticipantId: string) => {
    if (!roomId || !isHost) return

    setAdmittingParticipant(targetParticipantId)
    try {
      // Call API to validate permission and update database
      await api.rooms.admitParticipant(roomId, targetParticipantId)
      // Notify via socket
      socketAdmit(targetParticipantId)
    } catch (err) {
      console.error('Failed to admit participant:', err)
    } finally {
      setAdmittingParticipant(null)
    }
  }

  // Handle rejecting a participant from waiting room (host only)
  const handleRejectParticipant = (targetParticipantId: string) => {
    if (!roomId || !isHost) return
    socketReject(targetParticipantId)
  }

  useEffect(() => {
    if (!roomId) return

    const fetchRoom = async () => {
      try {
        const data = await api.rooms.get(roomId)
        setRoom(data)
      } catch (err) {
        setFetchError(err instanceof ApiError ? err.message : 'Failed to load room')
      } finally {
        setLoading(false)
      }
    }

    fetchRoom()
  }, [roomId])

  // Auto-connect when room is loaded
  useEffect(() => {
    if (room && room.isActive && !isConnected && !isConnecting && !webrtcError) {
      connect()
    }
  }, [room, isConnected, isConnecting, webrtcError, connect])

  // Update clock every second
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  // Emit tally updates when on-air channels change (host only)
  useEffect(() => {
    if (!isHost || !isConnected) return
    updateOnAirChannels(onAirChannelIds)
  }, [onAirChannelIds, isHost, isConnected, updateOnAirChannels])

  // Handlers for Enterprise Contribution Suite
  const handleSourceUpdate = (updatedSource: AudioSource) => {
    if (selectedFileSource?.id === updatedSource.id) {
      setSelectedFileSource(updatedSource)
    }
  }

  const handleSourceAdded = (_source: AudioSource) => {
    // Trigger panel refresh and reload sources
    setSourcesRefreshKey(prev => prev + 1)
    reloadSources()
  }

  const handleOutputAdded = (_output: AudioOutput) => {
    // Trigger panel refresh
    setOutputsRefreshKey(prev => prev + 1)
  }

  const handleLeave = () => {
    disconnect()
    // Clear guest session storage
    sessionStorage.removeItem('guestDisplayName')
    sessionStorage.removeItem('guestAccessCode')
    navigate('/call-center')
  }

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-primary-500"></div>
      </div>
    )
  }

  if (fetchError || !room) {
    return (
      <div className="flex h-[calc(100vh-8rem)] flex-col items-center justify-center">
        <div className="rounded-lg border border-red-700 bg-red-900/50 p-6 text-center">
          <h2 className="text-lg font-semibold text-white">Unable to Join Room</h2>
          <p className="mt-2 text-red-300">{fetchError || 'Room not found'}</p>
          <button onClick={handleLeave} className="btn btn-primary mt-4">
            Back to Call Center
          </button>
        </div>
      </div>
    )
  }

  // Show waiting room UI if participant is in waiting room
  if (isInWaitingRoom) {
    return (
      <div className="flex h-[calc(100vh-8rem)] flex-col items-center justify-center">
        <div className="card max-w-md p-8 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary-600/20">
            <svg className="h-8 w-8 text-primary-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white">Waiting Room</h2>
          <p className="mt-2 text-gray-400">
            Please wait while the host admits you to <span className="text-white">{room.name}</span>
          </p>
          <div className="mt-6 flex items-center justify-center gap-2 text-sm text-gray-500">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Waiting for host approval...
          </div>
          <button
            onClick={handleLeave}
            className="btn mt-6 bg-gray-600 text-white hover:bg-gray-500"
          >
            Leave Waiting Room
          </button>
        </div>
      </div>
    )
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  return (
    <div className="flex h-screen flex-col bg-black">
      {/* Header - MCR Style */}
      <header className="flex-shrink-0 border-b border-gray-800 bg-black px-4 py-2">
        <div className="flex items-center justify-between">
          {/* Left: Toggle & Title */}
          <div className="flex items-center gap-4">
            <button
              onClick={onToggleSidebar}
              className="rounded p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
              title={sidebarVisible ? 'Hide sidebar' : 'Show sidebar'}
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                {sidebarVisible ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                  />
                )}
              </svg>
            </button>

            <div>
              <h1 className="text-lg font-bold tracking-wide text-white">{room.name}</h1>
              <p className="text-[10px] tracking-widest text-gray-500">CALL CENTER</p>
            </div>
          </div>

          {/* Center: Status indicators */}
          <div className="flex items-center gap-6">
            {room.isActive && (
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 animate-pulse rounded-full bg-green-500" />
                <span className="text-sm font-medium text-green-400">LIVE</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <ConnectionStatusDot isConnected={isConnected} isConnecting={isConnecting} isReconnecting={isReconnecting} />
              <span className="text-sm text-gray-300">
                <span className="font-bold text-white">{remoteParticipants.length + 1}</span> Participants
              </span>
            </div>

            {isConnected && (
              <div className="flex items-center gap-2">
                <ConnectionQualityBadge quality={connectionStats.quality} />
              </div>
            )}

            {/* Bonded Connection Status (host only) */}
            {isHost && bondedConnection.stats && bondedConnection.stats.activePaths > 0 && (
              <BondedConnectionStatus stats={bondedConnection.stats} compact />
            )}

            {room.visibility === 'PUBLIC' && room.accessCode && (
              <div className="flex items-center gap-2 rounded border border-gray-700 bg-gray-900 px-2 py-1">
                <span className="text-[10px] uppercase tracking-wider text-gray-500">PIN</span>
                <span className="font-mono text-sm text-white">{room.accessCode}</span>
              </div>
            )}
          </div>

          {/* Right: Controls & Clock */}
          <div className="flex items-center gap-4">
            {isHost && (
              <>
                <button
                  onClick={() => setShowSettings(true)}
                  className="flex items-center gap-2 rounded border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Settings
                </button>
                <button
                  onClick={handleCloseRoom}
                  disabled={isClosingRoom}
                  className="flex items-center gap-2 rounded border border-red-700 bg-red-900/50 px-3 py-1.5 text-sm text-red-400 transition-colors hover:bg-red-900 disabled:opacity-50"
                >
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  {isClosingRoom ? 'Closing...' : 'End Room'}
                </button>
              </>
            )}

            {/* Template Manager button (host only) */}
            {isHost && (
              <button
                onClick={() => setShowTemplateManager(true)}
                className="flex items-center gap-2 rounded border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
                title="Session Templates"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                Templates
              </button>
            )}

            {/* Keyboard Shortcuts button */}
            <button
              onClick={() => setShowShortcutsOverlay(true)}
              className="flex h-8 w-8 items-center justify-center rounded border border-gray-700 bg-gray-900 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
              title="Keyboard Shortcuts (?)"
            >
              <span className="font-mono text-sm font-bold">?</span>
            </button>

            {/* Timecode Display */}
            <TimecodeDisplay mode="TOD" frameRate={25} size="md" showMode={false} />

            {/* Dim Mode Toggle */}
            <DimModeToggle compact />

            {/* Clock */}
            <div className="text-right">
              <div className="font-mono text-2xl font-bold tracking-wider text-white">
                {formatTime(time)}
              </div>
              <div className="text-[10px] tracking-wider text-gray-500">{formatDate(time)}</div>
            </div>
          </div>
        </div>
      </header>

      {/* Error banner */}
      {webrtcError && (
        <div className="border-b border-red-900 bg-red-950/50 px-3 py-1.5 text-xs text-red-400 font-mono">
          <span className="text-red-500">ERROR:</span> {webrtcError}
          <button onClick={connect} className="ml-4 text-red-300 underline hover:text-white">
            RETRY
          </button>
        </div>
      )}

      {/* Waiting Room Banner (hosts only) */}
      {isHost && waitingParticipants.length > 0 && (
        <div className="border-b border-yellow-900 bg-yellow-950/30 px-3 py-1.5">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono uppercase text-yellow-500">
              {waitingParticipants.length} WAITING
            </span>
            <div className="flex flex-wrap gap-1">
              {waitingParticipants.map((wp) => (
                <div key={wp.participantId} className="flex items-center gap-1 bg-gray-900 px-2 py-0.5 border border-gray-800">
                  <span className="text-[10px] text-white">{wp.displayName}</span>
                  <button
                    onClick={() => handleAdmitParticipant(wp.participantId)}
                    disabled={admittingParticipant === wp.participantId}
                    className="bg-green-900/50 px-1.5 py-0.5 text-[10px] text-green-400 hover:bg-green-900/70 disabled:opacity-50"
                  >
                    {admittingParticipant === wp.participantId ? '...' : 'ADMIT'}
                  </button>
                  <button
                    onClick={() => handleRejectParticipant(wp.participantId)}
                    className="bg-red-900/50 px-1.5 py-0.5 text-[10px] text-red-400 hover:bg-red-900/70"
                  >
                    REJECT
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Activity bar with expandable panels */}
        <LeftSidebar
          displayName={displayName}
          localStream={localStream}
          isMuted={isMuted}
          localIsSpeaking={localIsSpeaking}
          remoteParticipants={remoteParticipants}
          isHost={!!isHost}
          kickingParticipant={kickingParticipant}
          onKickParticipant={handleKickParticipant}
          onRegisterAudio={registerAudioElement}
          onAirChannelIds={onAirChannelIds}
        />

        {/* Center Content */}
        <div className="flex flex-1 flex-col overflow-hidden bg-black">
          {/* Return Video Player (for contributors to see program output) */}
          {room.returnFeedUrl && (
            <div className="flex-shrink-0 border-b border-gray-800">
              <ReturnVideoPlayer
                hlsUrl={room.returnFeedUrl}
                isOnAir={onAirChannelIds.includes('local')}
                showSyncIndicator
                minimized={returnFeedMinimized}
                onToggleMinimize={() => setReturnFeedMinimized(!returnFeedMinimized)}
              />
            </div>
          )}

          {/* File Player (when a file source is selected) */}
          {selectedFileSource && selectedFileSource.type === 'FILE' && roomId && (
            <div className="flex-shrink-0 border-b border-gray-800 px-3 py-2">
              <FilePlayer
                source={selectedFileSource}
                roomId={roomId}
                isHost={!!isHost}
                onUpdate={handleSourceUpdate}
              />
            </div>
          )}

          {/* Embedded Pro Mixer */}
          <div className="flex-1 overflow-hidden">
            <ProMixer
              embedded
              channels={[
                // Local channel
                {
                  id: 'local',
                  label: displayName,
                  stream: localStream || undefined,
                  isLocal: true,
                  color: '#3b82f6',
                },
                // Remote participants
                ...remoteParticipants.map(p => ({
                  id: p.participantId,
                  label: p.displayName,
                  stream: p.stream,
                  color: '#6366f1',
                })),
                // Audio sources (HTTP streams, files)
                ...audioSources
                  .filter(s => s.isActive)
                  .map(s => ({
                    id: `source-${s.id}`,
                    label: s.name,
                    stream: getSourceStream(s.id) || undefined,
                    color: s.type === 'HTTP_STREAM' ? '#22c55e' : '#f59e0b',
                  })),
              ]}
              onOnAirChange={setOnAirChannelIds}
              onControlsReady={handleMixerControlsReady}
              onAudioEngineReady={handleAudioEngineReady}
            />
          </div>
        </div>

        {/* Unified Sidebar - VS Code style activity bar with expandable panels */}
        {roomId && (
          <UnifiedSidebar
            roomId={roomId}
            roomName={room.name}
            isHost={!!isHost}
            currentUserId={user?.id || 'guest'}
            currentUserName={displayName}
            participantId={participantId}
            participants={remoteParticipants.map(p => ({
              participantId: p.participantId,
              displayName: p.displayName,
            }))}
            // Sources panel props (host only)
            sources={audioSources}
            playbackState={audioPlaybackState}
            onStartSource={startSource}
            onStopSource={stopSource}
            onAddSource={() => setShowAddSource(true)}
            sourcesRefreshKey={sourcesRefreshKey}
            // Outputs panel props (host only)
            onAddOutput={() => setShowAddOutput(true)}
            outputsRefreshKey={outputsRefreshKey}
            // Audio Routing Matrix props (host only)
            routingSources={routingSources}
            routing={routingState}
            routingOutputs={routingOutputs}
            onRoutingChange={handleRoutingChange}
            onAuxLevelChange={handleAuxLevelChange}
            onOutputBusChange={handleOutputBusChange}
          />
        )}
      </div>

      {/* Professional Audio Controls */}
      <ProfessionalAudioControls
        isConnected={isConnected}
        isMuted={isMuted}
        onToggleMute={toggleMute}
        onLeave={handleLeave}
        audioInputDevices={audioDevices.map(d => ({ deviceId: d.deviceId, label: d.label, kind: 'audioinput' as MediaDeviceKind }))}
        selectedInputDevice={selectedAudioDevice}
        onSelectInputDevice={selectAudioDevice}
        audioOutputDevices={audioOutputDevices.map(d => ({ deviceId: d.deviceId, label: d.label, kind: 'audiooutput' as MediaDeviceKind }))}
        selectedProgramOutput={selectedAudioOutput}
        onSelectProgramOutput={selectAudioOutput}
        selectedTalkbackOutput={selectedTalkbackOutput}
        onSelectTalkbackOutput={selectTalkbackOutput}
        localStream={localStream}
        isHost={!!isHost}
        roomName={room?.name}
      />

      {/* Room Settings Modal */}
      {room && (
        <RoomSettingsModal
          room={room}
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          onUpdate={setRoom}
        />
      )}

      {/* Enterprise Contribution Suite Modals */}
      {roomId && (
        <>
          <AddSourceModal
            isOpen={showAddSource}
            roomId={roomId}
            onClose={() => setShowAddSource(false)}
            onSourceAdded={handleSourceAdded}
          />
          <AddOutputModal
            isOpen={showAddOutput}
            roomId={roomId}
            onClose={() => setShowAddOutput(false)}
            onOutputAdded={handleOutputAdded}
          />
          <TemplateManager
            isOpen={showTemplateManager}
            onClose={() => setShowTemplateManager(false)}
            onApplyTemplate={(template) => {
              console.log('Applying template:', template.name)
              // Template application would configure mixer settings
              // Reload sources and outputs after template is applied
              reloadSources()
              setSourcesRefreshKey(prev => prev + 1)
              setOutputsRefreshKey(prev => prev + 1)
            }}
            onSaveCurrentAsTemplate={() => {
              // Would capture current mixer state and return as template
              console.log('Save current as template')
              return null
            }}
          />
        </>
      )}

      {/* Keyboard Shortcuts Overlay */}
      {showShortcutsOverlay && (
        <ShortcutsOverlay
          shortcuts={shortcuts}
          onClose={() => setShowShortcutsOverlay(false)}
        />
      )}

      {/* Talkback indicator (when push-to-talk is active) */}
      {isTalkbackHeld && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 transform">
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-900/90 px-4 py-2 shadow-lg animate-pulse">
            <div className="h-3 w-3 rounded-full bg-amber-400" />
            <span className="font-mono text-sm font-bold text-amber-200">TALKBACK ACTIVE</span>
          </div>
        </div>
      )}

      {/* Remote Control Indicator (for contributors when being remotely controlled by producer) */}
      {!isHost && isConnected && (
        <RemoteControlIndicator
          changes={remoteControl.recentChanges}
          isRemotelyControlled={remoteControl.isRemotelyControlled}
          onDismiss={remoteControl.clearRecentChange}
          position="top-right"
        />
      )}

    </div>
  )
}

function ConnectionStatusDot({ isConnected, isConnecting, isReconnecting }: { isConnected: boolean; isConnecting: boolean; isReconnecting: boolean }) {
  if (isReconnecting) {
    return <div className="h-3 w-3 animate-pulse rounded-full bg-orange-500" />
  }
  if (isConnecting) {
    return <div className="h-3 w-3 animate-pulse rounded-full bg-yellow-500" />
  }
  if (isConnected) {
    return <div className="h-3 w-3 rounded-full bg-green-500" />
  }
  return <div className="h-3 w-3 rounded-full bg-gray-500" />
}

function ConnectionQualityBadge({ quality }: { quality: string }) {
  const config = {
    excellent: { color: 'text-green-400', bars: 4, label: 'Excellent' },
    good: { color: 'text-green-400', bars: 3, label: 'Good' },
    fair: { color: 'text-yellow-400', bars: 2, label: 'Fair' },
    poor: { color: 'text-red-400', bars: 1, label: 'Poor' },
    unknown: { color: 'text-gray-500', bars: 0, label: 'Unknown' },
  }[quality] || { color: 'text-gray-500', bars: 0, label: 'Unknown' }

  return (
    <span className={`flex items-center gap-1 ${config.color}`} title={`Connection: ${config.label}`}>
      {/* Signal bars */}
      <svg className="h-3 w-4" viewBox="0 0 16 12" fill="currentColor">
        <rect x="0" y="9" width="3" height="3" opacity={config.bars >= 1 ? 1 : 0.3} />
        <rect x="4" y="6" width="3" height="6" opacity={config.bars >= 2 ? 1 : 0.3} />
        <rect x="8" y="3" width="3" height="9" opacity={config.bars >= 3 ? 1 : 0.3} />
        <rect x="12" y="0" width="3" height="12" opacity={config.bars >= 4 ? 1 : 0.3} />
      </svg>
      <span className="hidden sm:inline">{config.label}</span>
    </span>
  )
}
