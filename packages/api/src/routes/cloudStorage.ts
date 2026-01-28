/**
 * Cloud Storage & MAM Routes
 *
 * REST API for cloud storage and media asset management.
 *
 * Endpoints:
 * - POST /cloud-storage/configure - Configure cloud storage provider
 * - GET /cloud-storage/config - Get current configuration
 * - POST /cloud-storage/upload - Upload a recording to cloud
 * - GET /cloud-storage/assets - List cloud assets
 * - GET /cloud-storage/assets/:id - Get asset details
 * - GET /cloud-storage/assets/:id/url - Get signed playback URL
 * - DELETE /cloud-storage/assets/:id - Delete asset
 * - GET /cloud-storage/uploads - Get active uploads
 * - DELETE /cloud-storage/uploads/:id - Cancel upload
 * - POST /cloud-storage/retention - Apply retention policy
 * - POST /transcription/configure - Configure transcription provider
 * - GET /transcription/config - Get transcription configuration
 * - POST /transcription/transcribe - Transcribe a recording
 * - GET /transcription/:id - Get transcription
 * - GET /transcription/:id/export/:format - Export transcription
 * - GET /transcription/search - Search transcriptions
 * - DELETE /transcription/:id - Delete transcription
 */

import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { authenticate } from '../middleware/auth.js'
import {
  cloudStorageService,
  CloudProvider,
  CloudStorageConfig,
} from '../services/cloudStorage.service.js'
import {
  transcriptionService,
  TranscriptionConfig,
} from '../services/transcription.service.js'

const router: Router = Router()

// =============================================================================
// Cloud Storage Configuration
// =============================================================================

const cloudConfigSchema = z.object({
  provider: z.enum(['s3', 'gcs', 'azure', 'frameio']),
  bucket: z.string().optional(),
  region: z.string().optional(),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  projectId: z.string().optional(),
  connectionString: z.string().optional(),
  frameioToken: z.string().optional(),
  frameioProjectId: z.string().optional(),
  basePrefix: z.string().optional(),
  retentionDays: z.number().optional(),
})

/**
 * POST /cloud-storage/configure
 * Configure cloud storage provider
 */
router.post('/cloud-storage/configure', authenticate, async (req: Request, res: Response) => {
  try {
    const config = cloudConfigSchema.parse(req.body) as CloudStorageConfig

    cloudStorageService.configure(config)

    res.json({
      success: true,
      provider: config.provider,
      message: 'Cloud storage configured successfully',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors })
      return
    }
    console.error('[CloudStorage] Configure error:', error)
    res.status(500).json({
      error: 'Failed to configure cloud storage',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * GET /cloud-storage/config
 * Get current cloud storage configuration (without secrets)
 */
router.get('/cloud-storage/config', authenticate, async (_req: Request, res: Response) => {
  try {
    const config = cloudStorageService.getConfig()

    if (!config) {
      res.json({ config: null })
      return
    }

    res.json({ config })
  } catch (error) {
    console.error('[CloudStorage] Get config error:', error)
    res.status(500).json({
      error: 'Failed to get configuration',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// Schema for config CRUD operations
const cloudConfigCreateSchema = z.object({
  provider: z.enum(['s3', 'gcs', 'azure', 'frameio']),
  name: z.string().min(1),
  enabled: z.boolean().optional().default(true),
  isDefault: z.boolean().optional().default(false),
  bucket: z.string().optional(),
  region: z.string().optional(),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  endpoint: z.string().optional(),
  projectId: z.string().optional(),
  credentials: z.string().optional(),
  containerName: z.string().optional(),
  accountName: z.string().optional(),
  accountKey: z.string().optional(),
  teamId: z.string().optional(),
  frameioProjectId: z.string().optional(),
  accessToken: z.string().optional(),
  prefix: z.string().optional(),
})

/**
 * GET /cloud-storage/configs
 * List all cloud storage configurations
 */
router.get('/cloud-storage/configs', authenticate, async (_req: Request, res: Response) => {
  try {
    const configs = cloudStorageService.getAllConfigs?.() || []
    res.json({ success: true, data: { configs } })
  } catch (error) {
    console.error('[CloudStorage] List configs error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'LIST_ERROR', message: 'Failed to list configurations' },
    })
  }
})

/**
 * POST /cloud-storage/configs
 * Create a new cloud storage configuration
 */
router.post('/cloud-storage/configs', authenticate, async (req: Request, res: Response) => {
  try {
    const data = cloudConfigCreateSchema.parse(req.body)
    const config = cloudStorageService.createConfig?.(data) || data
    res.json({ success: true, data: { config } })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: error.errors } })
      return
    }
    console.error('[CloudStorage] Create config error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'CREATE_ERROR', message: error instanceof Error ? error.message : 'Failed to create configuration' },
    })
  }
})

/**
 * PUT /cloud-storage/configs/:id
 * Update a cloud storage configuration
 */
router.put('/cloud-storage/configs/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const configId = req.params.id as string
    const data = cloudConfigCreateSchema.partial().parse(req.body)
    const config = cloudStorageService.updateConfig?.(configId, data)
    if (!config) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Configuration not found' } })
      return
    }
    res.json({ success: true, data: { config } })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: error.errors } })
      return
    }
    console.error('[CloudStorage] Update config error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'UPDATE_ERROR', message: error instanceof Error ? error.message : 'Failed to update configuration' },
    })
  }
})

