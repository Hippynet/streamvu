import { Router, type Router as RouterType } from 'express'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middleware/auth.js'
import type { StartRecordingRequest, RecordingType, RecordingStatus } from '@streamvu/shared'

const router: RouterType = Router()

// All routes require authentication
router.use(authenticate)

// Get all recordings for a room
router.get('/rooms/:roomId/recordings', async (req, res) => {
  try {
    const { roomId } = req.params
    const userId = req.user!.sub

    // Verify room exists and user has access
    const room = await prisma.callRoom.findUnique({
      where: { id: roomId },
      include: {
        organization: {
          include: {
            members: { where: { userId } },
          },
        },
      },
    })

    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }

    // Check access
    const isMember = room.organization.members.length > 0
    const isCreator = room.createdById === userId
    if (!isMember && !isCreator) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const recordings = await prisma.recording.findMany({
      where: { roomId },
      orderBy: { startedAt: 'desc' },
    })

    res.json({
      recordings: recordings.map((recording) => ({
        ...recording,
        fileSize: recording.fileSize?.toString() || null,
        startedAt: recording.startedAt.toISOString(),
        endedAt: recording.endedAt?.toISOString() || null,
      })),
    })
  } catch (error) {
    console.error('Error getting recordings:', error)
    res.status(500).json({ error: 'Failed to get recordings' })
  }
})

// Start a recording
router.post('/rooms/:roomId/recordings', async (req, res) => {
  try {
    const { roomId } = req.params
    const { type, participantId, format, sampleRate, bitDepth, channels } = req.body as StartRecordingRequest
    const userId = req.user!.sub

    // Verify room exists and user is host/admin
    const room = await prisma.callRoom.findUnique({
      where: { id: roomId },
      include: {
        organization: {
          include: {
            members: { where: { userId } },
          },
        },
      },
    })

    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }

    // Check if user is host or admin
    const member = room.organization.members[0]
    const isHost = room.createdById === userId
    const isAdmin = member?.role === 'OWNER' || member?.role === 'ADMIN'

    if (!isHost && !isAdmin) {
      return res.status(403).json({ error: 'Only hosts and admins can start recordings' })
    }

    // For INDIVIDUAL type, participantId is required
    if (type === 'INDIVIDUAL' && !participantId) {
      return res.status(400).json({ error: 'participantId required for individual recordings' })
    }

    // Get participant name if individual
    let participantName: string | null = null
    if (type === 'INDIVIDUAL' && participantId) {
      const participant = await prisma.roomParticipant.findUnique({
        where: { id: participantId },
      })
      participantName = participant?.displayName || null
    }

    // Create the recording record
    const recording = await prisma.recording.create({
      data: {
        roomId,
        participantId: type === 'INDIVIDUAL' ? participantId : null,
        participantName,
        type: type as RecordingType,
        format: format || 'wav',
        sampleRate: sampleRate || 48000,
        bitDepth: bitDepth || 24,
        channels: channels || 2,
        status: 'RECORDING' as RecordingStatus,
        storageProvider: 'local',
      },
    })

    // TODO: In a real implementation, this would start the actual recording process
    // For now, we just create the database record

    res.status(201).json({
      recording: {
        ...recording,
        fileSize: recording.fileSize?.toString() || null,
        startedAt: recording.startedAt.toISOString(),
        endedAt: recording.endedAt?.toISOString() || null,
      },
    })
  } catch (error) {
    console.error('Error starting recording:', error)
    res.status(500).json({ error: 'Failed to start recording' })
  }
})

