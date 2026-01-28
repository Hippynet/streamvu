import { useCallback, useEffect, useRef, useState } from 'react'
import { ConnectionQuality } from '@streamvu/shared'

/**
 * Network quality statistics for a connection
 */
export interface NetworkStats {
  // RTT (Round Trip Time)
  rttMs: number
  rttJitter: number

  // Packet loss
  packetLossPercent: number
  packetsLost: number
  packetsReceived: number

  // Bandwidth
  availableBandwidthKbps: number
  currentBandwidthKbps: number

  // Jitter buffer
  jitterBufferMs: number
  jitterBufferTarget: number

  // Audio specific
  audioLevel: number
  concealedSamples: number
  concealmentEvents: number

  // Quality score
  quality: ConnectionQuality
  qualityScore: number // 0-100
}

interface UseNetworkQualityOptions {
  peerConnection: RTCPeerConnection | null
  pollingIntervalMs?: number
  onQualityChange?: (quality: ConnectionQuality) => void
}

interface UseNetworkQualityReturn {
  stats: NetworkStats | null
  history: NetworkStats[]
  isMonitoring: boolean
  startMonitoring: () => void
  stopMonitoring: () => void
  getQualityColor: (quality: ConnectionQuality) => string
  getQualityLabel: (quality: ConnectionQuality) => string
}

const DEFAULT_STATS: NetworkStats = {
  rttMs: 0,
  rttJitter: 0,
  packetLossPercent: 0,
  packetsLost: 0,
  packetsReceived: 0,
  availableBandwidthKbps: 0,
  currentBandwidthKbps: 0,
  jitterBufferMs: 0,
  jitterBufferTarget: 0,
  audioLevel: 0,
  concealedSamples: 0,
  concealmentEvents: 0,
  quality: ConnectionQuality.UNKNOWN,
  qualityScore: 0,
}

/**
 * Hook for monitoring WebRTC connection quality
 */
