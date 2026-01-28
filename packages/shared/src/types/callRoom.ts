import type { User } from './auth.js'

// =============================================================================
// CALL ROOM
// =============================================================================

export enum RoomVisibility {
  PRIVATE = 'PRIVATE', // Only org members can join
  PUBLIC = 'PUBLIC', // Anyone with invite link/code can join as guest
}

export enum RoomType {
  LIVE_ROOM = 'LIVE_ROOM', // On-air production room
  GREEN_ROOM = 'GREEN_ROOM', // Waiting area, can hear IFB only
  BREAKOUT = 'BREAKOUT', // Private conversation space
}

export enum ParticipantRole {
  HOST = 'HOST', // Room creator, full control
  MODERATOR = 'MODERATOR', // Can mute/kick others
  PARTICIPANT = 'PARTICIPANT', // Can speak and listen
  LISTENER = 'LISTENER', // Listen only
}

export enum ConnectionQuality {
  UNKNOWN = 'UNKNOWN',
  EXCELLENT = 'EXCELLENT',
  GOOD = 'GOOD',
  FAIR = 'FAIR',
  POOR = 'POOR',
}

export interface CallRoom {
  id: string
  name: string
  visibility: RoomVisibility
  accessCode: string | null
  inviteToken: string | null
  isActive: boolean
  maxParticipants: number
  /** Room type for green room/multi-room support */
  type: RoomType
  /** Parent room ID for room hierarchy */
  parentId: string | null
  /** Queue position for "next up" display */
  queuePosition: number
  organizationId: string
  createdById: string
  recordingEnabled: boolean
  waitingRoom: boolean
  /** HLS URL for program return feed (contributors see program output) */
  returnFeedUrl: string | null
  createdAt: string
  updatedAt: string
  closedAt: string | null
}

export interface CallRoomWithParticipants extends CallRoom {
  participants: RoomParticipant[]
  participantCount: number
}

export interface RoomParticipant {
  id: string
  roomId: string
  userId: string | null
  displayName: string
  role: ParticipantRole
  isConnected: boolean
  isSpeaking: boolean
  isMuted: boolean
  connectionQuality: ConnectionQuality
  isInWaitingRoom: boolean
  joinedAt: string
  leftAt: string | null
  user?: User
}

export interface ParticipantMixerSetting {
  id: string
  roomId: string
  ownerId: string
  targetId: string
  volume: number // 0.0 - 2.0
  muted: boolean
  pan: number // -1.0 to 1.0
  solo: boolean
}

// =============================================================================
// REQUESTS
// =============================================================================

export interface CreateRoomRequest {
  name: string
  visibility?: RoomVisibility
  accessCode?: string
  maxParticipants?: number
  recordingEnabled?: boolean
  waitingRoom?: boolean
  returnFeedUrl?: string
}

export interface UpdateRoomRequest {
  name?: string
  visibility?: RoomVisibility
  accessCode?: string
  maxParticipants?: number
  recordingEnabled?: boolean
  waitingRoom?: boolean
  isActive?: boolean
  returnFeedUrl?: string
}

export interface JoinRoomRequest {
  displayName: string
  accessCode?: string // Required for PUBLIC rooms with access code
}

export interface UpdateMixerRequest {
  targetId: string
  volume?: number
  muted?: boolean
  pan?: number
  solo?: boolean
}

// =============================================================================
// SOCKET EVENTS (for real-time communication)
// =============================================================================

export interface RoomJoinedEvent {
  room: CallRoomWithParticipants
  participant: RoomParticipant
  rtpCapabilities?: unknown // mediasoup RTP capabilities
}

export interface ParticipantJoinedEvent {
  participant: RoomParticipant
}

export interface ParticipantLeftEvent {
  participantId: string
  reason?: string
}

export interface ParticipantSpeakingEvent {
  participantId: string
  isSpeaking: boolean
}

export interface ConnectionQualityEvent {
  participantId: string
  quality: ConnectionQuality
}

export interface MixerUpdateEvent {
  ownerId: string
  targetId: string
  settings: Partial<ParticipantMixerSetting>
}

// =============================================================================
// ENTERPRISE CONTRIBUTION SUITE
// =============================================================================