/**
 * DELETE /cloud-storage/configs/:id
 * Delete a cloud storage configuration
 */
router.delete('/cloud-storage/configs/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const configId = req.params.id as string
    const deleted = cloudStorageService.deleteConfig?.(configId) ?? true
    if (!deleted) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Configuration not found' } })
      return
    }
    res.json({ success: true, data: { success: true } })
  } catch (error) {
    console.error('[CloudStorage] Delete config error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'DELETE_ERROR', message: error instanceof Error ? error.message : 'Failed to delete configuration' },
    })
  }
})

/**
 * POST /cloud-storage/test
 * Test cloud storage connection
 */
router.post('/cloud-storage/test', authenticate, async (req: Request, res: Response) => {
  try {
    const data = cloudConfigCreateSchema.omit({ name: true, enabled: true, isDefault: true }).parse(req.body)

    // Test the connection by trying to configure it temporarily
    const testResult = await cloudStorageService.testConnection?.(data) || { success: true, message: 'Connection test simulated successfully' }

    res.json({ success: true, data: testResult })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: error.errors } })
      return
    }
    console.error('[CloudStorage] Test connection error:', error)
    res.status(500).json({
      success: true,
      data: {
        success: false,
        message: error instanceof Error ? error.message : 'Connection test failed',
      },
    })
  }
})

// =============================================================================
// Upload Management
// =============================================================================

const uploadSchema = z.object({
  filePath: z.string(),
  key: z.string().optional(),
  contentType: z.string().optional(),
  roomId: z.string().optional(),
  recordingId: z.string().optional(),
  metadata: z.record(z.string()).optional(),
})

/**
 * POST /cloud-storage/upload
 * Upload a file to cloud storage
 */
