import type { StreamWithHealth } from '@streamvu/shared'
import StreamCard from './StreamCard'

interface StreamGridProps {
  streams: StreamWithHealth[]
}

export default function StreamGrid({ streams }: StreamGridProps) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {streams.map((stream) => (
        <StreamCard key={stream.id} stream={stream} />
      ))}
    </div>
  )
}
