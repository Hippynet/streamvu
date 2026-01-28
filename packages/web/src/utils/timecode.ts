/**
 * Timecode Utilities
 *
 * Supports SMPTE timecode formats for broadcast applications:
 * - 24fps (film)
 * - 25fps (PAL/SECAM)
 * - 29.97fps drop-frame (NTSC)
 * - 30fps (NTSC non-drop)
 *
 * Formats:
 * - SMPTE: HH:MM:SS:FF (non-drop) or HH:MM:SS;FF (drop-frame)
 * - Time-of-day: Derived from system clock
 * - Free-run: Starts from 00:00:00:00
 */

export type TimecodeFrameRate = 24 | 25 | 29.97 | 30 | 50 | 59.94 | 60

export interface TimecodeOptions {
  frameRate: TimecodeFrameRate
  dropFrame?: boolean // Only applicable for 29.97fps and 59.94fps
}

export interface TimecodeValue {
  hours: number
  minutes: number
  seconds: number
  frames: number
  totalFrames: number
  dropFrame: boolean
  frameRate: TimecodeFrameRate
}

// Standard frame rates
export const FRAME_RATES = {
  FILM: 24,
  PAL: 25,
  NTSC_DROP: 29.97,
  NTSC: 30,
  PAL_HIGH: 50,
  NTSC_HIGH_DROP: 59.94,
  NTSC_HIGH: 60,
} as const

/**
 * Parse a timecode string into a TimecodeValue
 */
export function parseTimecode(
  input: string,
  options: TimecodeOptions
): TimecodeValue | null {
  // Match HH:MM:SS:FF or HH:MM:SS;FF (semicolon indicates drop-frame)
  const match = input.match(/^(\d{2}):(\d{2}):(\d{2})([;:])(\d{2})$/)
  if (!match) return null

  const [, hoursStr, minutesStr, secondsStr, separator, framesStr] = match
  const hours = parseInt(hoursStr, 10)
  const minutes = parseInt(minutesStr, 10)
  const seconds = parseInt(secondsStr, 10)
  const frames = parseInt(framesStr, 10)
  const dropFrame = separator === ';' || options.dropFrame === true

  // Validate ranges
  const maxFrames = Math.ceil(options.frameRate)
  if (
    hours < 0 || hours > 23 ||
    minutes < 0 || minutes > 59 ||
    seconds < 0 || seconds > 59 ||
    frames < 0 || frames >= maxFrames
  ) {
    return null
  }

  const totalFrames = timecodeToFrames(hours, minutes, seconds, frames, options)

  return {
    hours,
    minutes,
    seconds,
    frames,
    totalFrames,
    dropFrame,
    frameRate: options.frameRate,
  }
}

/**
 * Convert timecode components to total frame count
 */
export function timecodeToFrames(
  hours: number,
  minutes: number,
  seconds: number,
  frames: number,
  options: TimecodeOptions
): number {
  const { frameRate, dropFrame } = options
  const nominalRate = Math.ceil(frameRate)

  if (dropFrame && (frameRate === 29.97 || frameRate === 59.94)) {
    // Drop-frame calculation (drops 2 frames per minute, except every 10th minute)
    const dropsPerMinute = frameRate === 29.97 ? 2 : 4
    const totalMinutes = hours * 60 + minutes
    const dropFrames = dropsPerMinute * (totalMinutes - Math.floor(totalMinutes / 10))

    const totalSeconds = hours * 3600 + minutes * 60 + seconds
    return Math.round(totalSeconds * frameRate) + frames - dropFrames
  }

  // Non-drop-frame: simple calculation
  return (hours * 3600 + minutes * 60 + seconds) * nominalRate + frames
}

/**
 * Convert total frame count to timecode components
 */
export function framesToTimecode(
  totalFrames: number,
  options: TimecodeOptions
): TimecodeValue {
  const { frameRate, dropFrame } = options
  const nominalRate = Math.ceil(frameRate)

  let frames = totalFrames
  let hours = 0
  let minutes = 0
  let seconds = 0

  if (dropFrame && (frameRate === 29.97 || frameRate === 59.94)) {
    // Drop-frame reverse calculation
    const dropsPerMinute = frameRate === 29.97 ? 2 : 4
    const framesPerMinute = Math.round(frameRate * 60)
    const framesPerTenMinutes = Math.round(frameRate * 600)

    // Find 10-minute blocks
    const tenMinuteBlocks = Math.floor(frames / framesPerTenMinutes)
    let remainingFrames = frames % framesPerTenMinutes

    // Handle frames within the 10-minute block
    // First minute has no drops, subsequent 9 minutes drop frames
    if (remainingFrames >= framesPerMinute) {
      remainingFrames -= framesPerMinute // First minute
      const additionalMinutes = Math.floor(remainingFrames / (framesPerMinute - dropsPerMinute))
      remainingFrames = remainingFrames % (framesPerMinute - dropsPerMinute)
      minutes = 1 + additionalMinutes
    }

    minutes += tenMinuteBlocks * 10
    hours = Math.floor(minutes / 60)
    minutes = minutes % 60

    seconds = Math.floor(remainingFrames / nominalRate)
    frames = remainingFrames % nominalRate

    // Skip dropped frames at minute boundaries (except every 10th)
    if (minutes % 10 !== 0 && seconds === 0 && frames < dropsPerMinute) {
      frames = dropsPerMinute
    }
  } else {
    // Non-drop-frame: simple calculation
    hours = Math.floor(frames / (nominalRate * 3600))
    frames %= nominalRate * 3600
    minutes = Math.floor(frames / (nominalRate * 60))
    frames %= nominalRate * 60
    seconds = Math.floor(frames / nominalRate)
    frames %= nominalRate
  }

  return {
    hours,
    minutes,
    seconds,
    frames,
    totalFrames,
    dropFrame: dropFrame || false,
    frameRate,
  }
}

