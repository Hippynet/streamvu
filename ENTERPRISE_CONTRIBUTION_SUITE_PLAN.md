# Enterprise Remote Contribution Suite - Implementation Plan

## Overview

Transform StreamVU into a world-class remote contribution platform for professional broadcast workflows. This plan covers HTTP audio ingest, file playback, and Icecast output capabilities.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           StreamVU Contribution Suite                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │   WebRTC    │    │    HTTP     │    │    File     │    │   Virtual   │  │
│  │ Participants│    │   Streams   │    │  Playback   │    │   Sources   │  │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘  │
│         │                  │                  │                  │         │
│         ▼                  ▼                  ▼                  ▼         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      mediasoup SFU Router                           │   │
│  │                                                                     │   │
│  │   Producers ──────────────────────────────────────────► Consumers   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                    ┌───────────────┼───────────────┐                       │
│                    ▼               ▼               ▼                       │
│             ┌──────────┐    ┌──────────┐    ┌──────────┐                   │
│             │  PGM Bus │    │  TB Bus  │    │ Monitor  │                   │
│             │  (Mix)   │    │  (Mix)   │    │  (Web)   │                   │
│             └────┬─────┘    └────┬─────┘    └──────────┘                   │
│                  │               │                                          │
│                  ▼               ▼                                          │
│             ┌──────────┐    ┌──────────┐                                   │
│             │ Icecast  │    │ Icecast  │                                   │
│             │ Output 1 │    │ Output 2 │                                   │
│             └──────────┘    └──────────┘                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Data Model Extensions

### New Prisma Models

```prisma
// Audio source that can be injected into a room
model AudioSource {
  id              String          @id @default(cuid())
  roomId          String
  room            CallRoom        @relation(fields: [roomId], references: [id], onDelete: Cascade)

  type            AudioSourceType
  name            String

  // For HTTP streams
  streamUrl       String?
  streamFormat    String?         // mp3, aac, opus, etc.

  // For file playback
  fileId          String?
  file            UploadedFile?   @relation(fields: [fileId], references: [id])

  // Routing
  channel         AudioChannel    @default(PROGRAM)
  volume          Float           @default(1.0)
  pan             Float           @default(0.0)  // -1.0 to 1.0
  muted           Boolean         @default(false)

  // Playback state (for files)
  playbackState   PlaybackState   @default(STOPPED)
  playbackPosition Float          @default(0)     // seconds
  loopEnabled     Boolean         @default(false)

  // Status
  isActive        Boolean         @default(false)
  errorMessage    String?

  // mediasoup references (not persisted, runtime only)
  // producerId, transportId tracked in memory

  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@index([roomId])
}

enum AudioSourceType {
  PARTICIPANT     // WebRTC participant (reference only)
  HTTP_STREAM     // Icecast/Shoutcast/HTTP audio stream
  FILE            // Uploaded audio file
  TONE            // Test tone generator
  SILENCE         // Silence (for placeholders)
}

enum AudioChannel {
  PROGRAM         // Main output bus
  TALKBACK        // Off-air communications
  BOTH            // Routed to both buses
}

enum PlaybackState {
  STOPPED
  PLAYING
  PAUSED
  LOADING
  ERROR
}

// Icecast/streaming output configuration
model AudioOutput {
  id              String          @id @default(cuid())
  roomId          String
  room            CallRoom        @relation(fields: [roomId], references: [id], onDelete: Cascade)

  name            String          // "Main Stream", "Talkback Feed", etc.
  type            AudioOutputType
  channel         AudioChannel    // Which bus to output

  // Icecast configuration
  icecastHost     String?
  icecastPort     Int?
  icecastMount    String?         // e.g., "/live"
  icecastUsername String?         // Usually "source"
  icecastPassword String?         // Encrypted in DB
  icecastPublic   Boolean         @default(false)
  icecastName     String?         // Stream name
  icecastDescription String?
  icecastGenre    String?
  icecastUrl      String?         // Website URL

  // Encoding configuration
  codec           String          @default("mp3")  // mp3, opus, aac
  bitrate         Int             @default(128)    // kbps
  sampleRate      Int             @default(44100)  // Hz
  channels        Int             @default(2)      // 1=mono, 2=stereo

  // Status
  isEnabled       Boolean         @default(true)   // Can be toggled
  isActive        Boolean         @default(false)  // Currently streaming
  isConnected     Boolean         @default(false)  // Connected to Icecast
  errorMessage    String?

  // Statistics
  bytesStreamed   BigInt          @default(0)
  connectedAt     DateTime?

  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@index([roomId])
}

enum AudioOutputType {
  ICECAST         // Icecast/Shoutcast
  SRT             // SRT protocol (future)
  FILE            // Record to file (future)
}

// Uploaded audio files
model UploadedFile {
  id              String          @id @default(cuid())
  organizationId  String
  organization    Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  filename        String          // Original filename
  storagePath     String          // Path on disk or S3
  mimeType        String          // audio/mpeg, audio/wav, etc.
  size            Int             // Bytes
  duration        Float?          // Seconds (computed after upload)

  // Metadata (extracted from file)
  title           String?
  artist          String?
  album           String?

  uploadedById    String
  uploadedBy      User            @relation(fields: [uploadedById], references: [id])

  createdAt       DateTime        @default(now())

  audioSources    AudioSource[]

  @@index([organizationId])
}
```

