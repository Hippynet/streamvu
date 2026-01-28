import { createServer } from 'http'
import { Server } from 'socket.io'
import { app } from './app.js'
import { config, validateConfig } from './config/index.js'
import { setupSocketHandlers } from './socket/index.js'
import { startHealthChecker } from './services/healthCheck.service.js'
import { mediasoupService } from './services/mediasoup.service.js'

validateConfig()

const httpServer = createServer(app)

const io = new Server(httpServer, {
  cors: {
    origin: config.cors.origin,
    methods: ['GET', 'POST'],
  },
})

// Initialize mediasoup and start server
async function start() {
  try {
    // Initialize mediasoup workers
    await mediasoupService.initialize()
    console.log('🎙️  mediasoup initialized')

    // Set up socket handlers (includes call center namespace)
    setupSocketHandlers(io)

    httpServer.listen(config.port, '0.0.0.0', () => {
      console.log(`🚀 API server running on port ${config.port} (all interfaces)`)
      console.log(`   Environment: ${config.nodeEnv}`)

      // Start background health checker
      startHealthChecker()
    })
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...')
  await mediasoupService.shutdown()
  httpServer.close()
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down...')
  await mediasoupService.shutdown()
  httpServer.close()
  process.exit(0)
})

start()
