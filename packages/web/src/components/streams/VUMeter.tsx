interface VUMeterProps {
  level: number // 0-1
  label?: string
  showPeak?: boolean
}

export default function VUMeter({ level, label, showPeak = true }: VUMeterProps) {
  const clampedLevel = Math.max(0, Math.min(1, level))
  const height = clampedLevel * 100

  // Calculate color based on level
  const getColor = () => {
    if (clampedLevel > 0.9) return 'bg-red-500'
    if (clampedLevel > 0.7) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  return (
    <div className="flex flex-col items-center gap-1">
      {label && <span className="font-mono text-xs text-gray-500">{label}</span>}
      <div className="relative h-32 w-6 overflow-hidden rounded border border-gray-700 bg-gray-900">
        {/* Background segments */}
        <div className="absolute inset-0 flex flex-col">
          <div className="flex-1 border-b border-gray-700/50" />
          <div className="flex-1 border-b border-gray-700/50" />
          <div className="flex-1 border-b border-gray-700/50" />
          <div className="flex-1" />
        </div>

        {/* Level bar */}
        <div
          className={`absolute bottom-0 left-0 right-0 transition-all duration-75 ${getColor()}`}
          style={{ height: `${height}%` }}
        />

        {/* Peak indicator */}
        {showPeak && clampedLevel > 0.9 && (
          <div className="absolute left-0 right-0 top-0 h-2 animate-pulse bg-red-500" />
        )}

        {/* Scale markers */}
        <div className="absolute inset-y-0 right-0 flex flex-col justify-between py-1 pr-0.5">
          <span className="text-[8px] text-red-400">0</span>
          <span className="text-[8px] text-gray-500">-6</span>
          <span className="text-[8px] text-gray-500">-12</span>
          <span className="text-[8px] text-gray-500">-24</span>
        </div>
      </div>
      {/* dB readout */}
      <span className="font-mono text-xs text-gray-400">
        {clampedLevel > 0 ? `${(20 * Math.log10(clampedLevel)).toFixed(0)} dB` : '-∞'}
      </span>
    </div>
  )
}