### CallRoom Model Updates

```prisma
model CallRoom {
  // ... existing fields ...

  // New relations
  audioSources    AudioSource[]
  audioOutputs    AudioOutput[]

  // Enterprise features
  recordingEnabled Boolean        @default(false)
  recordingPath    String?
}
```

---

## 2. Backend Services

### 2.1 AudioIngestService

Manages HTTP stream ingestion using ffmpeg and mediasoup PlainTransport.

```typescript
// packages/api/src/services/audioIngest.service.ts

interface IngestProcess {
  sourceId: string
  roomId: string
  ffmpegProcess: ChildProcess
  transport: PlainTransport
  producer: Producer
  stats: {
    bytesReceived: number
    packetsLost: number
    startedAt: Date
  }
}

class AudioIngestService {
  private activeIngests: Map<string, IngestProcess> = new Map()

  async startIngest(
    roomId: string,
    sourceId: string,
    url: string,
    options?: { format?: string }
  ): Promise<void>

  async stopIngest(sourceId: string): Promise<void>

  async getIngestStats(sourceId: string): Promise<IngestStats>

  // Internal: Create PlainTransport for RTP reception
  private async createIngestTransport(router: Router): Promise<PlainTransport>

  // Internal: Spawn ffmpeg process
  private spawnFfmpeg(url: string, rtpPort: number, rtcpPort: number): ChildProcess
}
```

**ffmpeg command for HTTP ingest:**
```bash
ffmpeg -reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5 \
  -i "${streamUrl}" \
  -vn \
  -acodec libopus -ar 48000 -ac 2 -b:a 128k \
  -f rtp "rtp://127.0.0.1:${rtpPort}?rtcpport=${rtcpPort}"
```

### 2.2 FilePlaybackService

Manages audio file playback into rooms.

```typescript
// packages/api/src/services/filePlayback.service.ts

interface PlaybackProcess {
  sourceId: string
  roomId: string
  fileId: string
  ffmpegProcess: ChildProcess
  transport: PlainTransport
  producer: Producer
  state: PlaybackState
  position: number      // Current position in seconds
  duration: number      // Total duration
  loopEnabled: boolean
}

class FilePlaybackService {
  private activePlaybacks: Map<string, PlaybackProcess> = new Map()

  async play(roomId: string, sourceId: string, fileId: string): Promise<void>
  async pause(sourceId: string): Promise<void>
  async resume(sourceId: string): Promise<void>
  async stop(sourceId: string): Promise<void>
  async seek(sourceId: string, position: number): Promise<void>
  async setLoop(sourceId: string, enabled: boolean): Promise<void>

  async getPlaybackState(sourceId: string): Promise<PlaybackState>
}
```

**ffmpeg command for file playback:**
```bash
ffmpeg -re -ss ${seekPosition} -i "${filePath}" \
  -vn \
  -acodec libopus -ar 48000 -ac 2 -b:a 128k \
  -f rtp "rtp://127.0.0.1:${rtpPort}?rtcpport=${rtcpPort}"
```

