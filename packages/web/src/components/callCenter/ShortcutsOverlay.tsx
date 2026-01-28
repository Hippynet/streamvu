import { ShortcutInfo } from '../../hooks/useKeyboardShortcuts'

interface ShortcutsOverlayProps {
  shortcuts: ShortcutInfo[]
  onClose: () => void
}

export function ShortcutsOverlay({ shortcuts, onClose }: ShortcutsOverlayProps) {
  const categories = {
    channel: { label: 'Channel Controls', color: 'text-blue-400' },
    master: { label: 'Master Controls', color: 'text-purple-400' },
    talkback: { label: 'Talkback', color: 'text-amber-400' },
    general: { label: 'General', color: 'text-gray-400' },
  }

  const groupedShortcuts = shortcuts.reduce(
    (acc, shortcut) => {
      if (!acc[shortcut.category]) {
        acc[shortcut.category] = []
      }
      acc[shortcut.category].push(shortcut)
      return acc
    },
    {} as Record<string, ShortcutInfo[]>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Shortcut categories */}
        <div className="space-y-6">
          {(Object.keys(categories) as Array<keyof typeof categories>).map(
            (category) => {
              const categoryShortcuts = groupedShortcuts[category]
              if (!categoryShortcuts || categoryShortcuts.length === 0) return null

              return (
                <div key={category}>
                  <h3
                    className={`mb-3 text-xs font-semibold uppercase tracking-wider ${categories[category].color}`}
                  >
                    {categories[category].label}
                  </h3>
                  <div className="space-y-2">
                    {categoryShortcuts.map((shortcut) => (
                      <div
                        key={shortcut.key}
                        className="flex items-center justify-between rounded bg-gray-800/50 px-3 py-2"
                      >
                        <span className="text-sm text-gray-300">
                          {shortcut.description}
                        </span>
                        <kbd className="rounded bg-gray-700 px-2 py-1 font-mono text-xs text-white">
                          {shortcut.key}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              )
            }
          )}
        </div>

        {/* Footer hint */}
        <div className="mt-6 border-t border-gray-700 pt-4 text-center text-xs text-gray-500">
          Press <kbd className="rounded bg-gray-700 px-1.5 py-0.5 text-gray-300">?</kbd> or{' '}
          <kbd className="rounded bg-gray-700 px-1.5 py-0.5 text-gray-300">Esc</kbd> to close
        </div>
      </div>
    </div>
  )
}

export default ShortcutsOverlay
