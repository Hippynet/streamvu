import { Router, type Router as RouterType } from 'express'
import multer from 'multer'
import { fileUploadService } from '../services/fileUpload.service.js'
import { authenticate, requireOrgRole } from '../middleware/auth.js'
import { OrgMemberRole } from '@streamvu/shared'
import type { ApiResponse, UploadedFile } from '@streamvu/shared'
import fs from 'fs/promises'

const router: RouterType = Router()

// Configure multer for memory storage (we'll write to disk ourselves)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max
  },
  fileFilter: (_req, file, cb) => {
    // Only allow audio files
    const allowedMimes = [
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

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`))
    }
  },
})

// List all files for the organization
router.get('/', authenticate, async (req, res, next) => {
  try {
    const files = await fileUploadService.listFiles(req.user!.organizationId)

    const response: ApiResponse<UploadedFile[]> = {
      success: true,
      data: files,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

// Upload a new file
router.post(
  '/',
  authenticate,
  requireOrgRole(OrgMemberRole.ADMIN, OrgMemberRole.OWNER, OrgMemberRole.MEMBER),
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded',
        })
      }

      const file = await fileUploadService.uploadFile(
        req.user!.organizationId,
        req.user!.sub,
        {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          buffer: req.file.buffer,
          size: req.file.size,
        }
      )

      const response: ApiResponse<UploadedFile> = {
        success: true,
        data: file,
      }
      res.status(201).json(response)
    } catch (error) {
      next(error)
    }
  }
)

// Get a single file
router.get('/:fileId', authenticate, async (req, res, next) => {
  try {
    const file = await fileUploadService.getFile(
      req.params.fileId as string,
      req.user!.organizationId
    )

    const response: ApiResponse<UploadedFile> = {
      success: true,
      data: file,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

// Delete a file (requires ADMIN or OWNER)
router.delete(
  '/:fileId',
  authenticate,
  requireOrgRole(OrgMemberRole.ADMIN, OrgMemberRole.OWNER),
  async (req, res, next) => {
    try {
      await fileUploadService.deleteFile(
        req.params.fileId as string,
        req.user!.organizationId
      )

      const response: ApiResponse = {
        success: true,
      }
      res.json(response)
    } catch (error) {
      next(error)
    }
  }
)

// Download a file (stream the actual file)
router.get('/:fileId/download', authenticate, async (req, res, next) => {
  try {
    const filePath = await fileUploadService.getFilePath(
      req.params.fileId as string,
      req.user!.organizationId
    )

    const file = await fileUploadService.getFile(
      req.params.fileId as string,
      req.user!.organizationId
    )

    // Set headers for download
    res.setHeader('Content-Type', file.mimeType)
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`)
    res.setHeader('Content-Length', file.size)

    // Stream the file
    const fileBuffer = await fs.readFile(filePath)
    res.send(fileBuffer)
  } catch (error) {
    next(error)
  }
})

// Get waveform data for a file (for visualization)
router.get('/:fileId/waveform', authenticate, async (req, res, next) => {
  try {
    // Verify file exists and belongs to organization
    await fileUploadService.getFile(
      req.params.fileId as string,
      req.user!.organizationId
    )

    // TODO: Generate waveform data using audiowaveform or similar
    // For now, return a placeholder
    const response: ApiResponse<{ peaks: number[] }> = {
      success: true,
      data: {
        peaks: [], // Would be filled with waveform peak data
      },
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

export default router