### 2.3 AudioOutputService

Manages Icecast streaming outputs.

```typescript
// packages/api/src/services/audioOutput.service.ts

interface OutputProcess {
  outputId: string
  roomId: string
  channel: AudioChannel
  ffmpegProcess: ChildProcess
  consumers: Map<string, Consumer>  // producerId -> Consumer
  plainTransports: Map<string, PlainTransport>
  stats: {
    bytesSent: number
    startedAt: Date
    listeners?: number  // If Icecast provides this
  }
}

class AudioOutputService {
  private activeOutputs: Map<string, OutputProcess> = new Map()

  async startOutput(roomId: string, outputId: string): Promise<void>
  async stopOutput(outputId: string): Promise<void>

  // Called when producers are added/removed from room
  async updateOutputSources(roomId: string, channel: AudioChannel): Promise<void>

  // Get Icecast connection status
  async getOutputStatus(outputId: string): Promise<OutputStatus>

  // Internal: Create consumers for all sources on a channel
  private async createConsumersForChannel(
    roomId: string,
    channel: AudioChannel
  ): Promise<Consumer[]>

  // Internal: Build ffmpeg mixing command
  private buildMixerCommand(
    inputs: RtpInput[],
    output: IcecastConfig
  ): string[]
}
```

**ffmpeg command for Icecast output (mixing multiple sources):**
```bash
ffmpeg \
  -protocol_whitelist file,rtp,udp \
  -i "rtp://127.0.0.1:${port1}?rtcpport=${rtcpPort1}" \
  -i "rtp://127.0.0.1:${port2}?rtcpport=${rtcpPort2}" \
  -i "rtp://127.0.0.1:${port3}?rtcpport=${rtcpPort3}" \
  -filter_complex "
    [0:a]volume=${vol1}[a0];
    [1:a]volume=${vol2}[a1];
    [2:a]volume=${vol3}[a2];
    [a0][a1][a2]amix=inputs=3:duration=longest:dropout_transition=0[out]
  " \
  -map "[out]" \
  -acodec libmp3lame -ar 44100 -ac 2 -b:a ${bitrate}k \
  -content_type "audio/mpeg" \
  -ice_name "${streamName}" \
  -ice_description "${description}" \
  -ice_genre "${genre}" \
  -ice_url "${websiteUrl}" \
  -ice_public ${isPublic ? 1 : 0} \
  -f mp3 "icecast://${username}:${password}@${host}:${port}${mount}"
```

### 2.4 mediasoup PlainTransport Utilities

```typescript
// packages/api/src/utils/plainTransport.ts

interface PlainTransportPair {
  transport: PlainTransport
  rtpPort: number
  rtcpPort: number
}

async function createRtpTransport(router: Router): Promise<PlainTransportPair> {
  const transport = await router.createPlainTransport({
    listenIp: { ip: '127.0.0.1', announcedIp: undefined },
    rtcpMux: false,
    comedia: true,  // Auto-detect remote RTP/RTCP ports
  })

  return {
    transport,
    rtpPort: transport.tuple.localPort,
    rtcpPort: transport.rtcpTuple?.localPort || transport.tuple.localPort + 1,
  }
}

async function createRtpProducer(
  transport: PlainTransport,
  kind: 'audio' | 'video' = 'audio'
): Promise<Producer> {
  return transport.produce({
    kind,
    rtpParameters: {
      codecs: [{
        mimeType: 'audio/opus',
        payloadType: 100,
        clockRate: 48000,
        channels: 2,
        parameters: {
          minptime: 10,
          useinbandfec: 1,
        },
      }],
      encodings: [{ ssrc: generateSsrc() }],
    },
  })
}

async function createRtpConsumer(
  transport: PlainTransport,
  producer: Producer,
  router: Router
): Promise<Consumer> {
  return transport.consume({
    producerId: producer.id,
    rtpCapabilities: router.rtpCapabilities,
  })
}
```

---

## 3. API Endpoints

### Audio Sources

