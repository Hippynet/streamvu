import { memo } from 'react'

interface VUMeterProProps {
  leftLevel: number
  rightLevel: number
  peak: number
  showLabels?: boolean
  height?: number
}

const VUMeterPro = memo(function VUMeterPro({
  leftLevel,
  rightLevel,
  peak: _peak,
  showLabels = true,
  height = 200,
}: VUMeterProProps) {
  const segments = 20
  const segmentHeight = height / segments

  const getSegmentColor = (index: number, level: number) => {
    const threshold = (segments - index) / segments
    const isActive = level >= threshold

    if (!isActive) return 'bg-gray-800'

    // Top 2 segments = red (clip)
    if (index < 2) return 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'
    // Next 4 segments = yellow (warning)
    if (index < 6) return 'bg-yellow-500 shadow-[0_0_6px_rgba(234,179,8,0.4)]'
    // Rest = green (normal)
    return 'bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.3)]'
  }

  const dbScale = [0, -3, -6, -9, -12, -18, -24, -30, -40, -50]

  return (
    <div className="flex items-end gap-1">
      {/* Left channel */}
      <div className="flex flex-col-reverse gap-0.5" style={{ height }}>
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={`l-${i}`}
            className={`w-4 rounded-sm transition-colors duration-75 ${getSegmentColor(segments - 1 - i, leftLevel)}`}
            style={{ height: segmentHeight - 2 }}
          />
        ))}
      </div>

      {/* Right channel */}
      <div className="flex flex-col-reverse gap-0.5" style={{ height }}>
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={`r-${i}`}
            className={`w-4 rounded-sm transition-colors duration-75 ${getSegmentColor(segments - 1 - i, rightLevel)}`}
            style={{ height: segmentHeight - 2 }}
          />
        ))}
      </div>

      {/* Scale labels */}
      {showLabels && (
        <div
          className="ml-1 flex flex-col justify-between font-mono text-[10px] text-gray-500"
          style={{ height }}
        >
          {dbScale.map((db) => (
            <span key={db} className={db === 0 ? 'text-red-400' : ''}>
              {db}
            </span>
          ))}
        </div>
      )}
    </div>
  )
})

export default VUMeterPro
