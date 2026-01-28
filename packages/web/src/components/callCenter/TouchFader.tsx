/**
 * Touch Fader Component
 *
 * A touch-friendly fader control optimized for mobile and tablet devices.
 * Supports both touch and mouse interactions with visual feedback.
 */

import { useRef, useState, useCallback, useEffect } from 'react'

interface TouchFaderProps {
  value: number // 0-1 normalized value
  min?: number
  max?: number
  step?: number
  height?: number // Fader track height in px
  label?: string
  showValue?: boolean
  formatValue?: (value: number) => string
  onChange?: (value: number) => void
  onChangeEnd?: (value: number) => void
  disabled?: boolean
  className?: string
  orientation?: 'vertical' | 'horizontal'
  // Touch-specific options
  touchSensitivity?: number // Movement multiplier
  hapticFeedback?: boolean
}

export function TouchFader({
  value,
  min = 0,
  max = 2,
  step = 0.01,
  height = 120,
  label,
  showValue = true,
  formatValue = (v) => `${Math.round((v / max) * 100)}%`,
  onChange,
  onChangeEnd,
  disabled = false,
  className = '',
  orientation = 'vertical',
  touchSensitivity = 1.5,
  hapticFeedback = true,
}: TouchFaderProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [startY, setStartY] = useState(0)
  const [startValue, setStartValue] = useState(value)

  // Clamp value to min/max
  const clampValue = useCallback((v: number) => {
    const clamped = Math.max(min, Math.min(max, v))
    // Snap to step
    return Math.round(clamped / step) * step
  }, [min, max, step])

  // Calculate fill percentage
  const fillPercent = ((value - min) / (max - min)) * 100

  // Trigger haptic feedback if supported
  const triggerHaptic = useCallback(() => {
    if (hapticFeedback && 'vibrate' in navigator) {
      navigator.vibrate(5)
    }
  }, [hapticFeedback])

  // Handle touch/pointer start
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled) return

    e.preventDefault()
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)

    setIsDragging(true)
    setStartY(e.clientY)
    setStartValue(value)
    triggerHaptic()
  }, [disabled, value, triggerHaptic])

  // Handle touch/pointer move
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging || disabled) return

    const deltaY = startY - e.clientY // Inverted: up = increase
    const trackHeight = trackRef.current?.clientHeight || height
    const deltaValue = (deltaY / trackHeight) * (max - min) * touchSensitivity

    const newValue = clampValue(startValue + deltaValue)
    onChange?.(newValue)
  }, [isDragging, disabled, startY, startValue, height, min, max, touchSensitivity, clampValue, onChange])

  // Handle touch/pointer end
  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (isDragging) {
      const target = e.currentTarget as HTMLElement
      target.releasePointerCapture(e.pointerId)

      setIsDragging(false)
      onChangeEnd?.(value)
    }
  }, [isDragging, value, onChangeEnd])

  // Handle direct tap on track
  const handleTrackClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled || isDragging) return

    const rect = e.currentTarget.getBoundingClientRect()
    const clickY = e.clientY - rect.top
    const percent = 1 - (clickY / rect.height) // Inverted for vertical
    const newValue = clampValue(min + percent * (max - min))

    onChange?.(newValue)
    onChangeEnd?.(newValue)
    triggerHaptic()
  }, [disabled, isDragging, min, max, clampValue, onChange, onChangeEnd, triggerHaptic])

  // Keyboard support
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) return

    let newValue = value
    const largeStep = (max - min) * 0.1

    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        newValue = clampValue(value + step)
        break
      case 'ArrowDown':
      case 'ArrowLeft':
        newValue = clampValue(value - step)
        break
      case 'PageUp':
        newValue = clampValue(value + largeStep)
        break
      case 'PageDown':
        newValue = clampValue(value - largeStep)
        break
      case 'Home':
        newValue = max
        break
      case 'End':
        newValue = min
        break
      default:
        return
    }

    e.preventDefault()
    onChange?.(newValue)
    onChangeEnd?.(newValue)
  }, [disabled, value, min, max, step, clampValue, onChange, onChangeEnd])

  // Double-tap to reset to unity (100%)
  const lastTapRef = useRef(0)
  const handleDoubleTap = useCallback((e: React.PointerEvent) => {
    if (disabled) return

    const now = Date.now()
    if (now - lastTapRef.current < 300) {
      // Reset to unity (1.0)
      const unityValue = clampValue(1.0)
      onChange?.(unityValue)
      onChangeEnd?.(unityValue)
      triggerHaptic()
      e.preventDefault()
    }
    lastTapRef.current = now
  }, [disabled, clampValue, onChange, onChangeEnd, triggerHaptic])

  // Prevent context menu on long press
  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    const preventContextMenu = (e: Event) => {
      if (isDragging) {
        e.preventDefault()
      }
    }

    track.addEventListener('contextmenu', preventContextMenu)
    return () => track.removeEventListener('contextmenu', preventContextMenu)
  }, [isDragging])

  return (
    <div
      className={`flex flex-col items-center ${orientation === 'horizontal' ? 'flex-row' : ''} ${className}`}
    >
      {/* Label */}
      {label && (
        <div className="mb-1 text-xs text-gray-400">{label}</div>
      )}

      {/* Fader Track */}
      <div
        ref={trackRef}
        className={`relative rounded-full cursor-pointer select-none touch-none ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
        style={{
          height: orientation === 'vertical' ? height : 12,
          width: orientation === 'vertical' ? 32 : height,
          backgroundColor: 'var(--bg-dark, #111)',
          border: '1px solid var(--border-default, #2a2a2a)',
        }}
        onClick={handleTrackClick}
        onPointerDown={(e) => {
          handleDoubleTap(e)
          handlePointerDown(e)
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        tabIndex={disabled ? -1 : 0}
        role="slider"
        aria-label={label || 'Fader'}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-disabled={disabled}
        aria-orientation={orientation}
      >
        {/* Fill track */}
        <div
          className="absolute rounded-full transition-all duration-75"
          style={{
            backgroundColor: isDragging ? 'var(--accent-primary, #3b82f6)' : 'var(--meter-green, #00cc44)',
            ...(orientation === 'vertical'
              ? {
                  bottom: 2,
                  left: 2,
                  right: 2,
                  height: `calc(${fillPercent}% - 4px)`,
                }
              : {
                  top: 2,
                  bottom: 2,
                  left: 2,
                  width: `calc(${fillPercent}% - 4px)`,
                }),
          }}
        />

        {/* Unity mark (100%) */}
        <div
          className="absolute bg-white/30"
          style={{
            ...(orientation === 'vertical'
              ? {
                  bottom: `${((1 - min) / (max - min)) * 100}%`,
                  left: 4,
                  right: 4,
                  height: 2,
                }
              : {
                  left: `${((1 - min) / (max - min)) * 100}%`,
                  top: 4,
                  bottom: 4,
                  width: 2,
                }),
          }}
        />

        {/* Thumb */}
        <div
          className={`absolute rounded transition-transform ${
            isDragging ? 'scale-125' : ''
          }`}
          style={{
            backgroundColor: isDragging ? '#fff' : '#aaa',
            boxShadow: isDragging ? '0 0 8px rgba(59, 130, 246, 0.5)' : '0 1px 3px rgba(0,0,0,0.3)',
            ...(orientation === 'vertical'
              ? {
                  bottom: `calc(${fillPercent}% - 10px)`,
                  left: '50%',
                  transform: `translateX(-50%) ${isDragging ? 'scale(1.25)' : ''}`,
                  width: 24,
                  height: 20,
                  borderRadius: 3,
                }
              : {
                  left: `calc(${fillPercent}% - 10px)`,
                  top: '50%',
                  transform: `translateY(-50%) ${isDragging ? 'scale(1.25)' : ''}`,
                  width: 20,
                  height: 24,
                  borderRadius: 3,
                }),
          }}
        >
          {/* Thumb grip lines */}
          <div className="absolute inset-1 flex flex-col justify-center gap-0.5">
            <div className="h-px bg-gray-600" />
            <div className="h-px bg-gray-600" />
            <div className="h-px bg-gray-600" />
          </div>
        </div>
      </div>

      {/* Value display */}
      {showValue && (
        <div className={`mt-1 text-xs font-mono ${isDragging ? 'text-white' : 'text-gray-400'}`}>
          {formatValue(value)}
        </div>
      )}
    </div>
  )
}

/**
 * Touch-friendly pan knob
 */
interface TouchPanKnobProps {
  value: number // -1 to 1
  onChange?: (value: number) => void
  onChangeEnd?: (value: number) => void
  disabled?: boolean
  size?: number
  className?: string
}

export function TouchPanKnob({
  value,
  onChange,
  onChangeEnd,
  disabled = false,
  size = 48,
  className = '',
}: TouchPanKnobProps) {
  const knobRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [startValue, setStartValue] = useState(value)

  const clampValue = useCallback((v: number) => {
    return Math.max(-1, Math.min(1, Math.round(v * 100) / 100))
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled) return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setIsDragging(true)
    setStartX(e.clientX)
    setStartValue(value)
  }, [disabled, value])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging || disabled) return
    const deltaX = e.clientX - startX
    const deltaValue = (deltaX / 100) // 100px = full range
    const newValue = clampValue(startValue + deltaValue)
    onChange?.(newValue)
  }, [isDragging, disabled, startX, startValue, clampValue, onChange])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (isDragging) {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
      setIsDragging(false)
      onChangeEnd?.(value)
    }
  }, [isDragging, value, onChangeEnd])

  // Double-tap to center
  const lastTapRef = useRef(0)
  const handleDoubleTap = useCallback(() => {
    if (disabled) return
    const now = Date.now()
    if (now - lastTapRef.current < 300) {
      onChange?.(0)
      onChangeEnd?.(0)
    }
    lastTapRef.current = now
  }, [disabled, onChange, onChangeEnd])

  const rotation = value * 135 // -135 to 135 degrees

  return (
    <div
      ref={knobRef}
      className={`relative cursor-pointer select-none touch-none ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${className}`}
      style={{ width: size, height: size }}
      onPointerDown={(e) => {
        handleDoubleTap()
        handlePointerDown(e)
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      tabIndex={disabled ? -1 : 0}
      role="slider"
      aria-label="Pan"
      aria-valuenow={value}
      aria-valuemin={-1}
      aria-valuemax={1}
      aria-disabled={disabled}
    >
      <svg viewBox="0 0 48 48" className="w-full h-full">
        {/* Background arc */}
        <circle
          cx="24"
          cy="24"
          r="18"
          fill="none"
          stroke="var(--border-default, #2a2a2a)"
          strokeWidth="4"
          strokeDasharray="85 100"
          strokeLinecap="round"
          transform="rotate(135 24 24)"
        />
        {/* Active arc */}
        <circle
          cx="24"
          cy="24"
          r="18"
          fill="none"
          stroke={isDragging ? 'var(--accent-primary, #3b82f6)' : 'var(--meter-green, #00cc44)'}
          strokeWidth="4"
          strokeDasharray={`${((value + 1) / 2) * 85} 100`}
          strokeLinecap="round"
          transform="rotate(135 24 24)"
        />
        {/* Knob body */}
        <circle cx="24" cy="24" r="12" fill="var(--bg-elevated, #1a1a1a)" />
        {/* Indicator */}
        <line
          x1="24"
          y1="16"
          x2="24"
          y2="10"
          stroke={isDragging ? '#fff' : '#888'}
          strokeWidth="3"
          strokeLinecap="round"
          transform={`rotate(${rotation} 24 24)`}
        />
      </svg>

      {/* Value label */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className={`text-[10px] font-mono ${isDragging ? 'text-white' : 'text-gray-500'}`}>
          {value === 0 ? 'C' : value < 0 ? `${Math.round(Math.abs(value) * 100)}L` : `${Math.round(value * 100)}R`}
        </span>
      </div>
    </div>
  )
}