```
GET    /api/rooms/:roomId/sources              - List all audio sources
POST   /api/rooms/:roomId/sources              - Create audio source
GET    /api/rooms/:roomId/sources/:id          - Get source details
PUT    /api/rooms/:roomId/sources/:id          - Update source
DELETE /api/rooms/:roomId/sources/:id          - Delete source

POST   /api/rooms/:roomId/sources/:id/start    - Start source (HTTP/file)
POST   /api/rooms/:roomId/sources/:id/stop     - Stop source
POST   /api/rooms/:roomId/sources/:id/play     - Play (files)
POST   /api/rooms/:roomId/sources/:id/pause    - Pause (files)
POST   /api/rooms/:roomId/sources/:id/seek     - Seek (files)
```

### Audio Outputs

```
GET    /api/rooms/:roomId/outputs              - List all outputs
POST   /api/rooms/:roomId/outputs              - Create output
GET    /api/rooms/:roomId/outputs/:id          - Get output details
PUT    /api/rooms/:roomId/outputs/:id          - Update output config
DELETE /api/rooms/:roomId/outputs/:id          - Delete output

POST   /api/rooms/:roomId/outputs/:id/start    - Start streaming
POST   /api/rooms/:roomId/outputs/:id/stop     - Stop streaming
GET    /api/rooms/:roomId/outputs/:id/stats    - Get streaming stats
```

### File Management

```
GET    /api/organizations/:orgId/files         - List uploaded files
POST   /api/organizations/:orgId/files         - Upload file
GET    /api/files/:id                          - Get file details
DELETE /api/files/:id                          - Delete file
GET    /api/files/:id/download                 - Download file
GET    /api/files/:id/waveform                 - Get waveform data
```

---

## 4. Socket.io Events

### Source Events

```typescript
// Client → Server
'source:create'     -> { roomId, type, name, url?, fileId?, channel }
'source:update'     -> { sourceId, volume?, pan?, muted?, channel? }
'source:delete'     -> { sourceId }
'source:start'      -> { sourceId }
'source:stop'       -> { sourceId }
'source:play'       -> { sourceId }
'source:pause'      -> { sourceId }
'source:seek'       -> { sourceId, position }
'source:loop'       -> { sourceId, enabled }

// Server → Client
'source:created'    -> { source }
'source:updated'    -> { source }
'source:deleted'    -> { sourceId }
'source:state'      -> { sourceId, state, position?, error? }
'source:levels'     -> { sourceId, level }  // VU meter data
```

### Output Events

```typescript
// Client → Server
'output:create'     -> { roomId, name, channel, icecast: {...} }
'output:update'     -> { outputId, ...config }
'output:delete'     -> { outputId }
'output:start'      -> { outputId }
'output:stop'       -> { outputId }

// Server → Client
'output:created'    -> { output }
'output:updated'    -> { output }
'output:deleted'    -> { outputId }
'output:status'     -> { outputId, isConnected, error?, stats? }
```

---

## 5. Frontend Components