export enum AudioSourceType {
  PARTICIPANT = 'PARTICIPANT', // WebRTC participant (reference only)
  HTTP_STREAM = 'HTTP_STREAM', // Icecast/Shoutcast/HTTP audio stream
  FILE = 'FILE', // Uploaded audio file
  TONE = 'TONE', // Test tone generator
  SILENCE = 'SILENCE', // Silence (for placeholders)
  SRT_STREAM = 'SRT_STREAM', // SRT input stream
  RIST_STREAM = 'RIST_STREAM', // RIST input stream
}

export enum AudioChannel {
  PROGRAM = 'PROGRAM', // Main output bus (PGM)
  TALKBACK = 'TALKBACK', // Off-air communications (TB)
  BOTH = 'BOTH', // Routed to both PGM and TB
  AUX1 = 'AUX1', // Auxiliary bus 1
  AUX2 = 'AUX2', // Auxiliary bus 2
  AUX3 = 'AUX3', // Auxiliary bus 3
  AUX4 = 'AUX4', // Auxiliary bus 4
}

export enum PlaybackState {
  STOPPED = 'STOPPED',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  LOADING = 'LOADING',
  ERROR = 'ERROR',
}

export enum AudioOutputType {
  ICECAST = 'ICECAST', // Icecast/Shoutcast
  SRT = 'SRT', // SRT protocol
  FILE_RECORDING = 'FILE_RECORDING', // Record to file (future)
}

export enum SRTMode {
  CALLER = 'CALLER', // Connect to a listener
  LISTENER = 'LISTENER', // Wait for incoming connection
  RENDEZVOUS = 'RENDEZVOUS', // Both ends initiate simultaneously
}

export enum SRTConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  LISTENING = 'LISTENING', // Listener mode: waiting for connection
  CONNECTING = 'CONNECTING', // Caller mode: establishing connection
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR',
}

// =============================================================================
// RIST PROTOCOL (Phase 3.1)
// =============================================================================

export enum RISTMode {
  CALLER = 'CALLER', // Connect to a listener
  LISTENER = 'LISTENER', // Wait for incoming connection
}

export enum RISTProfile {
  SIMPLE = 'SIMPLE', // Basic, widely compatible
  MAIN = 'MAIN', // Advanced features (FEC, etc.)
}

export enum RISTConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  LISTENING = 'LISTENING', // Listener mode: waiting for connection
  CONNECTING = 'CONNECTING', // Caller mode: establishing connection
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR',
}

export interface AudioSource {
  id: string
  roomId: string
  type: AudioSourceType
  name: string
  streamUrl: string | null
  streamFormat: string | null
  fileId: string | null
  channel: AudioChannel
  volume: number
  pan: number
  muted: boolean
  playbackState: PlaybackState
  playbackPosition: number
  loopEnabled: boolean
  isActive: boolean
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  file?: UploadedFile
  // SRT input configuration
  srtHost: string | null
  srtPort: number | null
  srtMode: SRTMode | null
  srtStreamId: string | null
  srtPassphrase: string | null
  srtLatency: number | null
  srtConnectionState: SRTConnectionState | null
  srtListenerPort: number | null // Allocated port for listener mode
  srtRemoteAddress: string | null // Who connected (listener mode)
  // RIST input configuration
  ristUrl: string | null // Full RIST URL (rist://host:port)
  ristMode: RISTMode | null
  ristProfile: RISTProfile | null
  ristBuffer: number | null // Buffer size in ms
  ristBandwidth: number | null // Max bandwidth in kbps
  ristConnectionState: RISTConnectionState | null
  ristListenerPort: number | null // Allocated port for listener mode
  ristRemoteAddress: string | null // Who connected (listener mode)
}

// Multi-bus routing configuration for audio outputs
export interface BusRoutingConfig {
  pgm?: number  // 0.0 - 1.0
  tb?: number
  aux1?: number
  aux2?: number
  aux3?: number
  aux4?: number
}

