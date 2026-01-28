# StreamVU - Enterprise Broadcast Contribution Suite

## Project Vision

StreamVU is an **enterprise-grade remote contribution platform** for professional broadcast workflows. It enables broadcasters to receive high-quality audio from remote contributors via WebRTC, mix multiple sources in a professional mixer interface, and output to Icecast streaming servers or other destinations.

### Target Users
- **Broadcast Engineers** - Managing remote contribution sessions
- **Radio Producers** - Running live shows with remote guests
- **Podcast Networks** - Multi-location recording sessions
- **Sports Broadcasters** - Commentary from multiple remote locations

### Key Differentiators
1. **Unified Platform** - WebRTC participants, HTTP streams, SRT/RIST inputs, and file playback in one mixer
2. **Dual Bus Architecture** - Separate PGM (Program) and TB (Talkback/IFB) outputs for professional workflows
3. **Web-Based** - No software installation required for contributors
4. **Flexible Outputs** - Icecast, SRT, recording, NDI bridge
5. **Professional UI** - Broadcast-style interface with VU meters, timecode, loudness metering

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        StreamVU Contribution Suite                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │   WebRTC    │    │  SRT/RIST   │    │    HTTP     │    │    File     │  │
│  │ Participants│    │   Inputs    │    │   Streams   │    │  Playback   │  │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘  │
│         │                  │                  │                  │         │
│         ▼                  ▼                  ▼                  ▼         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      mediasoup SFU Router                           │   │
│  │   Producers ──────────────────────────────────────────► Consumers   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                    ┌───────────────┼───────────────┐                       │
│                    ▼               ▼               ▼                       │
│             ┌──────────┐    ┌──────────┐    ┌──────────┐                   │
│             │  PGM Bus │    │  TB Bus  │    │ AUX Bus  │                   │
│             │  (Main)  │    │  (IFB)   │    │ (Cue/Mon)│                   │
│             └────┬─────┘    └────┬─────┘    └──────────┘                   │
│                  │               │                                          │
│         ┌────────┼────────┬──────┴──────┐                                  │
│         ▼        ▼        ▼             ▼                                  │
│    ┌────────┐┌────────┐┌────────┐ ┌──────────┐                             │
│    │Icecast ││  SRT   ││ Record ││NDI Bridge│                             │
│    │ Output ││ Output ││  File  ││ (Desktop)│                             │
│    └────────┘└────────┘└────────┘ └──────────┘                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, TailwindCSS, Zustand |
| Backend | Express, Socket.io, mediasoup (WebRTC SFU) |
| Database | PostgreSQL 16 with Prisma ORM |
| Media Processing | FFmpeg (encoding, mixing, protocol conversion) |
| Protocols | WebRTC, SRT, RIST, WHIP/WHEP, Icecast |
| Auth | JWT + Google OAuth |

---

## Feature Status

All features from the roadmap are **IMPLEMENTED**:

### Phase 1: Quick Wins
- [x] Virtual Tally Lights (on-air indicators)
- [x] Cue System (STANDBY/CUE/GO/CLEAR)
- [x] Keyboard Shortcuts (professional broadcast controls)
- [x] Ducking Presets (voice-activated gain reduction)
- [x] Enhanced Dark Mode (broadcast control room appropriate)

### Phase 2: Differentiators
- [x] Return Video Feed (HLS/WebRTC program return)
- [x] Green Room / Multi-Room (staging areas)
- [x] WHIP/WHEP Support (OBS 30+, vMix integration)
- [x] Session Templates (save/recall mixer configurations)
- [x] Redundant/Bonded Connections

### Phase 3: Professional Features
- [x] RIST Protocol Support
- [x] Full EBU R128 Loudness Compliance
- [x] Timecode Support (TOD, free-run, external sync)
- [x] Contributor Self-Service Portal (pre-flight checks)
- [x] Remote Gain Control

### Phase 4: Enterprise Features
- [x] Multi-Output / Multiviewer
- [x] API-Driven Automation (webhooks, REST API)
- [x] Cloud Recording & MAM Integration
- [x] Analytics Dashboard