### 5.1 Updated Room Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [Room Name]  🟢 LIVE | Connected | Good Quality | 5 sources    [⚙] [End]  │
├─────────┬───────────────────────────────────────────────────────────────────┤
│         │                                                                   │
│ SOURCES │                         MIXER                                     │
│         │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐       │
│ 🎤 You  │  │█████│ │█████│ │█████│ │█████│ │█████│ │█████│ │ PGM │       │
│ 🎤 Guest│  │█████│ │█████│ │█████│ │█████│ │█████│ │█████│ │█████│       │
│ 🌐 HTTP │  │  ▓  │ │  ▓  │ │  ▓  │ │  ▓  │ │  ▓  │ │  ▓  │ │█████│       │
│ 📁 File │  │  ▓  │ │  ▓  │ │  ▓  │ │  ▓  │ │  ▓  │ │  ▓  │ │     │       │
│         │  │ 75% │ │100% │ │100% │ │ 50% │ │100% │ │100% │ │-6dB │       │
│ [+ Add] │  │ M S │ │ M S │ │ M S │ │ M S │ │ M S │ │ M S │ │     │       │
│         │  │ PGM │ │ PGM │ │ TB  │ │ PGM │ │BOTH │ │ PGM │ │     │       │
├─────────┤  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘       │
│         │                                                                   │
│ OUTPUTS │  ┌─────────────────────────────────────────────────────────────┐ │
│         │  │ FILE PLAYER                                                 │ │
│ 🟢 PGM  │  │ ▶ jingle_intro.mp3                      00:15 / 00:45 🔁   │ │
│   →Ice1 │  │ ▁▂▃▅▆▇█▇▆▅▃▂▁▂▃▅▆▇█▇▆▅▃▂▁▂▃▅▆▇█▇▆▅▃▂▁ ●────────────────── │ │
│         │  │ [⏮] [⏪] [▶/⏸] [⏩] [⏭]  [📂 Load] [📋 Queue]              │ │
│ 🔴 TB   │  └─────────────────────────────────────────────────────────────┘ │
│   →Ice2 │                                                                   │
│         ├───────────────────────────────────────────────────────────────────┤
│ [+ Add] │ [🎤 Mute] [🔊 PGM Out ▼] [📢 TB Out ▼]              [🚪 Leave] │
└─────────┴───────────────────────────────────────────────────────────────────┘
```

### 5.2 Component Structure

```
packages/web/src/
├── components/
│   └── callCenter/
│       ├── SourcesPanel.tsx          # Left sidebar with source list
│       │   ├── SourceItem.tsx        # Individual source row
│       │   ├── AddSourceModal.tsx    # Modal to add HTTP/file source
│       │   └── HttpSourceConfig.tsx  # HTTP URL input form
│       │
│       ├── OutputsPanel.tsx          # Output configurations
│       │   ├── OutputItem.tsx        # Individual output row
│       │   ├── AddOutputModal.tsx    # Modal to add Icecast output
│       │   └── IcecastConfig.tsx     # Icecast configuration form
│       │
│       ├── MixerPanel.tsx            # Main mixer area
│       │   ├── MixerChannel.tsx      # Individual channel strip
│       │   ├── MasterBus.tsx         # PGM/TB master faders
│       │   └── VuMeter.tsx           # Vertical VU meter component
│       │
│       ├── FilePlayer.tsx            # File playback controls
│       │   ├── Waveform.tsx          # Waveform visualization
│       │   ├── TransportControls.tsx # Play/pause/seek buttons
│       │   └── PlaylistQueue.tsx     # File queue management
│       │
│       └── Room.tsx                  # Main room page (updated)
│
├── hooks/
│   ├── useAudioSources.ts            # Source management
│   ├── useAudioOutputs.ts            # Output management
│   └── useFilePlayer.ts              # File playback control
│
└── services/
    └── fileUpload.ts                 # File upload utilities