// Stop a recording
router.post('/recordings/:recordingId/stop', async (req, res) => {
  try {
    const { recordingId } = req.params
    const userId = req.user!.sub

    const recording = await prisma.recording.findUnique({
      where: { id: recordingId },
      include: {
        room: {
          include: {
            organization: {
              include: {
                members: { where: { userId } },
              },
            },
          },
        },
      },
    })

    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' })
    }

    // Check if user is host or admin
    const member = recording.room.organization.members[0]
    const isHost = recording.room.createdById === userId
    const isAdmin = member?.role === 'OWNER' || member?.role === 'ADMIN'

    if (!isHost && !isAdmin) {
      return res.status(403).json({ error: 'Only hosts and admins can stop recordings' })
    }

    if (recording.status !== 'RECORDING') {
      return res.status(400).json({ error: 'Recording is not active' })
    }

    // Update the recording status
    const updatedRecording = await prisma.recording.update({
      where: { id: recordingId },
      data: {
        status: 'PROCESSING',
        endedAt: new Date(),
        durationMs: Date.now() - recording.startedAt.getTime(),
      },
    })

    // TODO: In a real implementation, this would finalize the recording
    // and start post-processing (compression, uploading, etc.)

    res.json({
      recording: {
        ...updatedRecording,
        fileSize: updatedRecording.fileSize?.toString() || null,
        startedAt: updatedRecording.startedAt.toISOString(),
        endedAt: updatedRecording.endedAt?.toISOString() || null,
      },
    })
  } catch (error) {
    console.error('Error stopping recording:', error)
    res.status(500).json({ error: 'Failed to stop recording' })
  }
})

// Get a specific recording
router.get('/recordings/:recordingId', async (req, res) => {
  try {
    const { recordingId } = req.params
    const userId = req.user!.sub

    const recording = await prisma.recording.findUnique({
      where: { id: recordingId },
      include: {
        room: {
          include: {
            organization: {
              include: {
                members: { where: { userId } },
              },
            },
          },
        },
      },
    })

    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' })
    }

    // Check access
    const isMember = recording.room.organization.members.length > 0
    const isCreator = recording.room.createdById === userId
    if (!isMember && !isCreator) {
      return res.status(403).json({ error: 'Access denied' })
    }

    res.json({
      recording: {
        ...recording,
        fileSize: recording.fileSize?.toString() || null,
        startedAt: recording.startedAt.toISOString(),
        endedAt: recording.endedAt?.toISOString() || null,
        room: undefined, // Don't expose nested room
      },
    })
  } catch (error) {
    console.error('Error getting recording:', error)
    res.status(500).json({ error: 'Failed to get recording' })
  }
})

// Delete a recording
router.delete('/recordings/:recordingId', async (req, res) => {
  try {
    const { recordingId } = req.params
    const userId = req.user!.sub

    const recording = await prisma.recording.findUnique({
      where: { id: recordingId },
      include: {
        room: {
          include: {
            organization: {
              include: {
                members: { where: { userId } },
              },
            },
          },
        },
      },
    })

    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' })
    }

    // Check if user is host or admin
    const member = recording.room.organization.members[0]
    const isHost = recording.room.createdById === userId
    const isAdmin = member?.role === 'OWNER' || member?.role === 'ADMIN'

    if (!isHost && !isAdmin) {
      return res.status(403).json({ error: 'Only hosts and admins can delete recordings' })
    }

    // TODO: In a real implementation, this would also delete the actual file
    await prisma.recording.delete({ where: { id: recordingId } })

    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting recording:', error)
    res.status(500).json({ error: 'Failed to delete recording' })
  }
})

// Download a recording
router.get('/recordings/:recordingId/download', async (req, res) => {
  try {
    const { recordingId } = req.params
    const userId = req.user!.sub

    const recording = await prisma.recording.findUnique({
      where: { id: recordingId },
      include: {
        room: {
          include: {
            organization: {
              include: {
                members: { where: { userId } },
              },
            },
          },
        },
      },
    })

    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' })
    }

    // Check access
    const isMember = recording.room.organization.members.length > 0
    const isCreator = recording.room.createdById === userId
    if (!isMember && !isCreator) {
      return res.status(403).json({ error: 'Access denied' })
    }

    if (recording.status !== 'COMPLETED') {
      return res.status(400).json({ error: 'Recording is not ready for download' })
    }

    if (!recording.storagePath) {
      return res.status(404).json({ error: 'Recording file not found' })
    }

    // TODO: In a real implementation, this would return the actual file
    // For now, just return the storage path info
    res.json({
      downloadUrl: `/api/files/${recording.storagePath}`,
      filename: `${recording.room.name}-${recording.type}-${recording.startedAt.toISOString()}.${recording.format}`,
    })
  } catch (error) {
    console.error('Error downloading recording:', error)
    res.status(500).json({ error: 'Failed to download recording' })
  }
})

export default router
