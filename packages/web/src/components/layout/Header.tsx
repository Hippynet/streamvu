interface HeaderProps {
  onToggleSidebar: () => void
  sidebarVisible: boolean
}

export default function Header({ onToggleSidebar, sidebarVisible }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-700 bg-gray-800/80 px-4 backdrop-blur-sm sm:gap-x-6 sm:px-6 lg:px-8">
      <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
        <div className="flex flex-1 items-center gap-4">
          <button
            onClick={onToggleSidebar}
            className="rounded p-2 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
            title={sidebarVisible ? 'Hide sidebar' : 'Show sidebar'}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              {sidebarVisible ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              )}
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-white lg:hidden">StreamVU</h1>
        </div>

        <div className="flex items-center gap-x-4 lg:gap-x-6">
          <span className="text-sm text-gray-400">Stream Monitor</span>
        </div>
      </div>
    </header>
  )
}