```

### 5.3 Key Component: AddSourceModal

```tsx
function AddSourceModal({ isOpen, onClose, onAdd }: Props) {
  const [sourceType, setSourceType] = useState<'http' | 'file'>('http')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [channel, setChannel] = useState<'program' | 'talkback'>('program')

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h2>Add Audio Source</h2>

      <Tabs value={sourceType} onChange={setSourceType}>
        <Tab value="http">HTTP Stream</Tab>
        <Tab value="file">Audio File</Tab>
      </Tabs>

      {sourceType === 'http' && (
        <>
          <Input label="Name" value={name} onChange={setName} />
          <Input label="Stream URL" value={url} onChange={setUrl}
                 placeholder="https://stream.example.com/live" />
          <p className="text-sm text-gray-500">
            Supports Icecast, Shoutcast, and direct HTTP audio streams
          </p>
        </>
      )}

      {sourceType === 'file' && (
        <>
          <Input label="Name" value={name} onChange={setName} />
          <FileSelector value={selectedFile} onChange={setSelectedFile} />
          <FileUploader onUpload={(fileId) => setSelectedFile(fileId)} />
        </>
      )}

      <Select label="Output Channel" value={channel} onChange={setChannel}>
        <Option value="program">Program (PGM)</Option>
        <Option value="talkback">Talkback (TB)</Option>
        <Option value="both">Both</Option>
      </Select>

      <Button onClick={handleAdd}>Add Source</Button>
    </Modal>
  )
}
```

### 5.4 Key Component: IcecastConfig

```tsx
function IcecastConfig({ output, onChange }: Props) {
  return (
    <div className="space-y-4">
      <h3>Icecast Server Configuration</h3>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Host"
          value={output.icecastHost}
          onChange={(v) => onChange({ icecastHost: v })}
          placeholder="icecast.example.com"
        />
        <Input
          label="Port"
          type="number"
          value={output.icecastPort}
          onChange={(v) => onChange({ icecastPort: parseInt(v) })}
          placeholder="8000"
        />
      </div>

      <Input
        label="Mount Point"
        value={output.icecastMount}
        onChange={(v) => onChange({ icecastMount: v })}
        placeholder="/live"
      />

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Username"
          value={output.icecastUsername}
          onChange={(v) => onChange({ icecastUsername: v })}
          placeholder="source"
        />
        <Input
          label="Password"
          type="password"
          value={output.icecastPassword}
          onChange={(v) => onChange({ icecastPassword: v })}
        />
      </div>

      <h4>Encoding</h4>

      <div className="grid grid-cols-3 gap-4">
        <Select
          label="Codec"
          value={output.codec}
          onChange={(v) => onChange({ codec: v })}
        >
          <Option value="mp3">MP3</Option>
          <Option value="opus">Opus</Option>
          <Option value="aac">AAC</Option>
        </Select>

        <Select
          label="Bitrate"
          value={output.bitrate}
          onChange={(v) => onChange({ bitrate: parseInt(v) })}
        >
          <Option value="64">64 kbps</Option>
          <Option value="96">96 kbps</Option>
          <Option value="128">128 kbps</Option>
          <Option value="192">192 kbps</Option>
          <Option value="256">256 kbps</Option>
          <Option value="320">320 kbps</Option>
        </Select>

        <Select
          label="Channels"
          value={output.channels}
          onChange={(v) => onChange({ channels: parseInt(v) })}
        >
          <Option value="1">Mono</Option>
          <Option value="2">Stereo</Option>
        </Select>
      </div>

      <h4>Stream Metadata</h4>

      <Input
        label="Stream Name"
        value={output.icecastName}
        onChange={(v) => onChange({ icecastName: v })}
      />
      <Input
        label="Description"
        value={output.icecastDescription}
        onChange={(v) => onChange({ icecastDescription: v })}
      />
      <Input
        label="Genre"
        value={output.icecastGenre}
        onChange={(v) => onChange({ icecastGenre: v })}
      />
      <Checkbox
        label="Public Stream"
        checked={output.icecastPublic}
        onChange={(v) => onChange({ icecastPublic: v })}
      />
    </div>
  )
}
```

---

## 6. Implementation Phases

### Phase 1: Foundation (Week 1)

**Database & Models**
- [ ] Add AudioSource, AudioOutput, UploadedFile models to Prisma
- [ ] Create migration
- [ ] Update CallRoom relations

**File Upload Infrastructure**
- [ ] Create file upload endpoint with multer
- [ ] Implement file storage (local disk initially, S3 later)
- [ ] Extract audio metadata (duration, format) using ffprobe
- [ ] Generate waveform data for visualization

**Basic API Routes**
- [ ] CRUD routes for audio sources
- [ ] CRUD routes for audio outputs
- [ ] File management routes

### Phase 2: File Playback - Client Side (Week 2)

**Client-Side File Player**
- [ ] FilePlayer component with Web Audio API
- [ ] Waveform visualization component
- [ ] Transport controls (play, pause, seek, loop)
- [ ] Create Producer from AudioBufferSourceNode
- [ ] Integrate with existing mediasoup setup

**UI Integration**
- [ ] Add FilePlayer panel to Room
- [ ] File selection from uploaded library
- [ ] Quick file upload from Room

### Phase 3: HTTP Stream Ingest (Week 3)

**AudioIngestService**
- [ ] PlainTransport setup for RTP reception
- [ ] ffmpeg process management
- [ ] Stream health monitoring
- [ ] Reconnection logic

**Socket Events**
- [ ] source:start / source:stop events
- [ ] source:state updates
- [ ] VU meter data streaming

**UI**
- [ ] AddSourceModal with HTTP option
- [ ] Source status indicators
- [ ] Error handling and display

### Phase 4: Icecast Output (Week 4)

**AudioOutputService**
- [ ] Consumer creation for output buses
- [ ] ffmpeg mixing pipeline
- [ ] Icecast connection management
- [ ] Reconnection on failure

**UI**
- [ ] OutputsPanel component
- [ ] IcecastConfig form
- [ ] Output status indicators
- [ ] Start/stop controls

### Phase 5: Server-Side File Playback (Week 5)

**FilePlaybackService**
- [ ] Server-side ffmpeg playback
- [ ] Seek and loop support
- [ ] Position synchronization

**Playlist/Queue**
- [ ] PlaylistQueue component
- [ ] Drag-and-drop reordering
- [ ] Auto-advance

### Phase 6: Advanced Features (Week 6+)

**Mixing Enhancements**
- [ ] Per-channel EQ (high-pass, low-pass, parametric)
- [ ] Compressor/limiter on output buses
- [ ] Ducking (auto-lower music when voice detected)
- [ ] Output metering (PGM/TB bus levels)

**Enterprise Features**
- [ ] Room presets (save/load mixer states)
- [ ] Room templates
- [ ] Recording to file
- [ ] SRT output support

---

## 7. Security Considerations

### Credential Storage
- Icecast passwords encrypted at rest using AES-256
- Decrypted only in AudioOutputService memory
- Never sent to frontend

### URL Validation
- HTTP stream URLs validated against allowlist patterns
- Prevent SSRF attacks
- Rate limit stream creation

### File Upload Security
- File type validation (audio only)
- Size limits (configurable per org)
- Virus scanning (optional integration)
- Secure file storage paths

### Resource Limits
- Max concurrent streams per room
- Max file storage per organization
- Max output streams per room
- CPU/memory limits for ffmpeg processes

---

## 8. Environment Variables

```bash
# File Storage
FILE_STORAGE_PATH=/var/streamvu/files
FILE_MAX_SIZE_MB=100
FILE_ALLOWED_TYPES=audio/mpeg,audio/wav,audio/flac,audio/ogg,audio/aac