export interface AudioOutput {
  id: string
  roomId: string
  name: string
  type: AudioOutputType
  channel: AudioChannel // Primary bus (legacy)
  busRouting: BusRoutingConfig | null // Multi-bus routing (if set, overrides channel)
  // Icecast configuration
  icecastHost: string | null
  icecastPort: number | null
  icecastMount: string | null
  icecastUsername: string | null
  icecastPublic: boolean
  icecastName: string | null
  icecastDescription: string | null
  icecastGenre: string | null
  icecastUrl: string | null
  // SRT configuration
  srtHost: string | null
  srtPort: number | null
  srtMode: SRTMode | null
  srtStreamId: string | null
  srtLatency: number | null // ms
  srtMaxBw: number | null // bytes/sec
  // Encoding configuration
  codec: string
  bitrate: number
  sampleRate: number
  channels: number
  isEnabled: boolean
  isActive: boolean
  isConnected: boolean
  errorMessage: string | null
  bytesStreamed: string // BigInt serialized as string
  connectedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface UploadedFile {
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
  createdAt: string
}

// =============================================================================
// AUDIO SOURCE REQUESTS
// =============================================================================

export interface CreateAudioSourceRequest {
  type: AudioSourceType
  name: string
  streamUrl?: string
  streamFormat?: string
  fileId?: string
  channel?: AudioChannel
  volume?: number
  pan?: number
  // SRT input configuration
  srtHost?: string
  srtPort?: number
  srtMode?: SRTMode
  srtStreamId?: string
  srtPassphrase?: string
  srtLatency?: number
  // RIST input configuration
  ristUrl?: string
  ristMode?: RISTMode
  ristProfile?: RISTProfile
  ristBuffer?: number
  ristBandwidth?: number
}

export interface UpdateAudioSourceRequest {
  name?: string
  channel?: AudioChannel
  volume?: number
  pan?: number
  muted?: boolean
  loopEnabled?: boolean
}

// =============================================================================
// AUDIO OUTPUT REQUESTS
// =============================================================================

export interface CreateAudioOutputRequest {
  name: string
  type: AudioOutputType
  channel: AudioChannel
  // Icecast configuration
  icecastHost?: string
  icecastPort?: number
  icecastMount?: string
  icecastUsername?: string
  icecastPassword?: string
  icecastPublic?: boolean
  icecastName?: string
  icecastDescription?: string
  icecastGenre?: string
  icecastUrl?: string
  // SRT configuration
  srtHost?: string
  srtPort?: number
  srtMode?: SRTMode
  srtStreamId?: string
  srtPassphrase?: string
  srtLatency?: number
  srtMaxBw?: number
  // Encoding
  codec?: string
  bitrate?: number
  sampleRate?: number
  channels?: number
}

export interface UpdateAudioOutputRequest {
  name?: string
  channel?: AudioChannel
  // Icecast configuration
  icecastHost?: string
  icecastPort?: number
  icecastMount?: string
  icecastUsername?: string
  icecastPassword?: string
  icecastPublic?: boolean
  icecastName?: string
  icecastDescription?: string
  icecastGenre?: string
  icecastUrl?: string
  // SRT configuration
  srtHost?: string
  srtPort?: number
  srtMode?: SRTMode
  srtStreamId?: string
  srtPassphrase?: string
  srtLatency?: number
  srtMaxBw?: number
  // Encoding
  codec?: string
  bitrate?: number
  sampleRate?: number
  channels?: number
  isEnabled?: boolean
}

// =============================================================================
// AUDIO SOURCE SOCKET EVENTS
// =============================================================================

export interface AudioSourceCreatedEvent {
  source: AudioSource
}

export interface AudioSourceUpdatedEvent {
  source: AudioSource
}

export interface AudioSourceDeletedEvent {
  sourceId: string
}

export interface AudioSourceStateEvent {
  sourceId: string
  state: PlaybackState
  position?: number
  error?: string
}

export interface AudioSourceLevelEvent {
  sourceId: string
  level: number // 0.0 - 1.0
}

export interface SRTSourceConnectionEvent {
  sourceId: string
  connectionState: SRTConnectionState
  remoteAddress?: string
  listenerPort?: number
  error?: string
}

// =============================================================================
// AUDIO OUTPUT SOCKET EVENTS
// =============================================================================

export interface AudioOutputCreatedEvent {
  output: AudioOutput
}

export interface AudioOutputUpdatedEvent {
  output: AudioOutput
}

export interface AudioOutputDeletedEvent {
  outputId: string
}

export interface AudioOutputStatusEvent {
  outputId: string
  isConnected: boolean
  error?: string
  stats?: {
    bytesSent: number
    duration: number
  }
}

// =============================================================================
// CUE SYSTEM (Phase 1.5)
// =============================================================================

export enum CueType {
  OFF = 'OFF', // No cue / clear
  RED = 'RED', // Stop / Don't speak
  YELLOW = 'YELLOW', // Stand by / Get ready
  GREEN = 'GREEN', // Go / You're live
  CUSTOM = 'CUSTOM', // Custom text cue
}

export interface RoomCue {
  id: string
  roomId: string
  cueType: CueType
  cueText: string | null
  targetParticipantId: string | null
  sentById: string | null
  sentAt: string
}

export interface SendCueRequest {
  cueType: CueType
  cueText?: string
  targetParticipantId?: string // null = all participants
}

export interface CueReceivedEvent {
  cue: RoomCue
}

export interface CueClearedEvent {
  roomId: string
  targetParticipantId?: string
}

// =============================================================================
// RUNDOWN SYSTEM (Phase 1.4)
// =============================================================================

export enum RundownItemType {
  SEGMENT = 'SEGMENT',
  BREAK = 'BREAK',
  MUSIC = 'MUSIC',
  AD = 'AD',
  INTERVIEW = 'INTERVIEW',
  CALL = 'CALL',
  NOTE = 'NOTE',
}

export interface RundownItem {
  id: string
  rundownId: string
  order: number
  title: string
  durationSec: number | null
  notes: string | null
  hostNotes: string | null
  type: RundownItemType
  isCurrent: boolean
  isCompleted: boolean
  actualStartAt: string | null
  actualEndAt: string | null
}

export interface Rundown {
  id: string
  roomId: string
  name: string
  items: RundownItem[]
  createdAt: string
  updatedAt: string
}

export interface CreateRundownRequest {
  name: string
  items?: Array<{
    title: string
    durationSec?: number
    notes?: string
    hostNotes?: string
    type?: RundownItemType
  }>
}

export interface AddRundownItemRequest {
  title: string
  durationSec?: number
  notes?: string
  hostNotes?: string
  type?: RundownItemType
  order?: number // Insert at position, default = end
}

export interface UpdateRundownItemRequest {
  title?: string
  durationSec?: number
  notes?: string
  hostNotes?: string
  type?: RundownItemType
  order?: number
}

export interface RundownUpdatedEvent {
  rundown: Rundown
}

export interface RundownItemCurrentEvent {
  itemId: string
  previousItemId?: string
}

// =============================================================================
// RECORDING SYSTEM (Phase 1.1)
// =============================================================================

export enum RecordingType {
  INDIVIDUAL = 'INDIVIDUAL', // Single participant
  MIX = 'MIX', // Full room mix
}

export enum RecordingStatus {
  RECORDING = 'RECORDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface Recording {
  id: string
  roomId: string
  participantId: string | null
  participantName: string | null
  type: RecordingType
  format: string
  sampleRate: number
  bitDepth: number | null
  channels: number
  durationMs: number | null
  fileSize: string | null // BigInt serialized as string
  storagePath: string | null
  storageProvider: string
  status: RecordingStatus
  startedAt: string
  endedAt: string | null
}

export interface StartRecordingRequest {
  type: RecordingType
  participantId?: string // Required for INDIVIDUAL
  format?: string // wav, flac, mp3
  sampleRate?: number
  bitDepth?: number
  channels?: number
}

export interface RecordingStartedEvent {
  recording: Recording
}

export interface RecordingStoppedEvent {
  recording: Recording
}

export interface RecordingProgressEvent {
  recordingId: string
  durationMs: number
  fileSize: string
}

// =============================================================================
// CHAT SYSTEM (Phase 3.1)
// =============================================================================

export enum ChatMessageType {
  CHAT = 'CHAT', // Regular chat message
  PRODUCER_NOTE = 'PRODUCER_NOTE', // Producer-only note
  SYSTEM = 'SYSTEM', // System message
}

export interface ChatMessage {
  id: string
  roomId: string
  senderId: string
  senderName: string
  recipientId: string | null
  content: string
  type: ChatMessageType
  createdAt: string
}

export interface SendChatRequest {
  content: string
  recipientId?: string // null = room-wide
  type?: ChatMessageType
}

export interface ChatMessageEvent {
  message: ChatMessage
}

// =============================================================================
// TIMER SYSTEM (Phase 3.2)
// =============================================================================

export enum TimerType {
  COUNTDOWN = 'COUNTDOWN',
  STOPWATCH = 'STOPWATCH',
}

export interface RoomTimer {
  id: string
  roomId: string
  name: string
  type: TimerType
  durationMs: number | null
  startedAt: string | null
  pausedAt: string | null
  isRunning: boolean
  visibleToAll: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateTimerRequest {
  name?: string
  type: TimerType
  durationMs?: number // Required for countdown
  visibleToAll?: boolean
}

export interface UpdateTimerRequest {
  name?: string
  durationMs?: number
  visibleToAll?: boolean
}

export interface TimerCreatedEvent {
  timer: RoomTimer
}

export interface TimerUpdatedEvent {
  timer: RoomTimer
}

export interface TimerStartedEvent {
  timerId: string
  startedAt: string
}

export interface TimerPausedEvent {
  timerId: string
  pausedAt: string
  remainingMs: number
}

export interface TimerResetEvent {
  timerId: string
}

export interface TimerDeletedEvent {
  timerId: string
}

// =============================================================================
// IFB/TALKBACK SYSTEM (Phase 1.2)
// =============================================================================

export enum IFBTargetType {
  PARTICIPANT = 'PARTICIPANT', // Single participant
  GROUP = 'GROUP', // Talkback group
  ALL = 'ALL', // All participants
}

export interface TalkbackGroup {
  id: string
  roomId: string
  name: string
  color: string | null
  isDefault: boolean
  members: TalkbackGroupMember[]
  createdAt: string
  updatedAt: string
}

export interface TalkbackGroupMember {
  id: string
  groupId: string
  participantId: string
  participant?: RoomParticipant
  createdAt: string
}

export interface IFBSession {
  id: string
  roomId: string
  senderId: string
  sender?: RoomParticipant
  targetType: IFBTargetType
  targetParticipantId: string | null
  targetParticipant?: RoomParticipant | null
  targetGroupId: string | null
  targetGroup?: TalkbackGroup | null
  level: number // 0.0 - 1.0 for IFB audio level
  duckingLevel: number // 0.0 - 1.0 for ducking program audio
  isActive: boolean
  startedAt: string
  endedAt: string | null
}

// IFB Requests
export interface CreateTalkbackGroupRequest {
  name: string
  color?: string
  participantIds?: string[]
}

export interface UpdateTalkbackGroupRequest {
  name?: string
  color?: string
}

export interface AddGroupMemberRequest {
  participantId: string
}

export interface StartIFBRequest {
  targetType: IFBTargetType
  targetParticipantId?: string // Required if targetType = PARTICIPANT
  targetGroupId?: string // Required if targetType = GROUP
  level?: number
  duckingLevel?: number
}

export interface UpdateIFBRequest {
  level?: number
  duckingLevel?: number
}

// IFB Socket Events
export interface TalkbackGroupCreatedEvent {
  group: TalkbackGroup
}

export interface TalkbackGroupUpdatedEvent {
  group: TalkbackGroup
}

export interface TalkbackGroupDeletedEvent {
  groupId: string
}

export interface TalkbackGroupMemberAddedEvent {
  groupId: string
  member: TalkbackGroupMember
}

export interface TalkbackGroupMemberRemovedEvent {
  groupId: string
  participantId: string
}

export interface IFBStartedEvent {
  session: IFBSession
}

export interface IFBUpdatedEvent {
  sessionId: string
  level?: number
  duckingLevel?: number
}

export interface IFBEndedEvent {
  sessionId: string
}

// =============================================================================
// REMOTE CONTROL SYSTEM (Phase 2.5)
// =============================================================================

/**
 * Remote control allows producers to adjust contributor's audio settings
 * from the control room without requiring the contributor to make changes.
 */

export enum RemoteControlType {
  GAIN = 'GAIN', // Input gain adjustment
  MUTE = 'MUTE', // Mute/unmute
  EQ = 'EQ', // EQ settings
  COMPRESSOR = 'COMPRESSOR', // Compressor settings
  GATE = 'GATE', // Noise gate settings
}

export interface RemoteGainControl {
  participantId: string
  gain: number // 0.0 - 2.0 (1.0 = unity)
}

export interface RemoteMuteControl {
  participantId: string
  muted: boolean
}

export interface RemoteEQControl {
  participantId: string
  lowGain: number // dB (-12 to +12)
  midGain: number // dB (-12 to +12)
  highGain: number // dB (-12 to +12)
  lowFreq: number // Hz (20-500)
  midFreq: number // Hz (200-5000)
  highFreq: number // Hz (2000-20000)
}

export interface RemoteCompressorControl {
  participantId: string
  threshold: number // dB (-60 to 0)
  ratio: number // 1:1 to 20:1
  attack: number // ms (0.1 to 100)
  release: number // ms (10 to 1000)
  makeupGain: number // dB (0 to 24)
  enabled: boolean
}

export interface RemoteGateControl {
  participantId: string
  threshold: number // dB (-100 to 0)
  attack: number // ms (0.1 to 50)
  hold: number // ms (0 to 500)
  release: number // ms (10 to 1000)
  enabled: boolean
}

export interface RemoteControlState {
  participantId: string
  gain: number
  muted: boolean
  eq: {
    lowGain: number
    midGain: number
    highGain: number
    lowFreq: number
    midFreq: number
    highFreq: number
  }
  compressor: {
    threshold: number
    ratio: number
    attack: number
    release: number
    makeupGain: number
    enabled: boolean
  }
  gate: {
    threshold: number
    attack: number
    hold: number
    release: number
    enabled: boolean
  }
}

// Remote Control Requests
export interface SetRemoteGainRequest {
  participantId: string
  gain: number
}

export interface SetRemoteMuteRequest {
  participantId: string
  muted: boolean
}

export interface SetRemoteEQRequest {
  participantId: string
  lowGain?: number
  midGain?: number
  highGain?: number
  lowFreq?: number
  midFreq?: number
  highFreq?: number
}

export interface SetRemoteCompressorRequest {
  participantId: string
  threshold?: number
  ratio?: number
  attack?: number
  release?: number
  makeupGain?: number
  enabled?: boolean
}

export interface SetRemoteGateRequest {
  participantId: string
  threshold?: number
  attack?: number
  hold?: number
  release?: number
  enabled?: boolean
}

export interface ResetRemoteControlRequest {
  participantId: string
  controlType?: RemoteControlType // If not specified, reset all
}

// Remote Control Socket Events
export interface RemoteGainChangedEvent {
  participantId: string
  gain: number
  changedById: string
  changedByName: string
}

export interface RemoteMuteChangedEvent {
  participantId: string
  muted: boolean
  changedById: string
  changedByName: string
}

export interface RemoteEQChangedEvent {
  participantId: string
  eq: Partial<RemoteEQControl>
  changedById: string
  changedByName: string
}

export interface RemoteCompressorChangedEvent {
  participantId: string
  compressor: Partial<RemoteCompressorControl>
  changedById: string
  changedByName: string
}

export interface RemoteGateChangedEvent {
  participantId: string
  gate: Partial<RemoteGateControl>
  changedById: string
  changedByName: string
}

export interface RemoteControlResetEvent {
  participantId: string
  controlType?: RemoteControlType
  changedById: string
  changedByName: string
}

export interface RemoteControlStateEvent {
  state: RemoteControlState
}

// =============================================================================
// GREEN ROOM / MULTI-ROOM SYSTEM (Phase 2.2)
// =============================================================================

/**
 * Green room system for pre-show staging and participant management.
 * Supports multiple room types with hierarchy and seamless movement.
 */

export interface GreenRoomInfo {
  id: string
  name: string
  type: RoomType
  parentId: string | null
  participantCount: number
  queuePosition: number
  participants: GreenRoomParticipant[]
}

export interface GreenRoomParticipant {
  id: string
  displayName: string
  role: ParticipantRole
  isConnected: boolean
  isSpeaking: boolean
  queuePosition: number
  joinedAt: string
}

// Green Room Requests
export interface CreateGreenRoomRequest {
  name: string
  parentRoomId: string // The live room this green room belongs to
  type?: RoomType // Defaults to GREEN_ROOM
}

export interface MoveParticipantRequest {
  participantId: string
  targetRoomId: string
  queuePosition?: number // Position in "next up" queue
}

export interface UpdateQueueRequest {
  participantId: string
  queuePosition: number
}

export interface BulkMoveParticipantsRequest {
  participantIds: string[]
  targetRoomId: string
}

// Green Room Socket Events
export interface GreenRoomCreatedEvent {
  room: GreenRoomInfo
  parentRoomId: string
}

export interface GreenRoomDeletedEvent {
  roomId: string
  parentRoomId: string
}

export interface ParticipantMovedEvent {
  participantId: string
  participantName: string
  fromRoomId: string
  toRoomId: string
  toRoomType: RoomType
  queuePosition: number
}

export interface QueueUpdatedEvent {
  roomId: string
  queue: Array<{
    participantId: string
    participantName: string
    queuePosition: number
  }>
}

export interface ParticipantQueuePositionEvent {
  participantId: string
  participantName: string
  roomId: string
  queuePosition: number
}

export interface CountdownToLiveEvent {
  participantId: string
  participantName: string
  secondsRemaining: number
  targetRoomId: string
}

export interface GreenRoomListEvent {
  greenRooms: GreenRoomInfo[]
  liveRoomId: string
}

// =============================================================================
// WHIP/WHEP SUPPORT (Phase 2.3)
// =============================================================================

/**
 * WHIP (WebRTC HTTP Ingest Protocol) support for accepting
 * WebRTC streams from OBS 30+, vMix, and other WHIP clients.
 */

export enum WHIPStreamState {
  PENDING = 'PENDING', // Waiting for WHIP offer
  CONNECTING = 'CONNECTING', // Establishing WebRTC connection
  CONNECTED = 'CONNECTED', // Stream active
  DISCONNECTED = 'DISCONNECTED', // Stream ended
  ERROR = 'ERROR', // Connection error
}

export interface WHIPStream {
  id: string
  roomId: string
  name: string
  /** Bearer token for authentication */
  token: string
  /** Current connection state */
  state: WHIPStreamState
  /** Remote SDP offer (from WHIP client) */
  offer: string | null
  /** Local SDP answer (response) */
  answer: string | null
  /** ICE candidates */
  iceCandidates: string[]
  /** Client IP address */
  clientIp: string | null
  /** Client user agent */
  clientUserAgent: string | null
  /** When stream was created */
  createdAt: string
  /** When stream connected */
  connectedAt: string | null
  /** When stream disconnected */
  disconnectedAt: string | null
  /** Error message if state is ERROR */
  errorMessage: string | null
}

export interface WHIPEndpointInfo {
  /** URL for WHIP ingest */
  ingestUrl: string
  /** URL for WHEP playback */
  playbackUrl: string
  /** Bearer token for authentication */
  token: string
  /** Stream ID */
  streamId: string
}

// WHIP Requests
export interface CreateWHIPEndpointRequest {
  name: string
}

export interface WHIPOfferRequest {
  /** SDP offer from WHIP client */
  sdp: string
}

export interface WHIPCandidateRequest {
  /** ICE candidate from WHIP client */
  candidate: string
  /** SDP mid */
  sdpMid: string
  /** SDP m-line index */
  sdpMLineIndex: number
}

// WHIP Responses
export interface WHIPEndpointCreatedResponse {
  endpoint: WHIPEndpointInfo
  stream: WHIPStream
}

export interface WHIPAnswerResponse {
  /** SDP answer to return to WHIP client */
  sdp: string
  /** Resource URL for teardown */
  resourceUrl: string
}

// WHIP Socket Events
export interface WHIPStreamCreatedEvent {
  stream: WHIPStream
  roomId: string
}

export interface WHIPStreamStateChangedEvent {
  streamId: string
  roomId: string
  state: WHIPStreamState
  errorMessage?: string
}

export interface WHIPStreamDeletedEvent {
  streamId: string
  roomId: string
}
