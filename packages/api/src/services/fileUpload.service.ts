import { prisma } from '../lib/prisma.js'
import fs from 'fs/promises'
import path from 'path'
import { spawn } from 'child_process'
import type { UploadedFile } from '@streamvu/shared'

interface FFProbeMetadata {
  duration?: number
  title?: string
  artist?: string
  album?: string
}

/**
 * Extract audio metadata using ffprobe
 */
async function extractMetadataWithFFprobe(filePath: string): Promise<FFProbeMetadata> {
  return new Promise((resolve) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ])

    let stdout = ''
    let stderr = ''

    ffprobe.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    ffprobe.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    ffprobe.on('close', (code) => {
      if (code !== 0) {
        console.error('[FFProbe] Error extracting metadata:', stderr)
        resolve({}) // Return empty on error
        return
      }

      try {
        const data = JSON.parse(stdout)
        const format = data.format || {}
        const tags = format.tags || {}

        // Duration is in seconds
        const duration = format.duration ? parseFloat(format.duration) : undefined

        // Try different tag name variations (ID3v2, Vorbis, etc.)
        const title = tags.title || tags.TITLE || undefined
        const artist = tags.artist || tags.ARTIST || tags.album_artist || tags.ALBUM_ARTIST || undefined
        const album = tags.album || tags.ALBUM || undefined

        resolve({
          duration,
          title,
          artist,
          album,
        })
      } catch (err) {
        console.error('[FFProbe] Error parsing JSON:', err)
        resolve({})
      }
    })

    ffprobe.on('error', (err) => {
      console.error('[FFProbe] Process error:', err)
      resolve({}) // Return empty on error
    })
  })
}

// Define storage directory
const UPLOAD_DIR = process.env.FILE_STORAGE_PATH || path.join(process.cwd(), 'uploads')
const MAX_FILE_SIZE = parseInt(process.env.FILE_MAX_SIZE_MB || '100') * 1024 * 1024
const ALLOWED_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/flac',
  'audio/ogg',
  'audio/aac',
  'audio/mp4',
  'audio/x-m4a',
]

// Ensure upload directory exists
async function ensureUploadDir(orgId: string): Promise<string> {
  const orgDir = path.join(UPLOAD_DIR, orgId)
  await fs.mkdir(orgDir, { recursive: true })
  return orgDir
}

class FileUploadService {
  /**
   * Upload an audio file
   */
  async uploadFile(
    organizationId: string,
    userId: string,
    file: {
      originalname: string
      mimetype: string
      buffer: Buffer
      size: number
    }
  ): Promise<UploadedFile> {
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File size exceeds maximum allowed (${MAX_FILE_SIZE / 1024 / 1024}MB)`)
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new Error(`File type not allowed: ${file.mimetype}`)
    }

    // Create storage path
    const orgDir = await ensureUploadDir(organizationId)
    const timestamp = Date.now()
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storageName = `${timestamp}_${sanitizedName}`
    const storagePath = path.join(orgDir, storageName)

    // Write file to disk
    await fs.writeFile(storagePath, file.buffer)

    // Create database record
    const uploadedFile = await prisma.uploadedFile.create({
      data: {
        organizationId,
        filename: file.originalname,
        storagePath,
        mimeType: file.mimetype,
        size: file.size,
        uploadedById: userId,
        // Duration will be calculated later via ffprobe
        duration: null,
        title: null,
        artist: null,
        album: null,
      },
    })

    // Extract audio metadata using ffprobe in background (don't block upload response)
    extractMetadataWithFFprobe(storagePath)
      .then(async (metadata) => {
        if (Object.keys(metadata).length > 0) {
          await prisma.uploadedFile.update({
            where: { id: uploadedFile.id },
            data: {
              duration: metadata.duration ?? null,
              title: metadata.title ?? null,
              artist: metadata.artist ?? null,
              album: metadata.album ?? null,
            },
          })
          console.log(`[FileUpload] Metadata extracted for ${file.originalname}:`, metadata)
        }
      })
      .catch((err) => {
        console.error(`[FileUpload] Failed to extract metadata for ${file.originalname}:`, err)
      })

    return this.formatFile(uploadedFile)
  }

  /**
   * List files for an organization
   */
  async listFiles(organizationId: string): Promise<UploadedFile[]> {
    const files = await prisma.uploadedFile.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    })

    return files.map(this.formatFile)
  }

  /**
   * Get a single file
   */
  async getFile(fileId: string, organizationId: string): Promise<UploadedFile> {
    const file = await prisma.uploadedFile.findFirst({
      where: {
        id: fileId,
        organizationId,
      },
    })

    if (!file) {
      throw new Error('File not found')
    }

    return this.formatFile(file)
  }

  /**
   * Delete a file
   */
  async deleteFile(fileId: string, organizationId: string): Promise<void> {
    const file = await prisma.uploadedFile.findFirst({
      where: {
        id: fileId,
        organizationId,
      },
    })

    if (!file) {
      throw new Error('File not found')
    }

    // Check if file is in use
    const inUse = await prisma.audioSource.findFirst({
      where: { fileId },
    })

    if (inUse) {
      throw new Error('File is in use by an audio source')
    }

    // Delete from disk
    try {
      await fs.unlink(file.storagePath)
    } catch (err) {
      console.error('[FileUpload] Failed to delete file from disk:', err)
      // Continue with DB deletion even if file deletion fails
    }

    // Delete from database
    await prisma.uploadedFile.delete({
      where: { id: fileId },
    })
  }

  /**
   * Get file path for streaming/playback
   */
  async getFilePath(fileId: string, organizationId: string): Promise<string> {
    const file = await prisma.uploadedFile.findFirst({
      where: {
        id: fileId,
        organizationId,
      },
    })

    if (!file) {
      throw new Error('File not found')
    }

    // Verify file exists
    try {
      await fs.access(file.storagePath)
    } catch {
      throw new Error('File not found on disk')
    }

    return file.storagePath
  }

  /**
   * Update file metadata (after ffprobe extraction)
   */
  async updateMetadata(
    fileId: string,
    metadata: {
      duration?: number
      title?: string
      artist?: string
      album?: string
    }
  ): Promise<UploadedFile> {
    const file = await prisma.uploadedFile.update({
      where: { id: fileId },
      data: metadata,
    })

    return this.formatFile(file)
  }

  /**
   * Format database record to API response
   */
  private formatFile(file: {
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
    createdAt: Date
  }): UploadedFile {
    return {
      id: file.id,
      organizationId: file.organizationId,
      filename: file.filename,
      storagePath: file.storagePath,
      mimeType: file.mimeType,
      size: file.size,
      duration: file.duration,
      title: file.title,
      artist: file.artist,
      album: file.album,
      uploadedById: file.uploadedById,
      createdAt: file.createdAt.toISOString(),
    }
  }
}

export const fileUploadService = new FileUploadService()