### Phase 5: Hardware Bridge
- [x] NDI Bridge (companion app)
- [x] SRT/NDI Gateway

---

## Development Environment

### CRITICAL: Docker-Only Development

**Always use Docker for development. Never run the application locally.**

```bash
# Start full development stack
make dev

# Rebuild containers after dependency changes
make dev-rebuild

# Stop all containers
make dev-stop

# View logs
make dev-logs
```

### DO NOT USE

```bash
# These start processes outside Docker - NEVER use them
pnpm dev
pnpm run dev
npm run dev
```

### Service URLs (when running)

| Service | URL | Description |
|---------|-----|-------------|
| Web UI | http://localhost:3003 | React frontend |
| API | http://localhost:3002 | Express backend |
| Database | localhost:5433 | PostgreSQL |
| TURN | localhost:3478 | STUN/TURN for WebRTC NAT traversal |

### Test Credentials

| Account | Email | Password |
|---------|-------|----------|
| Admin | `admin@streamvu.local` | `admin123` |
| Demo | `demo@streamvu.local` | `demo123` |

---

## Project Structure

```
hippynet-stream-vu-dashboard/
├── packages/
│   ├── api/                    # Express backend
│   │   ├── src/
│   │   │   ├── config/         # Configuration management
│   │   │   ├── middleware/     # Auth, rate limiting, error handling
│   │   │   ├── routes/         # REST API endpoints
│   │   │   ├── services/       # Business logic
│   │   │   │   ├── mediasoup.service.ts    # WebRTC SFU
│   │   │   │   ├── srtIngest.service.ts    # SRT input handling
│   │   │   │   ├── ristIngest.service.ts   # RIST input handling
│   │   │   │   ├── busEncoder.service.ts   # FFmpeg mixing/encoding
│   │   │   │   ├── audioIngest.service.ts  # HTTP stream ingest
│   │   │   │   └── ...
│   │   │   ├── socket/         # Socket.io event handlers
│   │   │   └── utils/          # Helpers
│   │   └── prisma/
│   │       └── schema.prisma   # Database schema
│   │
│   ├── web/                    # React frontend
│   │   └── src/
│   │       ├── components/
│   │       │   ├── callCenter/ # Main contribution suite UI
│   │       │   │   ├── ProMixer.tsx        # Professional mixer
│   │       │   │   ├── MixerChannel.tsx    # Channel strip
│   │       │   │   ├── TimecodeDisplay.tsx # Timecode
│   │       │   │   ├── R128LoudnessMeter.tsx
│   │       │   │   ├── GreenRoom.tsx       # Staging area
│   │       │   │   ├── CuePanel.tsx        # Cue system
│   │       │   │   └── ...
│   │       │   ├── streams/    # Stream monitoring
│   │       │   └── mcr/        # Master control room
│   │       ├── hooks/
│   │       │   ├── useMediasoup.ts   # WebRTC connection
│   │       │   ├── useAudioEngine.ts # Web Audio processing
│   │       │   └── ...
│   │       ├── pages/
│   │       └── stores/         # Zustand state management
│   │
│   └── shared/                 # Shared TypeScript types
│       └── src/
│           └── types/          # API types, enums, interfaces
│
├── docker-compose.yml          # Development Docker config
├── docker-compose.prod.yml     # Production Docker config
├── Makefile                    # Development commands
└── ENTERPRISE_CONTRIBUTION_SUITE_PLAN.md  # Original feature plan
```

---

## Key Services

### mediasoup (WebRTC SFU)
- Manages WebRTC connections for all participants
- Creates routers per room, transports per participant
- Handles producers (audio sources) and consumers (audio sinks)
- PlainTransport for RTP integration with FFmpeg

### Bus Encoder Service
- Mixes multiple audio sources using FFmpeg
- Outputs to Icecast, SRT, or file
- Supports per-source volume, pan, routing
- Handles reconnection and error recovery

