import { useState, useEffect } from 'react'
import { ServiceCard } from './ServiceCard'

// Icons for services
const StreamHostingIcon = () => (
  <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.25V18a2.25 2.25 0 002.25 2.25h13.5A2.25 2.25 0 0021 18V8.25m-18 0V6a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 6v2.25m-18 0h18M5.25 6h.008v.008H5.25V6zM7.5 6h.008v.008H7.5V6zm2.25 0h.008v.008H9.75V6z" />
  </svg>
)

const AudioToolboxIcon = () => (
  <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
  </svg>
)

const StreamBackupIcon = () => (
  <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
  </svg>
)

const CloudPlayoutIcon = () => (
  <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
  </svg>
)

const HIPPYNET_SERVICES = [
  {
    id: 'stream-hosting',
    name: 'Stream Hosting',
    description: 'MediaCP-powered Icecast/Shoutcast hosting with global edge network.',
    url: 'https://hippynet.co.uk/services/stream-hosting',
    icon: <StreamHostingIcon />,
    featured: true,
  },
  {
    id: 'audio-toolbox',
    name: 'Audio Toolbox',
    description: 'Real-time processing, silence detection, and audio enhancement.',
    url: 'https://hippynet.co.uk/services/audio-toolbox',
    icon: <AudioToolboxIcon />,
  },
  {
    id: 'stream-backup',
    name: 'Stream Backup',
    description: 'Automatic failover and redundancy for your broadcasts.',
    url: 'https://hippynet.co.uk/services/stream-backup',
    icon: <StreamBackupIcon />,
  },
  {
    id: 'cloud-playout',
    name: 'Cloud Playout',
    description: '24/7 automated broadcast scheduling and automation.',
    url: 'https://hippynet.co.uk/services/cloud-playout',
    icon: <CloudPlayoutIcon />,
  },
]

interface HippynetPromoProps {
  variant: 'sidebar' | 'banner' | 'full'
  className?: string
}

const DISMISSED_KEY = 'hippynet-promo-dismissed'

export function HippynetPromo({ variant, className = '' }: HippynetPromoProps) {
  const [dismissed, setDismissed] = useState(() => {
    const stored = localStorage.getItem(DISMISSED_KEY)
    return stored ? JSON.parse(stored) : {}
  })

  // Rotate featured service for sidebar (changes daily)
  const [rotatedIndex, setRotatedIndex] = useState(0)

  useEffect(() => {
    const day = Math.floor(Date.now() / (1000 * 60 * 60 * 24))
    setRotatedIndex(day % HIPPYNET_SERVICES.length)
  }, [])

  const handleDismiss = (id: string) => {
    const newDismissed = { ...dismissed, [id]: Date.now() }
    setDismissed(newDismissed)
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(newDismissed))
  }

  // Sidebar variant - compact single service promo
  if (variant === 'sidebar') {
    const service = HIPPYNET_SERVICES[rotatedIndex]
    if (dismissed[service.id]) return null

    return (
      <div className={`rounded-lg border border-gray-700 bg-gray-800/50 p-3 ${className}`}>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500">Powered by Hippynet</span>
          <button
            onClick={() => handleDismiss(service.id)}
            className="text-gray-500 hover:text-gray-400"
            title="Dismiss"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <a
          href={service.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-2 text-sm text-gray-300 transition-colors hover:text-primary-400"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded bg-primary-600/20">
            {service.icon}
          </span>
          <div className="flex-1 min-w-0">
            <span className="font-medium">{service.name}</span>
            <p className="truncate text-xs text-gray-500">{service.description}</p>
          </div>
        </a>
      </div>
    )
  }

  // Banner variant - dismissible horizontal banner
  if (variant === 'banner') {
    if (dismissed['banner']) return null

    return (
      <div className={`rounded-lg border border-primary-700 bg-primary-900/30 p-4 ${className}`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-600">
              <StreamHostingIcon />
            </div>
            <div>
              <p className="font-medium text-white">Need professional stream hosting?</p>
              <p className="text-sm text-gray-400">
                Hippynet offers reliable Icecast & Shoutcast hosting with 99.9% uptime.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="https://hippynet.co.uk/services/stream-hosting"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-500"
            >
              Learn More
            </a>
            <button
              onClick={() => handleDismiss('banner')}
              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
              title="Dismiss"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Full variant - shows all services in a grid
  return (
    <div className={className}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Hippynet Services</h3>
        <a
          href="https://hippynet.co.uk"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary-400 hover:text-primary-300"
        >
          View all
        </a>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {HIPPYNET_SERVICES.map((service) => (
          <ServiceCard
            key={service.id}
            name={service.name}
            description={service.description}
            icon={service.icon}
            url={service.url}
            featured={service.featured}
          />
        ))}
      </div>
    </div>
  )
}
