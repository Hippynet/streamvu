import { useState, useCallback, useRef } from 'react'
import { RundownItemType } from '@streamvu/shared'
import type { Rundown, RundownItem } from '@streamvu/shared'

/**
 * Show template for reusable rundown structures
 */
export interface ShowTemplate {
  id: string
  name: string
  description: string
  defaultDurationMin: number
  items: TemplateItem[]
  createdAt: string
  updatedAt: string
}

export interface TemplateItem {
  id: string
  title: string
  type: RundownItemType
  durationSec: number | null
  notes: string | null
  hostNotes: string | null
  order: number
}

/**
 * Segment tracking for live shows
 */
export interface SegmentTiming {
  itemId: string
  plannedDuration: number
  actualDuration: number
  variance: number // positive = over time, negative = under time
  startedAt: string | null
  endedAt: string | null
}

export interface ShowTiming {
  totalPlannedDuration: number
  totalActualDuration: number
  totalVariance: number
  currentSegmentIndex: number
  segmentTimings: SegmentTiming[]
  isOvertime: boolean
  estimatedEndTime: string | null
}

// Built-in show templates
export const DEFAULT_TEMPLATES: ShowTemplate[] = [
  {
    id: 'radio-show-1hr',
    name: '1 Hour Radio Show',
    description: 'Standard 1-hour radio broadcast format',
    defaultDurationMin: 60,
    items: [
      { id: '1', title: 'Show Open / Intro', type: RundownItemType.SEGMENT, durationSec: 120, notes: 'Theme music, show intro', hostNotes: 'Energy up!', order: 1 },
      { id: '2', title: 'News Headlines', type: RundownItemType.SEGMENT, durationSec: 180, notes: 'Top stories', hostNotes: null, order: 2 },
      { id: '3', title: 'Music Set 1', type: RundownItemType.MUSIC, durationSec: 600, notes: '3-4 songs', hostNotes: null, order: 3 },
      { id: '4', title: 'Break 1', type: RundownItemType.BREAK, durationSec: 180, notes: 'Ads/promos', hostNotes: null, order: 4 },
      { id: '5', title: 'Interview Segment', type: RundownItemType.INTERVIEW, durationSec: 600, notes: 'Guest interview', hostNotes: 'Prep questions', order: 5 },
      { id: '6', title: 'Music Set 2', type: RundownItemType.MUSIC, durationSec: 480, notes: '2-3 songs', hostNotes: null, order: 6 },
      { id: '7', title: 'Break 2', type: RundownItemType.BREAK, durationSec: 180, notes: 'Ads/promos', hostNotes: null, order: 7 },
      { id: '8', title: 'Feature Segment', type: RundownItemType.SEGMENT, durationSec: 480, notes: 'Weekly feature', hostNotes: null, order: 8 },
      { id: '9', title: 'Music Set 3', type: RundownItemType.MUSIC, durationSec: 420, notes: '2-3 songs', hostNotes: null, order: 9 },
      { id: '10', title: 'Show Close', type: RundownItemType.SEGMENT, durationSec: 180, notes: 'Wrap up, credits', hostNotes: 'Thank guests, preview next show', order: 10 },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'podcast-interview',
    name: 'Podcast Interview',
    description: 'Standard podcast interview format',
    defaultDurationMin: 45,
    items: [
      { id: '1', title: 'Cold Open / Teaser', type: RundownItemType.SEGMENT, durationSec: 60, notes: 'Interesting clip from interview', hostNotes: null, order: 1 },
      { id: '2', title: 'Intro', type: RundownItemType.SEGMENT, durationSec: 120, notes: 'Theme music, host intro', hostNotes: 'Introduce topic and guest', order: 2 },
      { id: '3', title: 'Guest Background', type: RundownItemType.INTERVIEW, durationSec: 300, notes: 'Guest introduction and background', hostNotes: null, order: 3 },
      { id: '4', title: 'Main Discussion', type: RundownItemType.INTERVIEW, durationSec: 1200, notes: 'Core interview content', hostNotes: 'Key questions list', order: 4 },
      { id: '5', title: 'Rapid Fire / Fun', type: RundownItemType.INTERVIEW, durationSec: 300, notes: 'Lighter questions', hostNotes: null, order: 5 },
      { id: '6', title: 'Wrap Up', type: RundownItemType.SEGMENT, durationSec: 180, notes: 'Guest plugs, CTA', hostNotes: 'Ask for social follows', order: 6 },
      { id: '7', title: 'Outro', type: RundownItemType.SEGMENT, durationSec: 60, notes: 'Closing music, credits', hostNotes: null, order: 7 },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'live-event',
    name: 'Live Event Coverage',
    description: 'Template for covering live events',
    defaultDurationMin: 120,
    items: [
      { id: '1', title: 'Pre-Show Setup', type: RundownItemType.NOTE, durationSec: null, notes: 'Tech check, comms check', hostNotes: null, order: 1 },
      { id: '2', title: 'Opening', type: RundownItemType.SEGMENT, durationSec: 180, notes: 'Welcome, set the scene', hostNotes: 'Location, atmosphere', order: 2 },
      { id: '3', title: 'Event Coverage', type: RundownItemType.SEGMENT, durationSec: 5400, notes: 'Main event', hostNotes: 'React to action', order: 3 },
      { id: '4', title: 'Half-time / Break Analysis', type: RundownItemType.SEGMENT, durationSec: 600, notes: 'Review first half', hostNotes: null, order: 4 },
      { id: '5', title: 'Second Half Coverage', type: RundownItemType.SEGMENT, durationSec: 5400, notes: 'Continue coverage', hostNotes: null, order: 5 },
      { id: '6', title: 'Post-Event Wrap', type: RundownItemType.SEGMENT, durationSec: 600, notes: 'Summary, reactions', hostNotes: 'Key moments', order: 6 },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]

interface UseShowPlanningOptions {
  rundown: Rundown | null
  onUpdateItem?: (itemId: string, updates: Partial<RundownItem>) => void
}

interface UseShowPlanningReturn {
  timing: ShowTiming
  templates: ShowTemplate[]
  startSegment: (itemId: string) => void
  endSegment: (itemId: string) => void
  getVarianceClass: (variance: number) => string
  formatDuration: (seconds: number) => string
  formatVariance: (seconds: number) => string
  calculateEstimatedEnd: () => Date | null
  exportRundown: () => string
  importTemplate: (template: ShowTemplate) => TemplateItem[]
}

/**
 * Hook for show planning and timing management
 */
export function useShowPlanning({
  rundown,
  onUpdateItem: _onUpdateItem,
}: UseShowPlanningOptions): UseShowPlanningReturn {
  const [segmentTimings, setSegmentTimings] = useState<Map<string, SegmentTiming>>(new Map())
  const segmentStartTimesRef = useRef<Map<string, Date>>(new Map())

  // Calculate total planned duration
  const totalPlannedDuration = rundown?.items.reduce(
    (sum, item) => sum + (item.durationSec || 0),
    0
  ) || 0

  // Calculate total actual duration from completed segments
  const totalActualDuration = Array.from(segmentTimings.values()).reduce(
    (sum, timing) => sum + timing.actualDuration,
    0
  )

  // Calculate current segment timing
  const currentItem = rundown?.items.find((item) => item.isCurrent)
  const currentSegmentIndex = currentItem
    ? rundown?.items.findIndex((item) => item.id === currentItem.id) || 0
    : -1

  // Note: Remaining duration is calculated directly in calculateEstimatedEnd

  // Calculate timing info
  const timing: ShowTiming = {
    totalPlannedDuration,
    totalActualDuration,
    totalVariance: totalActualDuration -
      (rundown?.items
        .filter((item) => segmentTimings.has(item.id))
        .reduce((sum, item) => sum + (item.durationSec || 0), 0) || 0),
    currentSegmentIndex,
    segmentTimings: rundown?.items.map((item) => ({
      itemId: item.id,
      plannedDuration: item.durationSec || 0,
      actualDuration: segmentTimings.get(item.id)?.actualDuration || 0,
      variance: segmentTimings.get(item.id)?.variance || 0,
      startedAt: segmentTimings.get(item.id)?.startedAt || null,
      endedAt: segmentTimings.get(item.id)?.endedAt || null,
    })) || [],
    isOvertime: totalActualDuration > totalPlannedDuration,
    estimatedEndTime: null,
  }

  const startSegment = useCallback((itemId: string) => {
    const now = new Date()
    segmentStartTimesRef.current.set(itemId, now)

    setSegmentTimings((prev) => {
      const updated = new Map(prev)
      const existing = updated.get(itemId) || {
        itemId,
        plannedDuration: rundown?.items.find((i) => i.id === itemId)?.durationSec || 0,
        actualDuration: 0,
        variance: 0,
        startedAt: null,
        endedAt: null,
      }
      updated.set(itemId, {
        ...existing,
        startedAt: now.toISOString(),
      })
      return updated
    })
  }, [rundown])

  const endSegment = useCallback((itemId: string) => {
    const now = new Date()
    const startTime = segmentStartTimesRef.current.get(itemId)

    if (startTime) {
      const actualDuration = Math.floor((now.getTime() - startTime.getTime()) / 1000)
      const plannedDuration = rundown?.items.find((i) => i.id === itemId)?.durationSec || 0
      const variance = actualDuration - plannedDuration

      setSegmentTimings((prev) => {
        const updated = new Map(prev)
        updated.set(itemId, {
          itemId,
          plannedDuration,
          actualDuration,
          variance,
          startedAt: startTime.toISOString(),
          endedAt: now.toISOString(),
        })
        return updated
      })

      segmentStartTimesRef.current.delete(itemId)
    }
  }, [rundown])

  const getVarianceClass = useCallback((variance: number): string => {
    if (variance === 0) return 'text-gray-400'
    if (variance > 60) return 'text-red-400' // More than 1 min over
    if (variance > 0) return 'text-yellow-400' // Slightly over
    if (variance < -60) return 'text-blue-400' // More than 1 min under
    return 'text-green-400' // Slightly under
  }, [])

  const formatDuration = useCallback((seconds: number): string => {
    if (seconds < 0) seconds = 0
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }, [])

  const formatVariance = useCallback((seconds: number): string => {
    const sign = seconds >= 0 ? '+' : ''
    return `${sign}${formatDuration(Math.abs(seconds))}`
  }, [formatDuration])

  const calculateEstimatedEnd = useCallback((): Date | null => {
    if (!rundown || currentSegmentIndex < 0) return null

    const now = new Date()
    const startTime = segmentStartTimesRef.current.get(rundown.items[currentSegmentIndex]?.id)

    if (!startTime) return null

    // Current segment elapsed
    const currentElapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000)
    const currentPlanned = rundown.items[currentSegmentIndex]?.durationSec || 0
    const currentRemaining = Math.max(0, currentPlanned - currentElapsed)

    // Remaining segments
    const remainingDuration = rundown.items
      .slice(currentSegmentIndex + 1)
      .reduce((sum, item) => sum + (item.durationSec || 0), 0)

    const totalRemaining = currentRemaining + remainingDuration
    return new Date(now.getTime() + totalRemaining * 1000)
  }, [rundown, currentSegmentIndex])

  const exportRundown = useCallback((): string => {
    if (!rundown) return ''

    const lines: string[] = [
      `# ${rundown.name}`,
      `Created: ${rundown.createdAt}`,
      '',
      '| # | Type | Title | Duration | Notes |',
      '|---|------|-------|----------|-------|',
    ]

    rundown.items.forEach((item, index) => {
      lines.push(
        `| ${index + 1} | ${item.type} | ${item.title} | ${formatDuration(item.durationSec || 0)} | ${item.notes || ''} |`
      )
    })

    lines.push('')
    lines.push(`Total Duration: ${formatDuration(totalPlannedDuration)}`)

    return lines.join('\n')
  }, [rundown, totalPlannedDuration, formatDuration])

  const importTemplate = useCallback((template: ShowTemplate): TemplateItem[] => {
    return template.items.map((item, index) => ({
      ...item,
      id: `${Date.now()}-${index}`,
    }))
  }, [])

  return {
    timing,
    templates: DEFAULT_TEMPLATES,
    startSegment,
    endSegment,
    getVarianceClass,
    formatDuration,
    formatVariance,
    calculateEstimatedEnd,
    exportRundown,
    importTemplate,
  }
}
