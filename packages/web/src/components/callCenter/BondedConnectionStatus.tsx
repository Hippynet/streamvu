/**
 * Bonded Connection Status Component
 *
 * Displays the status of bonded network connections:
 * - Active paths and their quality
 * - Primary path indicator
 * - Latency and bandwidth per path
 * - Manual failover control
 */

import { useMemo } from 'react'
import type { BondedConnectionStats, NetworkPath } from '../../services/bondedConnection'

interface BondedConnectionStatusProps {
  stats: BondedConnectionStats | null
  onForceFailover?: () => void
  compact?: boolean
  className?: string
}

const PATH_TYPE_ICONS: Record<NetworkPath['type'], string> = {
  wifi: '📶',
  cellular: '📱',
  ethernet: '🔌',
  unknown: '🌐',
}

const HEALTH_COLORS = {
  excellent: 'text-green-400 bg-green-500/10 border-green-500',
  good: 'text-green-400 bg-green-500/10 border-green-500',
  fair: 'text-yellow-400 bg-yellow-500/10 border-yellow-500',
  poor: 'text-red-400 bg-red-500/10 border-red-500',
  disconnected: 'text-gray-400 bg-gray-500/10 border-gray-500',
}

export function BondedConnectionStatus({
  stats,
  onForceFailover,
  compact = false,
  className = '',
}: BondedConnectionStatusProps) {
  const healthLabel = useMemo(() => {
    if (!stats) return 'Disconnected'
    switch (stats.overallHealth) {
      case 'excellent': return 'Excellent'
      case 'good': return 'Good'
      case 'fair': return 'Fair'
      case 'poor': return 'Poor'
      case 'disconnected': return 'Disconnected'
    }
  }, [stats])

  if (!stats) {
    return (
      <div className={`text-xs text-gray-500 ${className}`}>
        No connection
      </div>
    )
  }

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border ${HEALTH_COLORS[stats.overallHealth]}`}>
          <span className="text-[10px] font-mono">{stats.connectedPaths}P</span>
          <span className="text-[10px]">{stats.primaryLatency < Infinity ? `${Math.round(stats.primaryLatency)}ms` : '--'}</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-black border border-gray-800 rounded ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 px-2 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
            BONDED CONNECTION
          </span>
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${HEALTH_COLORS[stats.overallHealth]}`}>
            {healthLabel.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-gray-500">
            {stats.connectedPaths}/{stats.activePaths} paths
          </span>
          {onForceFailover && stats.connectedPaths > 1 && (
            <button
              onClick={onForceFailover}
              className="px-1.5 py-0.5 text-[9px] font-mono bg-gray-800 text-gray-400 hover:bg-gray-700 rounded"
            >
              FAILOVER
            </button>
          )}
        </div>
      </div>

      {/* Paths */}
      <div className="p-2 space-y-1">
        {stats.paths.map((path) => (
          <PathRow
            key={path.id}
            path={path}
            isPrimary={stats.primaryPath === path.id}
          />
        ))}

        {stats.paths.length === 0 && (
          <div className="text-center py-4 text-xs text-gray-500">
            No paths configured
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="border-t border-gray-800 px-2 py-1.5 flex items-center justify-between">
        <span className="text-[9px] font-mono text-gray-500">
          Total bandwidth: {formatBandwidth(stats.totalBandwidth)}
        </span>
        <span className="text-[9px] font-mono text-gray-500">
          Primary latency: {stats.primaryLatency < Infinity ? `${Math.round(stats.primaryLatency)}ms` : '--'}
        </span>
      </div>
    </div>
  )
}

function PathRow({ path, isPrimary }: { path: NetworkPath; isPrimary: boolean }) {
  const latencyColor = path.stats.latency < 50
    ? 'text-green-400'
    : path.stats.latency < 150
    ? 'text-yellow-400'
    : 'text-red-400'

  return (
    <div className={`flex items-center gap-2 px-2 py-1 rounded ${
      isPrimary ? 'bg-primary-900/30 border border-primary-700' : 'bg-gray-900/50'
    }`}>
      {/* Status dot */}
      <div className={`w-1.5 h-1.5 rounded-full ${
        path.isConnected ? 'bg-green-500' : 'bg-gray-600'
      }`} />

      {/* Path type icon */}
      <span className="text-xs">{PATH_TYPE_ICONS[path.type]}</span>

      {/* Path name */}
      <span className={`text-[10px] font-mono flex-1 ${path.isConnected ? 'text-white' : 'text-gray-500'}`}>
        {path.name}
        {isPrimary && (
          <span className="ml-1 px-1 py-0.5 bg-primary-600 text-[8px] rounded">
            PRIMARY
          </span>
        )}
      </span>

      {/* Stats */}
      {path.isConnected && (
        <>
          <span className={`text-[9px] font-mono ${latencyColor}`}>
            {Math.round(path.stats.latency)}ms
          </span>
          <span className="text-[9px] font-mono text-gray-500">
            {formatBandwidth(path.stats.bandwidth)}
          </span>
        </>
      )}

      {!path.isConnected && (
        <span className="text-[9px] font-mono text-gray-500">
          Disconnected
        </span>
      )}
    </div>
  )
}

function formatBandwidth(kbps: number): string {
  if (kbps < 1000) return `${kbps}kbps`
  return `${(kbps / 1000).toFixed(1)}Mbps`
}

export default BondedConnectionStatus