export function useNetworkQuality({
  peerConnection,
  pollingIntervalMs = 1000,
  onQualityChange,
}: UseNetworkQualityOptions): UseNetworkQualityReturn {
  const [stats, setStats] = useState<NetworkStats | null>(null)
  const [history, setHistory] = useState<NetworkStats[]>([])
  const [isMonitoring, setIsMonitoring] = useState(false)

  const intervalRef = useRef<ReturnType<typeof setInterval>>()
  const previousStatsRef = useRef<RTCStatsReport | null>(null)
  const previousQualityRef = useRef<ConnectionQuality>(ConnectionQuality.UNKNOWN)

  const calculateQuality = useCallback((stats: Partial<NetworkStats>): { quality: ConnectionQuality; score: number } => {
    // Quality scoring algorithm
    let score = 100

    // RTT penalty (ideal: <50ms, acceptable: <150ms, poor: >300ms)
    if (stats.rttMs) {
      if (stats.rttMs > 300) score -= 40
      else if (stats.rttMs > 150) score -= 20
      else if (stats.rttMs > 50) score -= 5
    }

    // Packet loss penalty (ideal: 0%, acceptable: <2%, poor: >5%)
    if (stats.packetLossPercent) {
      if (stats.packetLossPercent > 5) score -= 40
      else if (stats.packetLossPercent > 2) score -= 20
      else if (stats.packetLossPercent > 0.5) score -= 5
    }

    // Jitter penalty (ideal: <10ms, acceptable: <30ms, poor: >50ms)
    if (stats.rttJitter) {
      if (stats.rttJitter > 50) score -= 20
      else if (stats.rttJitter > 30) score -= 10
      else if (stats.rttJitter > 10) score -= 3
    }

    // Concealment events penalty
    if (stats.concealmentEvents && stats.concealmentEvents > 0) {
      score -= Math.min(stats.concealmentEvents * 2, 20)
    }

    // Clamp score
    score = Math.max(0, Math.min(100, score))

    // Map score to quality level
    let quality: ConnectionQuality
    if (score >= 90) quality = ConnectionQuality.EXCELLENT
    else if (score >= 70) quality = ConnectionQuality.GOOD
    else if (score >= 50) quality = ConnectionQuality.FAIR
    else if (score > 0) quality = ConnectionQuality.POOR
    else quality = ConnectionQuality.UNKNOWN

    return { quality, score }
  }, [])

  const collectStats = useCallback(async () => {
    if (!peerConnection || peerConnection.connectionState !== 'connected') {
      return
    }

    try {
      const report = await peerConnection.getStats()
      const newStats: Partial<NetworkStats> = { ...DEFAULT_STATS }

      report.forEach((stat) => {
        // Candidate pair stats (RTT, bandwidth)
        if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
          newStats.rttMs = stat.currentRoundTripTime ? stat.currentRoundTripTime * 1000 : 0
          newStats.availableBandwidthKbps = stat.availableOutgoingBitrate
            ? stat.availableOutgoingBitrate / 1000
            : 0
        }

        // Inbound RTP stats (audio receiving)
        if (stat.type === 'inbound-rtp' && stat.kind === 'audio') {
          newStats.packetsReceived = stat.packetsReceived || 0
          newStats.packetsLost = stat.packetsLost || 0
          newStats.jitterBufferMs = stat.jitterBufferDelay
            ? (stat.jitterBufferDelay / stat.jitterBufferEmittedCount) * 1000
            : 0
          newStats.jitterBufferTarget = stat.jitterBufferTargetDelay
            ? stat.jitterBufferTargetDelay * 1000
            : 0
          newStats.concealedSamples = stat.concealedSamples || 0
          newStats.concealmentEvents = stat.concealmentEvents || 0
          newStats.audioLevel = stat.audioLevel || 0

          // Calculate jitter from previous stats
          if (previousStatsRef.current) {
            const prevStat = previousStatsRef.current.get(stat.id)
            if (prevStat && stat.jitter) {
              newStats.rttJitter = stat.jitter * 1000
            }
          }
        }

        // Outbound RTP stats
        if (stat.type === 'outbound-rtp' && stat.kind === 'audio') {
          newStats.currentBandwidthKbps = stat.bytesSent
            ? (stat.bytesSent * 8) / 1000
            : 0
        }
      })

      // Calculate packet loss percentage
      const totalPackets = newStats.packetsReceived! + newStats.packetsLost!
      if (totalPackets > 0) {
        newStats.packetLossPercent = (newStats.packetsLost! / totalPackets) * 100
      }

      // Calculate quality score
      const { quality, score } = calculateQuality(newStats)
      newStats.quality = quality
      newStats.qualityScore = score

      // Notify on quality change
      if (quality !== previousQualityRef.current && onQualityChange) {
        onQualityChange(quality)
        previousQualityRef.current = quality
      }

      // Update state
      setStats(newStats as NetworkStats)
      setHistory((prev) => {
        const newHistory = [...prev, newStats as NetworkStats]
        // Keep last 60 samples (1 minute at 1 sample/sec)
        return newHistory.slice(-60)
      })

      previousStatsRef.current = report
    } catch (error) {
      console.error('[useNetworkQuality] Error collecting stats:', error)
    }
  }, [peerConnection, calculateQuality, onQualityChange])

  const startMonitoring = useCallback(() => {
    if (intervalRef.current) return
    setIsMonitoring(true)
    collectStats()
    intervalRef.current = setInterval(collectStats, pollingIntervalMs)
  }, [collectStats, pollingIntervalMs])

  const stopMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = undefined
    }
    setIsMonitoring(false)
  }, [])

  // Auto-start when peer connection is available
  useEffect(() => {
    if (peerConnection && peerConnection.connectionState === 'connected') {
      startMonitoring()
    } else {
      stopMonitoring()
    }

    return () => stopMonitoring()
  }, [peerConnection, startMonitoring, stopMonitoring])

  // Helper functions
  const getQualityColor = useCallback((quality: ConnectionQuality): string => {
    switch (quality) {
      case ConnectionQuality.EXCELLENT:
        return 'text-green-400'
      case ConnectionQuality.GOOD:
        return 'text-blue-400'
      case ConnectionQuality.FAIR:
        return 'text-yellow-400'
      case ConnectionQuality.POOR:
        return 'text-red-400'
      default:
        return 'text-gray-400'
    }
  }, [])

  const getQualityLabel = useCallback((quality: ConnectionQuality): string => {
    switch (quality) {
      case ConnectionQuality.EXCELLENT:
        return 'Excellent'
      case ConnectionQuality.GOOD:
        return 'Good'
      case ConnectionQuality.FAIR:
        return 'Fair'
      case ConnectionQuality.POOR:
        return 'Poor'
      default:
        return 'Unknown'
    }
  }, [])

  return {
    stats,
    history,
    isMonitoring,
    startMonitoring,
    stopMonitoring,
    getQualityColor,
    getQualityLabel,
  }
}

/**
 * Get quality color class for backgrounds
 */
export function getQualityBgColor(quality: ConnectionQuality): string {
  switch (quality) {
    case 'EXCELLENT':
      return 'bg-green-500'
    case 'GOOD':
      return 'bg-blue-500'
    case 'FAIR':
      return 'bg-yellow-500'
    case 'POOR':
      return 'bg-red-500'
    default:
      return 'bg-gray-500'
  }
}

/**
 * Get quality icon (signal bars)
 */
export function getQualityBars(quality: ConnectionQuality): number {
  switch (quality) {
    case 'EXCELLENT':
      return 4
    case 'GOOD':
      return 3
    case 'FAIR':
      return 2
    case 'POOR':
      return 1
    default:
      return 0
  }
}

/**
 * Get quality label text
 */
export function getQualityLabel(quality: ConnectionQuality): string {
  switch (quality) {
    case 'EXCELLENT':
      return 'Excellent'
    case 'GOOD':
      return 'Good'
    case 'FAIR':
      return 'Fair'
    case 'POOR':
      return 'Poor'
    default:
      return 'Unknown'
  }
}
