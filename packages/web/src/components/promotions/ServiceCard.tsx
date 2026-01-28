interface ServiceCardProps {
  name: string
  description: string
  icon: React.ReactNode
  url: string
  featured?: boolean
}

export function ServiceCard({ name, description, icon, url, featured }: ServiceCardProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`group block rounded-lg border p-4 transition-all hover:border-primary-500 hover:shadow-lg ${
        featured
          ? 'border-primary-600 bg-primary-900/20'
          : 'border-gray-700 bg-gray-800/50'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${
            featured ? 'bg-primary-600' : 'bg-gray-700'
          }`}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="flex items-center gap-2 font-medium text-white">
            {name}
            {featured && (
              <span className="rounded bg-primary-600 px-1.5 py-0.5 text-xs text-white">
                Popular
              </span>
            )}
          </h4>
          <p className="mt-1 text-sm text-gray-400 line-clamp-2">{description}</p>
        </div>
        <svg
          className="h-5 w-5 text-gray-500 transition-transform group-hover:translate-x-1 group-hover:text-primary-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
      </div>
    </a>
  )
}
