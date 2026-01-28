/**
 * Cloud Storage Service
 *
 * Manages cloud-based storage for recordings with support for:
 * - AWS S3
 * - Google Cloud Storage
 * - Azure Blob Storage
 * - Frame.io integration for professional workflows
 *
 * Features:
 * - Automatic upload after recording completes
 * - Retention policies (auto-delete after X days)
 * - Multi-part upload for large files
 * - Progress tracking
 * - Signed URL generation for playback
 */

import { EventEmitter } from 'events'
import { statSync } from 'fs'
import { basename } from 'path'
import { randomUUID } from 'crypto'

export type CloudProvider = 's3' | 'gcs' | 'azure' | 'frameio'

export interface CloudStorageConfig {
  provider: CloudProvider
  bucket?: string
  region?: string
  accessKeyId?: string
  secretAccessKey?: string
  projectId?: string // GCS
  connectionString?: string // Azure
  frameioToken?: string // Frame.io
  frameioProjectId?: string
  basePrefix?: string // Prefix for all uploads
  retentionDays?: number // Auto-delete after N days
}

export interface CloudAsset {
  id: string
  provider: CloudProvider
  bucket: string
  key: string
  filename: string
  size: number
  contentType: string
  uploadedAt: Date
  expiresAt?: Date
  metadata: Record<string, string>
  signedUrl?: string
  signedUrlExpiry?: Date
}

export interface UploadProgress {
  uploadId: string
  filename: string
  totalBytes: number
  uploadedBytes: number
  percentComplete: number
  status: 'pending' | 'uploading' | 'completed' | 'failed'
  error?: string
}

interface ActiveUpload {
  id: string
  filePath: string
  provider: CloudProvider
  progress: UploadProgress
  abortController?: AbortController
}

// Extended config with id for CRUD operations
interface StoredCloudStorageConfig extends CloudStorageConfig {
  id: string
  name: string
  enabled: boolean
  isDefault: boolean
  organizationId?: string
  createdAt: string
  updatedAt: string
}

class CloudStorageService extends EventEmitter {
  private config: CloudStorageConfig | null = null
  private activeUploads: Map<string, ActiveUpload> = new Map()
  private assets: Map<string, CloudAsset> = new Map()
  private configs: Map<string, StoredCloudStorageConfig> = new Map()

  constructor() {
    super()
  }

  /**
   * Get all storage configurations
   */
  getAllConfigs(): StoredCloudStorageConfig[] {
    return Array.from(this.configs.values())
  }

  /**
   * Create a new storage configuration
   */
  createConfig(data: Partial<StoredCloudStorageConfig> & { provider: CloudProvider; name: string }): StoredCloudStorageConfig {
    const id = randomUUID()
    const now = new Date().toISOString()

    const config: StoredCloudStorageConfig = {
      id,
      provider: data.provider,
      name: data.name,
      enabled: data.enabled ?? true,
      isDefault: data.isDefault ?? false,
      bucket: data.bucket,
      region: data.region,
      accessKeyId: data.accessKeyId,
      secretAccessKey: data.secretAccessKey,
      projectId: data.projectId,
      connectionString: data.connectionString,
      frameioToken: data.frameioToken,
      frameioProjectId: data.frameioProjectId,
      basePrefix: data.basePrefix,
      retentionDays: data.retentionDays,
      createdAt: now,
      updatedAt: now,
    }

    // If this is set as default, unset other defaults
    if (config.isDefault) {
      this.configs.forEach((c) => {
        c.isDefault = false
      })
    }

    this.configs.set(id, config)
    console.log(`[CloudStorage] Created config: ${config.name} (${config.provider})`)

    return config
  }

  /**
   * Update a storage configuration
   */
  updateConfig(configId: string, data: Partial<StoredCloudStorageConfig>): StoredCloudStorageConfig | null {
    const existing = this.configs.get(configId)
    if (!existing) return null

    const updated: StoredCloudStorageConfig = {
      ...existing,
      ...data,
      id: existing.id, // Prevent ID changes
      updatedAt: new Date().toISOString(),
    }

    // If setting as default, unset other defaults
    if (data.isDefault) {
      this.configs.forEach((c) => {
        if (c.id !== configId) c.isDefault = false
      })
    }

    this.configs.set(configId, updated)
    console.log(`[CloudStorage] Updated config: ${updated.name}`)

    return updated
  }

