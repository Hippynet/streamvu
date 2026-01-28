import express, { type Express } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { config } from './config/index.js'
import { errorHandler } from './middleware/errorHandler.js'
import { generalLimiter } from './middleware/rateLimit.js'
import authRoutes from './routes/auth.js'
import streamRoutes from './routes/streams.js'
import organizationRoutes from './routes/organizations.js'
import inviteRoutes from './routes/invites.js'
import callRoomRoutes from './routes/callRooms.js'
import userRoutes from './routes/users.js'
import adminRoutes from './routes/admin.js'
import audioSourceRoutes from './routes/audioSources.js'
import audioOutputRoutes from './routes/audioOutputs.js'
import fileRoutes from './routes/files.js'
import rundownRoutes from './routes/rundowns.js'
import recordingRoutes from './routes/recordings.js'
import whipRoutes from './routes/whip.js'
import multiOutputRoutes from './routes/multiOutput.js'
import automationRoutes from './routes/automation.js'
import cloudStorageRoutes from './routes/cloudStorage.js'
import analyticsRoutes from './routes/analytics.js'
import ndiBridgeRoutes from './routes/ndiBridge.js'
import gatewayRoutes from './routes/gateway.js'
import templateRoutes from './routes/templates.js'
import preflightRoutes from './routes/preflight.js'
import healthRoutes from './routes/health.js'
import metricsRoutes from './routes/metrics.js'
import alertsRoutes from './routes/alerts.js'
import webrtcDiagnosticsRoutes from './routes/webrtcDiagnostics.js'

export const app: Express = express()

// Raw body parser for WHIP SDP content (must be before express.json())
app.use('/whip', express.raw({ type: 'application/sdp' }))
app.use('/whip', express.raw({ type: 'application/trickle-ice-sdpfrag' }))

// Security middleware
app.use(helmet())
app.use(cors({ origin: config.cors.origin, credentials: true }))
app.use(express.json())
app.use(generalLimiter)

// Health check routes (for Kubernetes/Docker probes)
app.use('/health', healthRoutes)

// Prometheus metrics endpoint
app.use('/metrics', metricsRoutes)

// Alerting endpoints
app.use('/api/alerts', alertsRoutes)

// API routes
app.use('/api/auth', authRoutes)
app.use('/api/streams', streamRoutes)
app.use('/api/organization', organizationRoutes)
app.use('/api/invites', inviteRoutes)
app.use('/api/rooms', callRoomRoutes)
app.use('/api/users', userRoutes)
app.use('/api/admin', adminRoutes)
// Enterprise contribution suite routes
app.use('/api/rooms', audioSourceRoutes)  // /api/rooms/:roomId/sources
app.use('/api/rooms', audioOutputRoutes)  // /api/rooms/:roomId/outputs
app.use('/api/files', fileRoutes)         // /api/files
app.use('/api', rundownRoutes)            // /api/rooms/:roomId/rundown, /api/rundown/items/:itemId
app.use('/api', recordingRoutes)          // /api/rooms/:roomId/recordings, /api/recordings/:id
app.use('/api/multi-output', multiOutputRoutes) // /api/multi-output/:roomId, /api/multi-output/:outputId
app.use('/api/automation', automationRoutes)    // /api/automation/rooms/:roomId/*, /api/automation/webhooks
app.use('/api', cloudStorageRoutes)              // /api/cloud-storage/*, /api/transcription/*
app.use('/api/analytics', analyticsRoutes)       // /api/analytics/*
app.use('/api/ndi-bridge', ndiBridgeRoutes)      // /api/ndi-bridge/*
app.use('/api/gateway', gatewayRoutes)           // /api/gateway/*
app.use('/api/templates', templateRoutes)        // /api/templates
app.use('/api/preflight', preflightRoutes)       // /api/preflight/* (self-service equipment check)
app.use('/api/webrtc', webrtcDiagnosticsRoutes)  // /api/webrtc/:roomId/diagnostics, /api/webrtc/:roomId/validate

// WHIP/WHEP protocol routes (WebRTC ingest from OBS 30+, vMix, etc.)
app.use('/whip', whipRoutes)

// Error handler
app.use(errorHandler)
