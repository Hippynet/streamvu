# StreamVU Monitor

A lightweight, browser-based Icecast/HTTP audio stream monitor with real-time VU meters.

**Live Demo:** https://stream-vu.audiotoolbox1.hippynet.co.uk/

![StreamVU Monitor](https://img.shields.io/badge/status-production-green)

## Features

- **Real-time VU Meters** - Stereo level monitoring with peak hold indicators
- **Multi-stream Support** - Monitor multiple streams simultaneously in a grid layout
- **No Backend Required** - Runs entirely in the browser, no server-side processing
- **Persistent Config** - Stream configuration saved to browser localStorage
- **Import/Export** - Backup and restore your configuration as JSON
- **Zen Mode** - Fullscreen view showing only VU meters and clock
- **Stream Recording** - Record streams to WebM format (auto-downloads on stop)
- **Responsive Grid** - Adjustable tile sizes and automatic grid layout
- **Dark Theme** - Broadcast control room appropriate styling

## Quick Start

1. Visit the app URL
2. Click the **+** button to add a stream
3. Enter a name and the Icecast/HTTP stream URL
4. Click **Start Monitoring** to begin

## Configuration

### Adding Streams

- Click the **+** button in the header
- Enter the stream name and URL
- Streams are saved automatically to your browser

### Settings

Access via the sidebar:
- **Export Config** - Download your stream configuration as JSON
- **Import Config** - Load a previously exported configuration
- **Tile Size** - Adjust the size of stream tiles in the grid

### Zen Mode

Click the expand icon to enter fullscreen mode showing only:
- VU meters for all streams
- Current time
- Stream status indicators

## Deployment

### Docker (Recommended)

```bash
docker pull ghcr.io/hippynet/streamvu-monitor:latest
docker run -d -p 80:80 ghcr.io/hippynet/streamvu-monitor:latest
```

### Docker Compose

```yaml
services:
  streamvu:
    image: ghcr.io/hippynet/streamvu-monitor:latest
    ports:
      - "8080:80"
    restart: unless-stopped
```

### Portainer with Traefik

See `docker-compose.portainer.yml` for a complete example with:
- Traefik reverse proxy integration
- HTTPS with Let's Encrypt
- Resource limits

## Development

This project uses Docker for development. **Do not run locally.**

```bash
# Start development environment
make dev

# Rebuild after dependency changes
make dev-rebuild

# Run quality checks
make check
```

## Tech Stack

- **Frontend:** React 18, Vite, TailwindCSS, Zustand
- **Audio:** Web Audio API (AnalyserNode for VU metering)
- **Recording:** MediaRecorder API (WebM/Opus)
- **Production:** nginx (Alpine)

## Browser Support

Requires a modern browser with Web Audio API support:
- Chrome/Edge 80+
- Firefox 75+
- Safari 14+

## CORS Requirements

Stream URLs must allow cross-origin requests. Most Icecast servers support this by default. If you see CORS errors, configure your stream server to send:

```
Access-Control-Allow-Origin: *
```

## License

MIT

## Credits

Built by [Hippynet](https://github.com/Hippynet)