/**
 * Format a TimecodeValue as a string
 */
export function formatTimecode(tc: TimecodeValue): string {
  const pad = (n: number, digits = 2) => n.toString().padStart(digits, '0')
  const separator = tc.dropFrame ? ';' : ':'

  return `${pad(tc.hours)}:${pad(tc.minutes)}:${pad(tc.seconds)}${separator}${pad(tc.frames)}`
}

/**
 * Get current time-of-day as timecode
 */
export function getTimeOfDayTimecode(options: TimecodeOptions): TimecodeValue {
  const now = new Date()
  const hours = now.getHours()
  const minutes = now.getMinutes()
  const seconds = now.getSeconds()
  const milliseconds = now.getMilliseconds()

  // Calculate frame based on milliseconds
  const frameRate = options.frameRate
  const frames = Math.floor((milliseconds / 1000) * frameRate)

  const totalFrames = timecodeToFrames(hours, minutes, seconds, frames, options)

  return {
    hours,
    minutes,
    seconds,
    frames,
    totalFrames,
    dropFrame: options.dropFrame || false,
    frameRate,
  }
}

/**
 * Create a free-run timecode generator
 */
export function createFreeRunGenerator(options: TimecodeOptions) {
  let startTime = Date.now()
  let pausedAt: number | null = null
  let accumulatedPauseTime = 0

  return {
    /**
     * Get current timecode based on elapsed time
     */
    getCurrentTimecode(): TimecodeValue {
      const now = pausedAt || Date.now()
      const elapsed = now - startTime - accumulatedPauseTime
      const totalFrames = Math.floor((elapsed / 1000) * options.frameRate)

      return framesToTimecode(totalFrames, options)
    },

    /**
     * Reset to 00:00:00:00
     */
    reset(): void {
      startTime = Date.now()
      pausedAt = null
      accumulatedPauseTime = 0
    },

    /**
     * Pause the generator
     */
    pause(): void {
      if (!pausedAt) {
        pausedAt = Date.now()
      }
    },

    /**
     * Resume from pause
     */
    resume(): void {
      if (pausedAt) {
        accumulatedPauseTime += Date.now() - pausedAt
        pausedAt = null
      }
    },

    /**
     * Check if paused
     */
    isPaused(): boolean {
      return pausedAt !== null
    },

    /**
     * Set to a specific timecode
     */
    setTimecode(tc: TimecodeValue): void {
      const targetFrames = tc.totalFrames
      const targetMs = (targetFrames / options.frameRate) * 1000
      startTime = Date.now() - targetMs
      pausedAt = null
      accumulatedPauseTime = 0
    },
  }
}

/**
 * Add timecodes together
 */
export function addTimecodes(
  a: TimecodeValue,
  b: TimecodeValue
): TimecodeValue {
  // Must be same frame rate
  if (a.frameRate !== b.frameRate) {
    throw new Error('Cannot add timecodes with different frame rates')
  }

  const totalFrames = a.totalFrames + b.totalFrames

  return framesToTimecode(totalFrames, {
    frameRate: a.frameRate,
    dropFrame: a.dropFrame,
  })
}

/**
 * Subtract timecodes (a - b)
 */
export function subtractTimecodes(
  a: TimecodeValue,
  b: TimecodeValue
): TimecodeValue {
  if (a.frameRate !== b.frameRate) {
    throw new Error('Cannot subtract timecodes with different frame rates')
  }

  const totalFrames = Math.max(0, a.totalFrames - b.totalFrames)

  return framesToTimecode(totalFrames, {
    frameRate: a.frameRate,
    dropFrame: a.dropFrame,
  })
}

/**
 * Compare timecodes (-1 if a < b, 0 if equal, 1 if a > b)
 */
export function compareTimecodes(a: TimecodeValue, b: TimecodeValue): number {
  if (a.totalFrames < b.totalFrames) return -1
  if (a.totalFrames > b.totalFrames) return 1
  return 0
}

/**
 * Convert between frame rates (approximate)
 */
export function convertFrameRate(
  tc: TimecodeValue,
  newOptions: TimecodeOptions
): TimecodeValue {
  // Convert to seconds, then to new frame rate
  const seconds = tc.totalFrames / tc.frameRate
  const newTotalFrames = Math.round(seconds * newOptions.frameRate)

  return framesToTimecode(newTotalFrames, newOptions)
}

export default {
  parseTimecode,
  formatTimecode,
  timecodeToFrames,
  framesToTimecode,
  getTimeOfDayTimecode,
  createFreeRunGenerator,
  addTimecodes,
  subtractTimecodes,
  compareTimecodes,
  convertFrameRate,
  FRAME_RATES,
}
