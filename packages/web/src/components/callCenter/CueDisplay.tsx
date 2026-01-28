import { useMemo } from 'react'
import type { CueType, RoomCue } from '@streamvu/shared'

interface CueDisplayProps {
  currentCue: RoomCue | null
  participantId?: string // If provided, only show cues targeted at this participant
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showText?: boolean
}

const SIZE_CLASSES = {
  sm: 'h-16 w-16',
  md: 'h-24 w-24',
  lg: 'h-32 w-32',
  xl: 'h-48 w-48',
}

const TEXT_SIZE_CLASSES = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
  xl: 'text-lg',
}

const CUE_COLORS: Record<CueType, { bg: string; glow: string; text: string }> = {
  OFF: {
    bg: 'bg-gray-700',
    glow: '',
    text: 'text-gray-500',
  },
  RED: {
    bg: 'bg-red-600',
    glow: 'shadow-[0_0_30px_10px_rgba(220,38,38,0.5)]',
    text: 'text-red-100',
  },
  YELLOW: {
    bg: 'bg-yellow-500',
    glow: 'shadow-[0_0_30px_10px_rgba(234,179,8,0.5)]',
    text: 'text-yellow-900',
  },
  GREEN: {
    bg: 'bg-green-500',
    glow: 'shadow-[0_0_30px_10px_rgba(34,197,94,0.5)]',
    text: 'text-green-100',
  },
  CUSTOM: {
    bg: 'bg-purple-600',
    glow: 'shadow-[0_0_30px_10px_rgba(147,51,234,0.5)]',
    text: 'text-purple-100',
  },
}

const CUE_LABELS: Record<CueType, string> = {
  OFF: '',
  RED: 'STOP',
  YELLOW: 'STAND BY',
  GREEN: 'GO',
  CUSTOM: '',
}

export function CueDisplay({
  currentCue,
  participantId,
  size = 'lg',
  showText = true,
}: CueDisplayProps) {
  // Determine if this cue applies to us
  const activeCue = useMemo(() => {
    if (!currentCue || currentCue.cueType === 'OFF') return null

    // If cue has a target, check if it's for us
    if (currentCue.targetParticipantId) {
      if (participantId && currentCue.targetParticipantId !== participantId) {
        return null // This cue is for someone else
      }
    }

    return currentCue
  }, [currentCue, participantId])

  const cueType = activeCue?.cueType || 'OFF'
  const colors = CUE_COLORS[cueType]
  const label = cueType === 'CUSTOM' ? activeCue?.cueText : CUE_LABELS[cueType]

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Traffic Light */}
      <div
        className={`
          ${SIZE_CLASSES[size]}
          ${colors.bg}
          ${activeCue ? colors.glow : ''}
          rounded-full
          flex items-center justify-center
          transition-all duration-200
          ${activeCue ? 'animate-pulse' : ''}
        `}
      >
        {activeCue && showText && (
          <span className={`font-bold ${colors.text} ${TEXT_SIZE_CLASSES[size]} text-center px-2`}>
            {label}
          </span>
        )}
      </div>

      {/* Cue Text Below (for custom cues or when text is longer) */}
      {activeCue && showText && cueType === 'CUSTOM' && activeCue.cueText && (
        <div className={`${colors.text} font-semibold ${TEXT_SIZE_CLASSES[size]} text-center max-w-[200px]`}>
          {activeCue.cueText}
        </div>
      )}

      {/* Status indicator */}
      {!activeCue && (
        <span className="text-xs text-gray-500">No active cue</span>
      )}
    </div>
  )
}

// Full-screen traffic light for talent view
export function TrafficLightDisplay({
  currentCue,
  participantId,
}: {
  currentCue: RoomCue | null
  participantId?: string
}) {
  // Determine if this cue applies to us
  const activeCue = useMemo(() => {
    if (!currentCue || currentCue.cueType === 'OFF') return null

    if (currentCue.targetParticipantId) {
      if (participantId && currentCue.targetParticipantId !== participantId) {
        return null
      }
    }

    return currentCue
  }, [currentCue, participantId])

  const cueType = activeCue?.cueType || 'OFF'
  const colors = CUE_COLORS[cueType]
  const label = cueType === 'CUSTOM' ? activeCue?.cueText : CUE_LABELS[cueType]

  return (
    <div
      className={`
        fixed inset-0 z-50 flex flex-col items-center justify-center
        ${activeCue ? colors.bg : 'bg-gray-900'}
        transition-colors duration-300
      `}
    >
      {/* Large Traffic Light Circle */}
      <div
        className={`
          w-64 h-64 md:w-96 md:h-96
          rounded-full
          ${activeCue ? 'bg-white/20' : 'bg-gray-800'}
          flex items-center justify-center
          ${activeCue ? 'animate-pulse' : ''}
        `}
      >
        <span
          className={`
            text-4xl md:text-6xl font-bold text-center
            ${activeCue ? 'text-white' : 'text-gray-600'}
          `}
        >
          {activeCue ? label : 'STANDBY'}
        </span>
      </div>

      {/* Custom cue text below */}
      {activeCue && cueType === 'CUSTOM' && activeCue.cueText && (
        <div className="mt-8 text-3xl md:text-5xl font-bold text-white text-center max-w-2xl px-4">
          {activeCue.cueText}
        </div>
      )}

      {/* Cue type badge */}
      {activeCue && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <span className="text-white/70 text-sm uppercase tracking-wider">
            {cueType} CUE
          </span>
        </div>
      )}
    </div>
  )
}

// Compact inline cue indicator
export function CueIndicator({
  currentCue,
  participantId,
}: {
  currentCue: RoomCue | null
  participantId?: string
}) {
  const activeCue = useMemo(() => {
    if (!currentCue || currentCue.cueType === 'OFF') return null

    if (currentCue.targetParticipantId) {
      if (participantId && currentCue.targetParticipantId !== participantId) {
        return null
      }
    }

    return currentCue
  }, [currentCue, participantId])

  if (!activeCue) return null

  const cueType = activeCue.cueType
  const colors = CUE_COLORS[cueType]
  const label = cueType === 'CUSTOM' ? activeCue.cueText : CUE_LABELS[cueType]

  return (
    <div
      className={`
        inline-flex items-center gap-2 px-3 py-1.5 rounded-full
        ${colors.bg} ${colors.text}
        animate-pulse
      `}
    >
      <div className="w-3 h-3 rounded-full bg-current opacity-80" />
      <span className="text-sm font-semibold">{label}</span>
    </div>
  )
}
