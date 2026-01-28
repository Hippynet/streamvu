interface SettingsPanelProps {
  // Add settings props as needed
}

export function SettingsPanel(_props: SettingsPanelProps) {
  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="space-y-4">
        <p className="text-xs text-gray-500">
          Room settings and preferences will appear here.
        </p>

        {/* Placeholder for future settings */}
        <div className="rounded border border-gray-800 bg-gray-900/50 p-3">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
            Audio
          </h3>
          <p className="text-xs text-gray-600">
            Audio device settings coming soon...
          </p>
        </div>

        <div className="rounded border border-gray-800 bg-gray-900/50 p-3">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
            Video
          </h3>
          <p className="text-xs text-gray-600">
            Video settings coming soon...
          </p>
        </div>

        <div className="rounded border border-gray-800 bg-gray-900/50 p-3">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
            Notifications
          </h3>
          <p className="text-xs text-gray-600">
            Notification preferences coming soon...
          </p>
        </div>
      </div>
    </div>
  )
}