# ffmpeg
FFMPEG_PATH=/usr/bin/ffmpeg
FFPROBE_PATH=/usr/bin/ffprobe
FFMPEG_MAX_PROCESSES=10

# Icecast Defaults
ICECAST_DEFAULT_CODEC=mp3
ICECAST_DEFAULT_BITRATE=128
ICECAST_DEFAULT_SAMPLERATE=44100

# Security
ICECAST_PASSWORD_ENCRYPTION_KEY=<32-byte-hex-key>

# Limits
MAX_SOURCES_PER_ROOM=20
MAX_OUTPUTS_PER_ROOM=4
MAX_HTTP_STREAMS_PER_ROOM=5
```

---

## 9. Testing Strategy

### Unit Tests
- AudioIngestService process management
- FilePlaybackService state machine
- AudioOutputService mixing logic
- PlainTransport utilities

### Integration Tests
- Full source lifecycle (create → start → stop → delete)
- Output connection to test Icecast server
- File upload → playback flow

### E2E Tests
- Complete room workflow with multiple sources
- Icecast streaming verification
- Multi-participant scenarios

---

## 10. Monitoring & Observability

### Metrics
- Active ingests count
- Active outputs count
- ffmpeg process health
- Stream bitrates
- Buffer underruns
- Icecast connection status

### Logging
- Source start/stop events
- Output connection events
- ffmpeg stderr capture
- Error conditions

### Alerts
- Ingest failures
- Output disconnections
- High CPU usage
- Process crashes

---

## Summary

This plan provides a comprehensive foundation for transforming StreamVU into an enterprise-grade remote contribution platform. The modular architecture allows for incremental implementation while maintaining stability.

Key differentiators from competitors:
1. **Unified platform** - WebRTC participants, HTTP streams, and files in one mixer
2. **Dual bus architecture** - Separate PGM and TB outputs for professional workflows
3. **Web-based** - No software installation required for contributors
4. **Flexible outputs** - Icecast, SRT (future), recording (future)
5. **Modern UI** - Professional broadcast-style interface

Shall we proceed with Phase 1 implementation?
