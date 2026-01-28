import { useState } from 'react'
import { ConnectionQuality } from '@streamvu/shared'
import type { NetworkStats } from '../../hooks/useNetworkQuality'
import { getQualityBars, getQualityBgColor, getQualityLabel } from '../../hooks/useNetworkQuality'

interface NetworkQualityIndicatorProps {
  quality: ConnectionQuality
  stats?: NetworkStats | null
  participantName?: string
  size?: 'sm' | 'md' | 'lg'
  showDetails?: boolean
}

/**
 * Visual indicator for network connection quality
 */
export function NetworkQualityIndicator({
  quality,
  stats,
  participantName,
  size = 'md',
  showDetails = false,
}: NetworkQualityIndicatorProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const bars = getQualityBars(quality)

  const sizeClasses = {
    sm: { container: 'h-3 gap-0.5', bar: 'w-1' },
    md: { container: 'h-4 gap-0.5', bar: 'w-1.5' },
    lg: { container: 'h-5 gap-1', bar: 'w-2' },
  }

  const barHeights = ['h-1/4', 'h-2/4', 'h-3/4', 'h-full']

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onFocus={() => setShowTooltip(true)}
      onBlur={() => setShowTooltip(false)}
      role="status"
      aria-label={`Connection quality: ${getQualityLabel(quality)}`}
      tabIndex={0}
    >
      {/* Signal bars */}
      <div className={`flex items-end ${sizeClasses[size].container}`}>
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className={`${sizeClasses[size].bar} ${barHeights[index]} rounded-sm transition-colors ${
              index < bars
                ? getQualityBgColor(quality)
                : 'bg-gray-600'
            }`}
          />
        ))}
      </div>

      {/* Tooltip */}
      {showTooltip && stats && (
        <div className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-gray-600 bg-gray-800 p-3 shadow-xl">
          <div className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-gray-600 bg-gray-800" />

          {participantName && (
            <div className="mb-2 text-sm font-medium text-white">{participantName}</div>
          )}

          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between gap-4">
              <span className="text-gray-400">Quality</span>
              <span className={`font-medium ${getQualityTextColor(quality)}`}>
                {getQualityLabel(quality)} ({stats.qualityScore}%)
              </span>
            </div>

            <div className="flex items-center justify-between gap-4">
              <span className="text-gray-400">Latency</span>
              <span className={stats.rttMs > 150 ? 'text-yellow-400' : 'text-gray-200'}>
                {stats.rttMs.toFixed(0)} ms
              </span>
            </div>

            <div className="flex items-center justify-between gap-4">
              <span className="text-gray-400">Jitter</span>
              <span className={stats.rttJitter > 30 ? 'text-yellow-400' : 'text-gray-200'}>
                {stats.rttJitter.toFixed(1)} ms
              </span>
            </div>

            <div className="flex items-center justify-between gap-4">
              <span className="text-gray-400">Packet Loss</span>
              <span className={stats.packetLossPercent > 2 ? 'text-red-400' : 'text-gray-200'}>
                {stats.packetLossPercent.toFixed(2)}%
              </span>
            </div>

            {stats.availableBandwidthKbps > 0 && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-gray-400">Bandwidth</span>
                <span className="text-gray-200">
                  {(stats.availableBandwidthKbps / 1000).toFixed(1)} Mbps
                </span>
              </div>
            )}

            {stats.jitterBufferMs > 0 && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-gray-400">Buffer</span>
                <span className="text-gray-200">
                  {stats.jitterBufferMs.toFixed(0)} ms
                </span>
              </div>
            )}

            {stats.concealmentEvents > 0 && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-gray-400">Audio Gaps</span>
                <span className="text-yellow-400">{stats.concealmentEvents}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Inline details */}
      {showDetails && stats && (
        <div className="ml-2 flex items-center gap-2 text-xs">
          <span className={getQualityTextColor(quality)}>{getQualityLabel(quality)}</span>
          <span className="text-gray-500">|</span>
          <span className="text-gray-400">{stats.rttMs.toFixed(0)}ms</span>
          {stats.packetLossPercent > 0 && (
            <>
              <span className="text-gray-500">|</span>
              <span className={stats.packetLossPercent > 2 ? 'text-red-400' : 'text-gray-400'}>
                {stats.packetLossPercent.toFixed(1)}% loss
              </span>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Detailed network stats panel
 */
export function NetworkStatsPanel({
  stats,
  history,
}: {
  stats: NetworkStats | null
  history: NetworkStats[]
}) {
  if (!stats) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-4 text-center text-gray-500">
        No connection data available
      </div>
    )
  }

  // Calculate averages from history
  const avgRtt = history.length > 0
    ? history.reduce((sum, s) => sum + s.rttMs, 0) / history.length
    : stats.rttMs
  const avgLoss = history.length > 0
    ? history.reduce((sum, s) => sum + s.packetLossPercent, 0) / history.length
    : stats.packetLossPercent

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-white">Network Statistics</h3>
        <NetworkQualityIndicator quality={stats.quality} stats={stats} size="md" />
      </div>

      {/* Quality Score Bar */}
      <div className="mb-4">
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-gray-400">Quality Score</span>
          <span className={getQualityTextColor(stats.quality)}>{stats.qualityScore}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-700">
          <div
            className={`h-full transition-all ${getQualityBgColor(stats.quality)}`}
            style={{ width: `${stats.qualityScore}%` }}
          />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <StatItem
          label="Latency"
          value={`${stats.rttMs.toFixed(0)} ms`}
          subValue={`Avg: ${avgRtt.toFixed(0)} ms`}
          status={stats.rttMs > 150 ? 'warning' : stats.rttMs > 300 ? 'error' : 'ok'}
        />
        <StatItem
          label="Jitter"
          value={`${stats.rttJitter.toFixed(1)} ms`}
          status={stats.rttJitter > 30 ? 'warning' : stats.rttJitter > 50 ? 'error' : 'ok'}
        />
        <StatItem
          label="Packet Loss"
          value={`${stats.packetLossPercent.toFixed(2)}%`}
          subValue={`Avg: ${avgLoss.toFixed(2)}%`}
          status={stats.packetLossPercent > 2 ? 'warning' : stats.packetLossPercent > 5 ? 'error' : 'ok'}
        />
        <StatItem
          label="Packets"
          value={`${stats.packetsReceived.toLocaleString()}`}
          subValue={`Lost: ${stats.packetsLost}`}
          status={stats.packetsLost > 0 ? 'warning' : 'ok'}
        />
        {stats.availableBandwidthKbps > 0 && (
          <StatItem
            label="Bandwidth"
            value={`${(stats.availableBandwidthKbps / 1000).toFixed(1)} Mbps`}
            status="ok"
          />
        )}
        {stats.jitterBufferMs > 0 && (
          <StatItem
            label="Buffer"
            value={`${stats.jitterBufferMs.toFixed(0)} ms`}
            subValue={`Target: ${stats.jitterBufferTarget.toFixed(0)} ms`}
            status="ok"
          />
        )}
      </div>

      {/* Quality History Graph */}
      {history.length > 1 && (
        <div className="mt-4">
          <div className="mb-1 text-xs text-gray-400">Quality History (last {history.length}s)</div>
          <div className="flex h-12 items-end gap-px">
            {history.map((sample, i) => (
              <div
                key={i}
                className={`flex-1 transition-all ${getQualityBgColor(sample.quality)} opacity-80`}
                style={{ height: `${sample.qualityScore}%` }}
                title={`${sample.qualityScore}%`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Helper components and functions
interface StatItemProps {
  label: string
  value: string
  subValue?: string
  status: 'ok' | 'warning' | 'error'
}

function StatItem({ label, value, subValue, status }: StatItemProps) {
  const statusColors = {
    ok: 'text-gray-200',
    warning: 'text-yellow-400',
    error: 'text-red-400',
  }

  return (
    <div className="rounded bg-gray-750 p-2">
      <div className="text-gray-400">{label}</div>
      <div className={`font-medium ${statusColors[status]}`}>{value}</div>
      {subValue && <div className="text-gray-500">{subValue}</div>}
    </div>
  )
}

function getQualityTextColor(quality: ConnectionQuality): string {
  switch (quality) {
    case 'EXCELLENT':
      return 'text-green-400'
    case 'GOOD':
      return 'text-blue-400'
    case 'FAIR':
      return 'text-yellow-400'
    case 'POOR':
      return 'text-red-400'
    default:
      return 'text-gray-400'
  }
}

