import { Router, type Router as RouterType } from 'express'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middleware/auth.js'
import type { CreateRundownRequest, AddRundownItemRequest, UpdateRundownItemRequest } from '@streamvu/shared'

const router: RouterType = Router()

// All routes require authentication
router.use(authenticate)

// Get rundown for a room
router.get('/rooms/:roomId/rundown', async (req, res) => {
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

    const rundown = await prisma.rundown.findUnique({
      where: { roomId },
      include: {
        items: { orderBy: { order: 'asc' } },
      },
    })

    if (!rundown) {
      return res.json({ rundown: null })
    }

    res.json({
      rundown: {
        ...rundown,
        createdAt: rundown.createdAt.toISOString(),
        updatedAt: rundown.updatedAt.toISOString(),
        items: rundown.items.map((item) => ({
          ...item,
          actualStartAt: item.actualStartAt?.toISOString() || null,
          actualEndAt: item.actualEndAt?.toISOString() || null,
        })),
      },
    })
  } catch (error) {
    console.error('Error getting rundown:', error)
    res.status(500).json({ error: 'Failed to get rundown' })
  }
})

// Create rundown for a room
router.post('/rooms/:roomId/rundown', async (req, res) => {
  try {
    const { roomId } = req.params
    const { name, items } = req.body as CreateRundownRequest
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
      return res.status(403).json({ error: 'Only hosts and admins can create rundowns' })
    }

    // Check if rundown already exists
    const existing = await prisma.rundown.findUnique({ where: { roomId } })
    if (existing) {
      return res.status(400).json({ error: 'Rundown already exists for this room' })
    }

    // Create rundown with items
    const rundown = await prisma.rundown.create({
      data: {
        roomId,
        name,
        items: items
          ? {
              create: items.map((item, index) => ({
                order: index,
                title: item.title,
                durationSec: item.durationSec || null,
                notes: item.notes || null,
                hostNotes: item.hostNotes || null,
                type: item.type || 'SEGMENT',
              })),
            }
          : undefined,
      },
      include: {
        items: { orderBy: { order: 'asc' } },
      },
    })

    res.status(201).json({
      rundown: {
        ...rundown,
        createdAt: rundown.createdAt.toISOString(),
        updatedAt: rundown.updatedAt.toISOString(),
        items: rundown.items.map((item) => ({
          ...item,
          actualStartAt: item.actualStartAt?.toISOString() || null,
          actualEndAt: item.actualEndAt?.toISOString() || null,
        })),
      },
    })
  } catch (error) {
    console.error('Error creating rundown:', error)
    res.status(500).json({ error: 'Failed to create rundown' })
  }
})

// Delete rundown for a room
router.delete('/rooms/:roomId/rundown', async (req, res) => {
  try {
    const { roomId } = req.params
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

    const member = room.organization.members[0]
    const isHost = room.createdById === userId
    const isAdmin = member?.role === 'OWNER' || member?.role === 'ADMIN'

    if (!isHost && !isAdmin) {
      return res.status(403).json({ error: 'Only hosts and admins can delete rundowns' })
    }

    await prisma.rundown.delete({ where: { roomId } })
    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting rundown:', error)
    res.status(500).json({ error: 'Failed to delete rundown' })
  }
})

// Add item to rundown
router.post('/rooms/:roomId/rundown/items', async (req, res) => {
  try {
    const { roomId } = req.params
    const { title, durationSec, notes, hostNotes, type, order } = req.body as AddRundownItemRequest

    const rundown = await prisma.rundown.findUnique({
      where: { roomId },
      include: { items: { orderBy: { order: 'desc' }, take: 1 } },
    })

    if (!rundown) {
      return res.status(404).json({ error: 'Rundown not found' })
    }

    // Calculate order - either specified or add at end
    const itemOrder = order ?? (rundown.items[0]?.order ?? -1) + 1

    // If inserting in middle, shift existing items
    if (order !== undefined) {
      await prisma.rundownItem.updateMany({
        where: { rundownId: rundown.id, order: { gte: order } },
        data: { order: { increment: 1 } },
      })
    }

    const item = await prisma.rundownItem.create({
      data: {
        rundownId: rundown.id,
        order: itemOrder,
        title,
        durationSec: durationSec || null,
        notes: notes || null,
        hostNotes: hostNotes || null,
        type: type || 'SEGMENT',
      },
    })

    res.status(201).json({
      item: {
        ...item,
        actualStartAt: item.actualStartAt?.toISOString() || null,
        actualEndAt: item.actualEndAt?.toISOString() || null,
      },
    })
  } catch (error) {
    console.error('Error adding rundown item:', error)
    res.status(500).json({ error: 'Failed to add item' })
  }
})

// Update rundown item
router.patch('/rundown/items/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params
    const { title, durationSec, notes, hostNotes, type, order } = req.body as UpdateRundownItemRequest

    const existingItem = await prisma.rundownItem.findUnique({
      where: { id: itemId },
      include: { rundown: true },
    })

    if (!existingItem) {
      return res.status(404).json({ error: 'Item not found' })
    }

    // Handle reordering
    if (order !== undefined && order !== existingItem.order) {
      const oldOrder = existingItem.order
      const newOrder = order

      if (newOrder > oldOrder) {
        // Moving down: shift items between old and new position up
        await prisma.rundownItem.updateMany({
          where: {
            rundownId: existingItem.rundownId,
            order: { gt: oldOrder, lte: newOrder },
          },
          data: { order: { decrement: 1 } },
        })
      } else {
        // Moving up: shift items between new and old position down
        await prisma.rundownItem.updateMany({
          where: {
            rundownId: existingItem.rundownId,
            order: { gte: newOrder, lt: oldOrder },
          },
          data: { order: { increment: 1 } },
        })
      }
    }

    const item = await prisma.rundownItem.update({
      where: { id: itemId },
      data: {
        title: title ?? undefined,
        durationSec: durationSec !== undefined ? durationSec : undefined,
        notes: notes !== undefined ? notes : undefined,
        hostNotes: hostNotes !== undefined ? hostNotes : undefined,
        type: type ?? undefined,
        order: order ?? undefined,
      },
    })

    res.json({
      item: {
        ...item,
        actualStartAt: item.actualStartAt?.toISOString() || null,
        actualEndAt: item.actualEndAt?.toISOString() || null,
      },
    })
  } catch (error) {
    console.error('Error updating rundown item:', error)
    res.status(500).json({ error: 'Failed to update item' })
  }
})

// Delete rundown item
router.delete('/rundown/items/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params

    const item = await prisma.rundownItem.findUnique({
      where: { id: itemId },
    })

    if (!item) {
      return res.status(404).json({ error: 'Item not found' })
    }

    // Delete and reorder remaining items
    await prisma.$transaction([
      prisma.rundownItem.delete({ where: { id: itemId } }),
      prisma.rundownItem.updateMany({
        where: { rundownId: item.rundownId, order: { gt: item.order } },
        data: { order: { decrement: 1 } },
      }),
    ])

    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting rundown item:', error)
    res.status(500).json({ error: 'Failed to delete item' })
  }
})

export default router
