# StreamVU Monitor

A lightweight, browser-based Icecast/HTTP audio stream monitor.

**Live:** https://stream-vu.audiotoolbox1.hippynet.co.uk/

## What This Is

Static web app for monitoring audio streams with real-time VU meters. No backend, no login - runs entirely in the browser.

## Tech Stack

- **Frontend:** React 18, Vite, TailwindCSS, Zustand
- **Audio:** Web Audio API (AnalyserNode)
- **Production:** nginx in Docker

## Key Files

```
packages/web/
├── src/
│   ├── pages/Monitor.tsx      # Main monitoring page with VU meters
│   ├── stores/streamStore.ts  # Zustand store with localStorage persistence
│   └── components/mcr/        # Stream tile and VU meter components
├── Dockerfile                 # Multi-stage build (node → nginx)
└── nginx.conf                 # SPA routing config
```

## Deployment

```bash
# Docker image
ghcr.io/hippynet/streamvu-monitor:latest

# Portainer config
docker-compose.portainer.yml
```

GitHub Actions auto-builds on push to main.

## Development

**Always use Docker:**
```bash
make dev          # Start dev environment
make dev-rebuild  # Rebuild after changes
make check        # Run lint + typecheck + build
```

## Branches

- `main` - Static stream monitor (current)
- `parked-features` - Full enterprise version with WebRTC, mediasoup, authentication, etc.