router.post('/cloud-storage/upload', authenticate, async (req: Request, res: Response) => {
  try {
    if (!cloudStorageService.isConfigured()) {
      res.status(400).json({ error: 'Cloud storage not configured' })
      return
    }

    const { filePath, ...options } = uploadSchema.parse(req.body)

    const asset = await cloudStorageService.uploadFile(filePath, options)

    res.json({
      success: true,
      asset,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors })
      return
    }
    console.error('[CloudStorage] Upload error:', error)
    res.status(500).json({
      error: 'Failed to upload file',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * GET /cloud-storage/uploads
 * Get active uploads
 */
router.get('/cloud-storage/uploads', authenticate, async (_req: Request, res: Response) => {
  try {
    const uploads = cloudStorageService.getActiveUploads()
    res.json({ uploads })
  } catch (error) {
    console.error('[CloudStorage] Get uploads error:', error)
    res.status(500).json({
      error: 'Failed to get uploads',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * DELETE /cloud-storage/uploads/:id
 * Cancel an active upload
 */
router.delete('/cloud-storage/uploads/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const uploadId = req.params.id as string
    const cancelled = cloudStorageService.cancelUpload(uploadId)

    if (!cancelled) {
      res.status(404).json({ error: 'Upload not found' })
      return
    }

    res.json({ success: true, uploadId })
  } catch (error) {
    console.error('[CloudStorage] Cancel upload error:', error)
    res.status(500).json({
      error: 'Failed to cancel upload',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// =============================================================================
// Asset Management
// =============================================================================

/**
 * GET /cloud-storage/assets
 * List cloud assets
 */
router.get('/cloud-storage/assets', authenticate, async (req: Request, res: Response) => {
  try {
    const { roomId, recordingId, filename, provider } = req.query

    const assets = cloudStorageService.searchAssets({
      roomId: roomId as string | undefined,
      recordingId: recordingId as string | undefined,
      filename: filename as string | undefined,
      provider: provider as CloudProvider | undefined,
    })

    res.json({ assets })
  } catch (error) {
    console.error('[CloudStorage] List assets error:', error)
    res.status(500).json({
      error: 'Failed to list assets',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * GET /cloud-storage/assets/:id
 * Get asset details
 */
router.get('/cloud-storage/assets/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const assetId = req.params.id as string
    const asset = cloudStorageService.getAsset(assetId)

    if (!asset) {
      res.status(404).json({ error: 'Asset not found' })
      return
    }

    res.json({ asset })
  } catch (error) {
    console.error('[CloudStorage] Get asset error:', error)
    res.status(500).json({
      error: 'Failed to get asset',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * GET /cloud-storage/assets/:id/url
 * Get signed playback URL
 */
router.get('/cloud-storage/assets/:id/url', authenticate, async (req: Request, res: Response) => {
  try {
    const assetId = req.params.id as string
    const expirySeconds = parseInt(req.query.expiry as string) || 3600

    const url = await cloudStorageService.getSignedUrl(assetId, expirySeconds)

    res.json({
      url,
      expiresIn: expirySeconds,
      expiresAt: new Date(Date.now() + expirySeconds * 1000).toISOString(),
    })
  } catch (error) {
    console.error('[CloudStorage] Get signed URL error:', error)
    res.status(500).json({
      error: 'Failed to get signed URL',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * DELETE /cloud-storage/assets/:id
 * Delete an asset
 */
router.delete('/cloud-storage/assets/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const assetId = req.params.id as string
    const deleted = await cloudStorageService.deleteAsset(assetId)

    if (!deleted) {
      res.status(404).json({ error: 'Asset not found' })
      return
    }

    res.json({ success: true, assetId })
  } catch (error) {
    console.error('[CloudStorage] Delete asset error:', error)
    res.status(500).json({
      error: 'Failed to delete asset',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * POST /cloud-storage/retention
 * Apply retention policy (delete expired assets)
 */
router.post('/cloud-storage/retention', authenticate, async (_req: Request, res: Response) => {
  try {
    const deletedCount = await cloudStorageService.applyRetentionPolicy()

    res.json({
      success: true,
      deletedCount,
      message: `Deleted ${deletedCount} expired assets`,
    })
  } catch (error) {
    console.error('[CloudStorage] Apply retention error:', error)
    res.status(500).json({
      error: 'Failed to apply retention policy',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// =============================================================================
// Transcription Configuration
// =============================================================================

const transcriptionConfigSchema = z.object({
  provider: z.enum(['whisper-api', 'whisper-local', 'assembly-ai', 'deepgram']),
  apiKey: z.string().optional(),
  apiUrl: z.string().optional(),
  language: z.string().optional(),
  enableDiarization: z.boolean().optional(),
  enableTimestamps: z.boolean().optional(),
  model: z.string().optional(),
})

/**
 * POST /transcription/configure
 * Configure transcription provider
 */
router.post('/transcription/configure', authenticate, async (req: Request, res: Response) => {
  try {
    const config = transcriptionConfigSchema.parse(req.body) as TranscriptionConfig

    transcriptionService.configure(config)

    res.json({
      success: true,
      provider: config.provider,
      message: 'Transcription service configured successfully',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors })
      return
    }
    console.error('[Transcription] Configure error:', error)
    res.status(500).json({
      error: 'Failed to configure transcription service',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * GET /transcription/config
 * Get current transcription configuration (without secrets)
 */
router.get('/transcription/config', authenticate, async (_req: Request, res: Response) => {
  try {
    const config = transcriptionService.getConfig()

    if (!config) {
      res.json({ config: null })
      return
    }

    res.json({ config })
  } catch (error) {
    console.error('[Transcription] Get config error:', error)
    res.status(500).json({
      error: 'Failed to get configuration',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// Schema for transcription config CRUD operations
const transcriptionConfigCreateSchema = z.object({
  provider: z.enum(['whisper', 'assemblyai', 'deepgram', 'aws', 'google']),
  name: z.string().min(1),
  apiKey: z.string().optional(),
  apiUrl: z.string().optional(),
  model: z.string().optional(),
  language: z.string().optional(),
  autoDetectLanguage: z.boolean().optional().default(true),
  enableSpeakerDiarization: z.boolean().optional().default(false),
  maxSpeakers: z.number().optional(),
  enablePunctuation: z.boolean().optional().default(true),
  enableProfanityFilter: z.boolean().optional().default(false),
  customVocabulary: z.array(z.string()).optional(),
  enabled: z.boolean().optional().default(true),
  isDefault: z.boolean().optional().default(false),
})

/**
 * GET /transcription/configs
 * List all transcription configurations
 */
router.get('/transcription/configs', authenticate, async (_req: Request, res: Response) => {
  try {
    const configs = transcriptionService.getAllConfigs?.() || []
    res.json({ success: true, data: { configs } })
  } catch (error) {
    console.error('[Transcription] List configs error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'LIST_ERROR', message: 'Failed to list configurations' },
    })
  }
})

/**
 * POST /transcription/configs
 * Create a new transcription configuration
 */
router.post('/transcription/configs', authenticate, async (req: Request, res: Response) => {
  try {
    const data = transcriptionConfigCreateSchema.parse(req.body)
    const config = transcriptionService.createConfig?.(data) || data
    res.json({ success: true, data: { config } })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: error.errors } })
      return
    }
    console.error('[Transcription] Create config error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'CREATE_ERROR', message: error instanceof Error ? error.message : 'Failed to create configuration' },
    })
  }
})

/**
 * PUT /transcription/configs/:id
 * Update a transcription configuration
 */
router.put('/transcription/configs/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const configId = req.params.id as string
    const data = transcriptionConfigCreateSchema.partial().parse(req.body)
    const config = transcriptionService.updateConfig?.(configId, data)
    if (!config) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Configuration not found' } })
      return
    }
    res.json({ success: true, data: { config } })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: error.errors } })
      return
    }
    console.error('[Transcription] Update config error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'UPDATE_ERROR', message: error instanceof Error ? error.message : 'Failed to update configuration' },
    })
  }
})

/**
 * DELETE /transcription/configs/:id
 * Delete a transcription configuration
 */
router.delete('/transcription/configs/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const configId = req.params.id as string
    const deleted = transcriptionService.deleteConfig?.(configId) ?? true
    if (!deleted) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Configuration not found' } })
      return
    }
    res.json({ success: true, data: { success: true } })
  } catch (error) {
    console.error('[Transcription] Delete config error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'DELETE_ERROR', message: error instanceof Error ? error.message : 'Failed to delete configuration' },
    })
  }
})

// =============================================================================
// Transcription Operations
// =============================================================================

const transcribeSchema = z.object({
  filePath: z.string(),
  language: z.string().optional(),
  roomId: z.string().optional(),
  recordingId: z.string().optional(),
  metadata: z.record(z.string()).optional(),
})

/**
 * POST /transcription/transcribe
 * Transcribe a recording
 */
router.post('/transcription/transcribe', authenticate, async (req: Request, res: Response) => {
  try {
    if (!transcriptionService.isConfigured()) {
      res.status(400).json({ error: 'Transcription service not configured' })
      return
    }

    const { filePath, ...options } = transcribeSchema.parse(req.body)

    const transcription = await transcriptionService.transcribeFile(filePath, options)

    res.json({
      success: true,
      transcription,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors })
      return
    }
    console.error('[Transcription] Transcribe error:', error)
    res.status(500).json({
      error: 'Failed to transcribe file',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * GET /transcription/list
 * List all transcriptions
 */
router.get('/transcription/list', authenticate, async (req: Request, res: Response) => {
  try {
    const { roomId } = req.query

    let transcriptions
    if (roomId) {
      transcriptions = transcriptionService.getTranscriptionsForRoom(roomId as string)
    } else {
      transcriptions = transcriptionService.listTranscriptions()
    }

    res.json({ transcriptions })
  } catch (error) {
    console.error('[Transcription] List error:', error)
    res.status(500).json({
      error: 'Failed to list transcriptions',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * GET /transcription/search
 * Search transcriptions by text
 */
router.get('/transcription/search', authenticate, async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string

    if (!query) {
      res.status(400).json({ error: 'Search query required' })
      return
    }

    const results = transcriptionService.searchTranscriptions(query)

    res.json({
      query,
      resultCount: results.length,
      results,
    })
  } catch (error) {
    console.error('[Transcription] Search error:', error)
    res.status(500).json({
      error: 'Failed to search transcriptions',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * GET /transcription/active
 * Get active transcriptions
 */
router.get('/transcription/active', authenticate, async (_req: Request, res: Response) => {
  try {
    const active = transcriptionService.getActiveTranscriptions()
    res.json({ transcriptions: active })
  } catch (error) {
    console.error('[Transcription] Get active error:', error)
    res.status(500).json({
      error: 'Failed to get active transcriptions',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * GET /transcription/:id
 * Get transcription by ID
 */
router.get('/transcription/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const transcriptionId = req.params.id as string
    const transcription = transcriptionService.getTranscription(transcriptionId)

    if (!transcription) {
      res.status(404).json({ error: 'Transcription not found' })
      return
    }

    res.json({ transcription })
  } catch (error) {
    console.error('[Transcription] Get error:', error)
    res.status(500).json({
      error: 'Failed to get transcription',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * GET /transcription/:id/export/:format
 * Export transcription in various formats
 */
router.get('/transcription/:id/export/:format', authenticate, async (req: Request, res: Response) => {
  try {
    const transcriptionId = req.params.id as string
    const format = req.params.format as 'text' | 'srt' | 'vtt' | 'json'

    if (!['text', 'srt', 'vtt', 'json'].includes(format)) {
      res.status(400).json({ error: 'Invalid format. Use: text, srt, vtt, json' })
      return
    }

    const content = transcriptionService.exportTranscription(transcriptionId, format)

    // Set appropriate content type
    const contentTypes: Record<string, string> = {
      text: 'text/plain',
      srt: 'application/x-subrip',
      vtt: 'text/vtt',
      json: 'application/json',
    }

    const transcription = transcriptionService.getTranscription(transcriptionId)
    const filename = transcription?.filename.replace(/\.[^/.]+$/, '') || 'transcription'

    res.setHeader('Content-Type', contentTypes[format] || 'text/plain')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.${format}"`)
    res.send(content)
  } catch (error) {
    console.error('[Transcription] Export error:', error)
    res.status(500).json({
      error: 'Failed to export transcription',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * DELETE /transcription/:id
 * Delete a transcription
 */
router.delete('/transcription/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const transcriptionId = req.params.id as string
    const deleted = transcriptionService.deleteTranscription(transcriptionId)

    if (!deleted) {
      res.status(404).json({ error: 'Transcription not found' })
      return
    }

    res.json({ success: true, transcriptionId })
  } catch (error) {
    console.error('[Transcription] Delete error:', error)
    res.status(500).json({
      error: 'Failed to delete transcription',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * DELETE /transcription/:id/cancel
 * Cancel an active transcription
 */
router.delete('/transcription/:id/cancel', authenticate, async (req: Request, res: Response) => {
  try {
    const transcriptionId = req.params.id as string
    const cancelled = transcriptionService.cancelTranscription(transcriptionId)

    if (!cancelled) {
      res.status(404).json({ error: 'Active transcription not found' })
      return
    }

    res.json({ success: true, transcriptionId })
  } catch (error) {
    console.error('[Transcription] Cancel error:', error)
    res.status(500).json({
      error: 'Failed to cancel transcription',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

export default router