### SRT/RIST Ingest
- Accepts SRT streams in LISTENER or CALLER mode
- Decodes via FFmpeg to RTP for mediasoup
- Full integration with mixer (EQ, compression, routing)

### Audio Engine (Frontend)
- Web Audio API for real-time processing
- EQ, compression, gate per channel
- VU metering and loudness measurement
- Voice activity detection for ducking

---

## Database Commands

```bash
make db-migrate   # Create and apply migrations
make db-push      # Push schema changes (no migration file)
make db-reset     # Reset database (destructive!)
make db-seed      # Seed database with test data
make db-studio    # Open Prisma Studio
```

---

## Quality Commands

```bash
make lint         # Run ESLint
make lint-fix     # Auto-fix lint issues
make typecheck    # TypeScript type checking
make test         # Run all tests
make check        # Run all quality checks (lint + typecheck + test + build)
make ci           # Simulate CI pipeline
```

---

## API Endpoints

### Authentication
- `POST /api/auth/login` - Email/password login
- `POST /api/auth/google/token` - Google OAuth
- `POST /api/auth/refresh` - Refresh tokens

### Rooms
- `GET /api/rooms` - List call rooms
- `POST /api/rooms` - Create room
- `GET /api/rooms/:id` - Get room details
- `DELETE /api/rooms/:id` - Delete room

### Audio Sources
- `GET /api/rooms/:id/sources` - List sources
- `POST /api/rooms/:id/sources` - Add source (HTTP/SRT/RIST/file)
- `POST /api/rooms/:id/sources/:sid/start` - Start source
- `POST /api/rooms/:id/sources/:sid/stop` - Stop source

### Audio Outputs
- `GET /api/rooms/:id/outputs` - List outputs
- `POST /api/rooms/:id/outputs` - Add output (Icecast/SRT)
- `POST /api/rooms/:id/outputs/:oid/start` - Start streaming
- `POST /api/rooms/:id/outputs/:oid/stop` - Stop streaming

### WHIP/WHEP
- `POST /whip/:roomId/ingest` - WHIP ingest endpoint
- `DELETE /whip/:roomId/:streamId` - Teardown WHIP stream

---

## Socket.io Events

### Connection
- `room:join` - Join a call room
- `room:leave` - Leave room

### Audio Control
- `producer:create` - Start sending audio
- `consumer:create` - Start receiving audio
- `mute:update` - Toggle mute
- `vad:activity` - Voice activity detection

### Mixing
- `routing:update` - Change bus routing
- `channel:update` - Update channel settings (volume, pan, EQ)
- `source:start` / `source:stop` - Control external sources

### IFB/Talkback
- `ifb:start` / `ifb:stop` - IFB routing control

### Cue System
- `cue:send` - Send cue to participant
- `cue:received` - Cue received by participant

---

## Troubleshooting

### Docker not running
```bash
# Verify Docker is running
docker ps

# If not, start Docker Desktop, then:
make dev
```

### Port conflicts
```bash
# Kill processes on ports
lsof -ti:3002,3003 | xargs kill -9
make dev
```

### Database connection issues
```bash
# Restart database container
docker-compose restart db

# Or reset completely
make db-reset
make db-seed
```

### WebRTC not connecting
- Check `MEDIASOUP_ANNOUNCED_IP` in `.env` matches your server's IP
- Verify TURN server is running for NAT traversal
- Check browser console for ICE connection errors

---

## Success Metrics

- **Latency:** < 500ms glass-to-glass for contribution
- **Reliability:** 99.9% uptime for production use
- **Quality:** Transparent audio quality (no artifacts)
- **Usability:** < 5 minute setup time for new contributors
- **Scale:** 20+ simultaneous contributors per room

---

## Future Considerations

While all planned features are implemented, potential enhancements include:
- Multi-tenant SaaS billing integration
- Mobile companion apps (iOS/Android)
- Hardware control surface integration (MIDI, OSC)
- Advanced analytics and reporting
- AI-powered audio enhancement (noise reduction, leveling)
