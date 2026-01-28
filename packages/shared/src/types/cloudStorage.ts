/**
 * Cloud Storage Types
 *
 * Types for cloud storage configuration and file management
 * supporting S3, GCS, Azure, and Frame.io integrations.
 */

/** Supported cloud storage providers */
export type CloudStorageProvider = 's3' | 'gcs' | 'azure' | 'frameio'

/** Cloud storage configuration */
export interface CloudStorageConfig {
  id: string
  organizationId: string
  provider: CloudStorageProvider
  name: string
  enabled: boolean
  isDefault: boolean
  createdAt: string
  updatedAt: string
  // Provider-specific config stored separately for security
}

/** S3-specific configuration */
export interface S3Config {
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey?: string // Only returned when explicitly requested
  endpoint?: string // For S3-compatible services
  pathStyle?: boolean
  prefix?: string
}

/** Google Cloud Storage configuration */
export interface GCSConfig {
  bucket: string
  projectId: string
  credentials?: string // JSON key file content (masked)
  prefix?: string
}

/** Azure Blob Storage configuration */
export interface AzureConfig {
  containerName: string
  accountName: string
  accountKey?: string // Only returned when explicitly requested
  connectionString?: string
  prefix?: string
}

/** Frame.io configuration */
export interface FrameIOConfig {
  teamId: string
  projectId: string
  accessToken?: string // Only returned when explicitly requested
  rootAssetId?: string
}

/** Union type for provider configs */
export type ProviderConfig = S3Config | GCSConfig | AzureConfig | FrameIOConfig

/** Upload status */
export type UploadStatus =
  | 'pending'
  | 'uploading'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'

/** Cloud upload job */
export interface CloudUpload {
  id: string
  organizationId: string
  storageConfigId: string
  roomId?: string
  recordingId?: string
  filename: string
  originalFilename: string
  fileSize: number
  mimeType: string
  status: UploadStatus
  progress: number
  uploadedBytes: number
  remoteUrl?: string
  remotePath?: string
  error?: string
  metadata: CloudUploadMetadata
  createdAt: string
  startedAt?: string
  completedAt?: string
}

/** Metadata attached to cloud uploads */
export interface CloudUploadMetadata {
  roomName?: string
  roomId?: string
  participantName?: string
  participantId?: string
  recordingType?: 'individual' | 'mix'
  duration?: number
  format?: string
  codec?: string
  bitrate?: number
  channels?: number
  sampleRate?: number
  tags?: string[]
  customFields?: Record<string, string>
}

/** File retention policy */
export interface RetentionPolicy {
  id: string
  organizationId: string
  storageConfigId?: string
  name: string
  enabled: boolean
  retentionDays: number
  deleteAfterExpiry: boolean
  archiveAfterDays?: number
  archiveStorageClass?: string // e.g., 'GLACIER', 'COLDLINE'
  createdAt: string
  updatedAt: string
}

/** Storage usage statistics */
export interface StorageUsage {
  storageConfigId: string
  totalBytes: number
  totalFiles: number
  bytesThisMonth: number
  uploadsThisMonth: number
  oldestFile?: string
  newestFile?: string
  byType: {
    recordings: { bytes: number; count: number }
    transcriptions: { bytes: number; count: number }
    exports: { bytes: number; count: number }
    other: { bytes: number; count: number }
  }
}

/** Create storage config request */
export interface CreateStorageConfigRequest {
  provider: CloudStorageProvider
  name: string
  config: ProviderConfig
  enabled?: boolean
  isDefault?: boolean
}

/** Update storage config request */
export interface UpdateStorageConfigRequest {
  name?: string
  config?: Partial<ProviderConfig>
  enabled?: boolean
  isDefault?: boolean
}

/** Storage config list response */
export interface StorageConfigListResponse {
  configs: CloudStorageConfig[]
  total: number
}

/** Upload list response */
export interface CloudUploadListResponse {
  uploads: CloudUpload[]
  total: number
  page: number
  pageSize: number
}

/** Test storage connection request */
export interface TestStorageConnectionRequest {
  provider: CloudStorageProvider
  config: ProviderConfig
}

/** Test storage connection response */
export interface TestStorageConnectionResponse {
  success: boolean
  message: string
  latencyMs?: number
  permissions?: {
    read: boolean
    write: boolean
    delete: boolean
  }
}

/** Initiate upload request */
export interface InitiateUploadRequest {
  storageConfigId?: string // Use default if not specified
  filename: string
  fileSize: number
  mimeType: string
  metadata?: CloudUploadMetadata
}

/** Initiate upload response */
export interface InitiateUploadResponse {
  uploadId: string
  uploadUrl?: string // Pre-signed URL for direct upload
  method: 'direct' | 'multipart' | 'chunked'
  partSize?: number
  expiresAt?: string
}

/** Complete multipart upload request */
export interface CompleteMultipartUploadRequest {
  uploadId: string
  parts: Array<{
    partNumber: number
    etag: string
  }>
}

/** Upload progress event (for socket) */
export interface UploadProgressEvent {
  uploadId: string
  progress: number
  uploadedBytes: number
  totalBytes: number
  speed: number // bytes per second
  estimatedTimeRemaining: number // seconds
}