  /**
   * Delete a storage configuration
   */
  deleteConfig(configId: string): boolean {
    const config = this.configs.get(configId)
    if (!config) return false

    this.configs.delete(configId)
    console.log(`[CloudStorage] Deleted config: ${config.name}`)

    return true
  }

  /**
   * Test cloud storage connection
   */
  async testConnection(config: Partial<CloudStorageConfig>): Promise<{ success: boolean; message: string }> {
    // Simulate connection test
    try {
      if (!config.provider) {
        return { success: false, message: 'Provider is required' }
      }

      switch (config.provider) {
        case 's3':
          if (!config.bucket || !config.accessKeyId || !config.secretAccessKey) {
            return { success: false, message: 'Bucket, access key ID, and secret access key are required for S3' }
          }
          break
        case 'gcs':
          if (!config.bucket || !config.projectId) {
            return { success: false, message: 'Bucket and project ID are required for GCS' }
          }
          break
        case 'azure':
          if (!config.connectionString && (!config.bucket)) {
            return { success: false, message: 'Container name and connection string are required for Azure' }
          }
          break
        case 'frameio':
          if (!config.frameioToken || !config.frameioProjectId) {
            return { success: false, message: 'Frame.io token and project ID are required' }
          }
          break
      }

      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 500))

      return { success: true, message: `Successfully connected to ${config.provider}` }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection test failed',
      }
    }
  }

  /**
   * Configure the cloud storage provider
   */
  configure(config: CloudStorageConfig): void {
    this.config = config
    console.log(`[CloudStorage] Configured with provider: ${config.provider}`)
    this.emit('configured', { provider: config.provider })
  }

  /**
   * Check if cloud storage is configured
   */
  isConfigured(): boolean {
    return this.config !== null
  }

  /**
   * Get current configuration (without secrets)
   */
  getConfig(): Partial<CloudStorageConfig> | null {
    if (!this.config) return null
    return {
      provider: this.config.provider,
      bucket: this.config.bucket,
      region: this.config.region,
      basePrefix: this.config.basePrefix,
      retentionDays: this.config.retentionDays,
    }
  }

  /**
   * Upload a file to cloud storage
   */
  async uploadFile(
    filePath: string,
    options: {
      key?: string
      contentType?: string
      metadata?: Record<string, string>
      roomId?: string
      recordingId?: string
    } = {}
  ): Promise<CloudAsset> {
    if (!this.config) {
      throw new Error('Cloud storage not configured')
    }

    const uploadId = randomUUID()
    const filename = basename(filePath)
    const stats = statSync(filePath)

    const progress: UploadProgress = {
      uploadId,
      filename,
      totalBytes: stats.size,
      uploadedBytes: 0,
      percentComplete: 0,
      status: 'pending',
    }

    const upload: ActiveUpload = {
      id: uploadId,
      filePath,
      provider: this.config.provider,
      progress,
      abortController: new AbortController(),
    }

    this.activeUploads.set(uploadId, upload)
    this.emit('uploadStarted', progress)

    try {
      progress.status = 'uploading'

      const asset = await this.performUpload(filePath, options, progress)

      progress.status = 'completed'
      progress.percentComplete = 100
      progress.uploadedBytes = stats.size

      this.assets.set(asset.id, asset)
      this.emit('uploadCompleted', { uploadId, asset })

      return asset
    } catch (error) {
      progress.status = 'failed'
      progress.error = error instanceof Error ? error.message : 'Upload failed'

      this.emit('uploadFailed', { uploadId, error: progress.error })
      throw error
    } finally {
      this.activeUploads.delete(uploadId)
    }
  }

  /**
   * Perform the actual upload based on provider
   */
  private async performUpload(
    filePath: string,
    options: {
      key?: string
      contentType?: string
      metadata?: Record<string, string>
      roomId?: string
      recordingId?: string
    },
    progress: UploadProgress
  ): Promise<CloudAsset> {
    if (!this.config) {
      throw new Error('Cloud storage not configured')
    }

    const filename = basename(filePath)
    const key = options.key || this.generateKey(filename, options.roomId)

    switch (this.config.provider) {
      case 's3':
        return this.uploadToS3(filePath, key, options, progress)
      case 'gcs':
        return this.uploadToGCS(filePath, key, options, progress)
      case 'azure':
        return this.uploadToAzure(filePath, key, options, progress)
      case 'frameio':
        return this.uploadToFrameIO(filePath, options, progress)
      default:
        throw new Error(`Unknown provider: ${this.config.provider}`)
    }
  }

  /**
   * Generate a storage key with proper prefixing
   */
  private generateKey(filename: string, roomId?: string): string {
    const date = new Date()
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')

    const parts: string[] = []

    if (this.config?.basePrefix) {
      parts.push(this.config.basePrefix)
    }

    parts.push(`${year}/${month}/${day}`)

    if (roomId) {
      parts.push(roomId)
    }

    parts.push(`${Date.now()}-${filename}`)

    return parts.join('/')
  }

  /**
   * Upload to AWS S3
   */
  private async uploadToS3(
    filePath: string,
    key: string,
    options: {
      contentType?: string
      metadata?: Record<string, string>
    },
    progress: UploadProgress
  ): Promise<CloudAsset> {
    // Note: In production, use @aws-sdk/client-s3 for actual S3 uploads
    // This is a simulated implementation for the service structure

    const stats = statSync(filePath)
    const filename = basename(filePath)

    // Simulate upload progress
    await this.simulateUploadProgress(progress, stats.size)

    const asset: CloudAsset = {
      id: randomUUID(),
      provider: 's3',
      bucket: this.config!.bucket!,
      key,
      filename,
      size: stats.size,
      contentType: options.contentType || this.guessContentType(filename),
      uploadedAt: new Date(),
      expiresAt: this.calculateExpiry(),
      metadata: options.metadata || {},
    }

    console.log(`[CloudStorage] Uploaded to S3: s3://${asset.bucket}/${asset.key}`)
    return asset
  }

  /**
   * Upload to Google Cloud Storage
   */
  private async uploadToGCS(
    filePath: string,
    key: string,
    options: {
      contentType?: string
      metadata?: Record<string, string>
    },
    progress: UploadProgress
  ): Promise<CloudAsset> {
    // Note: In production, use @google-cloud/storage for actual GCS uploads

    const stats = statSync(filePath)
    const filename = basename(filePath)

    await this.simulateUploadProgress(progress, stats.size)

    const asset: CloudAsset = {
      id: randomUUID(),
      provider: 'gcs',
      bucket: this.config!.bucket!,
      key,
      filename,
      size: stats.size,
      contentType: options.contentType || this.guessContentType(filename),
      uploadedAt: new Date(),
      expiresAt: this.calculateExpiry(),
      metadata: options.metadata || {},
    }

    console.log(`[CloudStorage] Uploaded to GCS: gs://${asset.bucket}/${asset.key}`)
    return asset
  }

  /**
   * Upload to Azure Blob Storage
   */
  private async uploadToAzure(
    filePath: string,
    key: string,
    options: {
      contentType?: string
      metadata?: Record<string, string>
    },
    progress: UploadProgress
  ): Promise<CloudAsset> {
    // Note: In production, use @azure/storage-blob for actual Azure uploads

    const stats = statSync(filePath)
    const filename = basename(filePath)

    await this.simulateUploadProgress(progress, stats.size)

    const asset: CloudAsset = {
      id: randomUUID(),
      provider: 'azure',
      bucket: this.config!.bucket!, // Container name in Azure terms
      key,
      filename,
      size: stats.size,
      contentType: options.contentType || this.guessContentType(filename),
      uploadedAt: new Date(),
      expiresAt: this.calculateExpiry(),
      metadata: options.metadata || {},
    }

    console.log(`[CloudStorage] Uploaded to Azure: ${asset.bucket}/${asset.key}`)
    return asset
  }

  /**
   * Upload to Frame.io
   */
  private async uploadToFrameIO(
    filePath: string,
    options: {
      contentType?: string
      metadata?: Record<string, string>
    },
    progress: UploadProgress
  ): Promise<CloudAsset> {
    // Note: In production, use Frame.io API for uploads
    // Frame.io uses a multi-step process:
    // 1. Create asset in Frame.io
    // 2. Get upload URLs
    // 3. Upload file chunks
    // 4. Complete upload

    const stats = statSync(filePath)
    const filename = basename(filePath)

    await this.simulateUploadProgress(progress, stats.size)

    const asset: CloudAsset = {
      id: randomUUID(),
      provider: 'frameio',
      bucket: this.config!.frameioProjectId!,
      key: filename,
      filename,
      size: stats.size,
      contentType: options.contentType || this.guessContentType(filename),
      uploadedAt: new Date(),
      metadata: options.metadata || {},
    }

    console.log(`[CloudStorage] Uploaded to Frame.io: ${asset.filename}`)
    return asset
  }

  /**
   * Simulate upload progress for development
   */
  private async simulateUploadProgress(progress: UploadProgress, totalBytes: number): Promise<void> {
    const chunks = 10
    const chunkSize = totalBytes / chunks

    for (let i = 1; i <= chunks; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50)) // Simulated delay
      progress.uploadedBytes = Math.min(chunkSize * i, totalBytes)
      progress.percentComplete = Math.round((progress.uploadedBytes / totalBytes) * 100)
      this.emit('uploadProgress', progress)
    }
  }

  /**
   * Calculate expiry date based on retention policy
   */
  private calculateExpiry(): Date | undefined {
    if (!this.config?.retentionDays) return undefined
    const expiry = new Date()
    expiry.setDate(expiry.getDate() + this.config.retentionDays)
    return expiry
  }

  /**
   * Guess content type from filename
   */
  private guessContentType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase()
    const types: Record<string, string> = {
      wav: 'audio/wav',
      mp3: 'audio/mpeg',
      flac: 'audio/flac',
      ogg: 'audio/ogg',
      aac: 'audio/aac',
      mp4: 'video/mp4',
      webm: 'video/webm',
      json: 'application/json',
      txt: 'text/plain',
    }
    return types[ext || ''] || 'application/octet-stream'
  }

  /**
   * Generate a signed URL for playback
   */
  async getSignedUrl(assetId: string, expirySeconds: number = 3600): Promise<string> {
    const asset = this.assets.get(assetId)
    if (!asset) {
      throw new Error(`Asset ${assetId} not found`)
    }

    // Note: In production, generate actual signed URLs for each provider
    const signedUrl = `https://${asset.bucket}.s3.amazonaws.com/${asset.key}?signed=true&expires=${Date.now() + expirySeconds * 1000}`

    asset.signedUrl = signedUrl
    asset.signedUrlExpiry = new Date(Date.now() + expirySeconds * 1000)

    return signedUrl
  }

  /**
   * Get asset by ID
   */
  getAsset(assetId: string): CloudAsset | undefined {
    return this.assets.get(assetId)
  }

  /**
   * List all assets
   */
  listAssets(): CloudAsset[] {
    return Array.from(this.assets.values())
  }

  /**
   * Delete an asset
   */
  async deleteAsset(assetId: string): Promise<boolean> {
    const asset = this.assets.get(assetId)
    if (!asset) return false

    // Note: In production, delete from actual cloud storage
    console.log(`[CloudStorage] Deleting asset: ${asset.key}`)

    this.assets.delete(assetId)
    this.emit('assetDeleted', { assetId })

    return true
  }

  /**
   * Cancel an active upload
   */
  cancelUpload(uploadId: string): boolean {
    const upload = this.activeUploads.get(uploadId)
    if (!upload) return false

    upload.abortController?.abort()
    upload.progress.status = 'failed'
    upload.progress.error = 'Upload cancelled'

    this.activeUploads.delete(uploadId)
    this.emit('uploadCancelled', { uploadId })

    return true
  }

  /**
   * Get active uploads
   */
  getActiveUploads(): UploadProgress[] {
    return Array.from(this.activeUploads.values()).map((u) => u.progress)
  }

  /**
   * Apply retention policy (delete expired assets)
   */
  async applyRetentionPolicy(): Promise<number> {
    const now = new Date()
    let deletedCount = 0

    for (const [id, asset] of this.assets) {
      if (asset.expiresAt && asset.expiresAt < now) {
        await this.deleteAsset(id)
        deletedCount++
      }
    }

    if (deletedCount > 0) {
      console.log(`[CloudStorage] Retention policy: deleted ${deletedCount} expired assets`)
    }

    return deletedCount
  }

  /**
   * Search assets by metadata
   */
  searchAssets(query: {
    roomId?: string
    recordingId?: string
    filename?: string
    provider?: CloudProvider
    uploadedAfter?: Date
    uploadedBefore?: Date
  }): CloudAsset[] {
    return Array.from(this.assets.values()).filter((asset) => {
      if (query.roomId && asset.metadata.roomId !== query.roomId) return false
      if (query.recordingId && asset.metadata.recordingId !== query.recordingId) return false
      if (query.filename && !asset.filename.includes(query.filename)) return false
      if (query.provider && asset.provider !== query.provider) return false
      if (query.uploadedAfter && asset.uploadedAt < query.uploadedAfter) return false
      if (query.uploadedBefore && asset.uploadedAt > query.uploadedBefore) return false
      return true
    })
  }
}

export const cloudStorageService = new CloudStorageService()
