/**
 * Session Templates API Routes
 *
 * CRUD operations for mixer session templates.
 */

import { Router, type Router as RouterType } from 'express'
import { z } from 'zod'
import { authenticate } from '../middleware/auth.js'
import { prisma } from '../lib/prisma.js'
import type { ApiResponse, SessionTemplate } from '@streamvu/shared'

const router: RouterType = Router()

// Validation schemas
const channelTemplateSchema = z.object({
  label: z.string(),
  inputGain: z.number(),
  eq: z.object({
    hpfEnabled: z.boolean(),
    hpfFreq: z.number(),
    lowGain: z.number(),
    lowFreq: z.number(),
    midGain: z.number(),
    midFreq: z.number(),
    midQ: z.number(),
    highGain: z.number(),
    highFreq: z.number(),
  }),
  compressor: z.object({
    enabled: z.boolean(),
    threshold: z.number(),
    ratio: z.number(),
    attack: z.number(),
    release: z.number(),
    makeupGain: z.number(),
  }),
  ducking: z.object({
    sourceType: z.enum(['voice', 'music', 'sfx', 'none']),
    enabled: z.boolean(),
    amount: z.number(),
    threshold: z.number(),
    attack: z.number(),
    release: z.number(),
  }),
  auxSends: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  pan: z.number(),
  fader: z.number(),
  mute: z.boolean(),
  busAssignment: z.array(z.string()),
})

const masterTemplateSchema = z.object({
  pgmFader: z.number(),
  pgmMute: z.boolean(),
  tbFader: z.number(),
  tbMute: z.boolean(),
  auxMasters: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  limiterEnabled: z.boolean(),
  limiterThreshold: z.number(),
  monitorSource: z.string(),
  monitorLevel: z.number(),
})

const templateConfigSchema = z.object({
  channels: z.array(channelTemplateSchema),
  master: masterTemplateSchema,
  returnFeedUrl: z.string().optional(),
})

const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  category: z.enum(['SPORTS', 'INTERVIEW', 'PANEL', 'MUSIC', 'NEWS', 'CUSTOM']).optional(),
  config: templateConfigSchema,
})

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  category: z.enum(['SPORTS', 'INTERVIEW', 'PANEL', 'MUSIC', 'NEWS', 'CUSTOM']).optional(),
  config: templateConfigSchema.optional(),
})

router.use(authenticate)

// List all templates for the organization
router.get('/', async (req, res, next) => {
  try {
    const templates = await prisma.sessionTemplate.findMany({
      where: { organizationId: req.user!.organizationId },
      orderBy: [
        { isBuiltIn: 'desc' },
        { category: 'asc' },
        { name: 'asc' },
      ],
    })

    const response: ApiResponse<SessionTemplate[]> = {
      success: true,
      data: templates.map(t => ({
        ...t,
        config: t.config as unknown as SessionTemplate['config'],
        category: t.category as SessionTemplate['category'],
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

// Get a specific template
router.get('/:id', async (req, res, next) => {
  try {
    const template = await prisma.sessionTemplate.findFirst({
      where: {
        id: req.params.id,
        organizationId: req.user!.organizationId,
      },
    })

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      })
    }

    const response: ApiResponse<SessionTemplate> = {
      success: true,
      data: {
        ...template,
        config: template.config as unknown as SessionTemplate['config'],
        category: template.category as SessionTemplate['category'],
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString(),
      },
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

// Create a new template
router.post('/', async (req, res, next) => {
  try {
    const data = createTemplateSchema.parse(req.body)

    // Check for duplicate name
    const existing = await prisma.sessionTemplate.findFirst({
      where: {
        organizationId: req.user!.organizationId,
        name: data.name,
      },
    })

    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'A template with this name already exists',
      })
    }

    const template = await prisma.sessionTemplate.create({
      data: {
        organizationId: req.user!.organizationId,
        name: data.name,
        description: data.description || null,
        category: data.category || 'CUSTOM',
        config: data.config,
        channelCount: data.config.channels.length,
        createdById: req.user!.sub,
        isBuiltIn: false,
      },
    })

    const response: ApiResponse<SessionTemplate> = {
      success: true,
      data: {
        ...template,
        config: template.config as unknown as SessionTemplate['config'],
        category: template.category as SessionTemplate['category'],
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString(),
      },
    }
    res.status(201).json(response)
  } catch (error) {
    next(error)
  }
})

// Update a template
router.put('/:id', async (req, res, next) => {
  try {
    const data = updateTemplateSchema.parse(req.body)

    // Find the template
    const existing = await prisma.sessionTemplate.findFirst({
      where: {
        id: req.params.id,
        organizationId: req.user!.organizationId,
      },
    })

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      })
    }

    // Cannot modify built-in templates
    if (existing.isBuiltIn) {
      return res.status(403).json({
        success: false,
        error: 'Cannot modify built-in templates',
      })
    }

    // Check for duplicate name (if name is being changed)
    if (data.name && data.name !== existing.name) {
      const duplicate = await prisma.sessionTemplate.findFirst({
        where: {
          organizationId: req.user!.organizationId,
          name: data.name,
          id: { not: req.params.id },
        },
      })

      if (duplicate) {
        return res.status(409).json({
          success: false,
          error: 'A template with this name already exists',
        })
      }
    }

    const template = await prisma.sessionTemplate.update({
      where: { id: req.params.id },
      data: {
        name: data.name,
        description: data.description,
        category: data.category,
        config: data.config,
        channelCount: data.config?.channels.length,
      },
    })

    const response: ApiResponse<SessionTemplate> = {
      success: true,
      data: {
        ...template,
        config: template.config as unknown as SessionTemplate['config'],
        category: template.category as SessionTemplate['category'],
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString(),
      },
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

// Delete a template
router.delete('/:id', async (req, res, next) => {
  try {
    const template = await prisma.sessionTemplate.findFirst({
      where: {
        id: req.params.id,
        organizationId: req.user!.organizationId,
      },
    })

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      })
    }

    // Cannot delete built-in templates
    if (template.isBuiltIn) {
      return res.status(403).json({
        success: false,
        error: 'Cannot delete built-in templates',
      })
    }

    await prisma.sessionTemplate.delete({
      where: { id: req.params.id },
    })

    res.status(204).send()
  } catch (error) {
    next(error)
  }
})

// Duplicate a template
router.post('/:id/duplicate', async (req, res, next) => {
  try {
    const source = await prisma.sessionTemplate.findFirst({
      where: {
        id: req.params.id,
        organizationId: req.user!.organizationId,
      },
    })

    if (!source) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      })
    }

    // Generate unique name
    let newName = `${source.name} (Copy)`
    let counter = 1
    while (true) {
      const existing = await prisma.sessionTemplate.findFirst({
        where: {
          organizationId: req.user!.organizationId,
          name: newName,
        },
      })
      if (!existing) break
      counter++
      newName = `${source.name} (Copy ${counter})`
    }

    const template = await prisma.sessionTemplate.create({
      data: {
        organizationId: req.user!.organizationId,
        name: newName,
        description: source.description,
        category: source.category,
        config: source.config!,
        channelCount: source.channelCount,
        createdById: req.user!.sub,
        isBuiltIn: false,
      },
    })

    const response: ApiResponse<SessionTemplate> = {
      success: true,
      data: {
        ...template,
        config: template.config as unknown as SessionTemplate['config'],
        category: template.category as SessionTemplate['category'],
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString(),
      },
    }
    res.status(201).json(response)
  } catch (error) {
    next(error)
  }
})

export default router
