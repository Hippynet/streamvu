import { useState } from 'react'
import { SourcesPanel } from '../../SourcesPanel'
import { UnifiedOutputsPanel } from '../../UnifiedOutputsPanel'
import { CodecConfigPanel } from '../../CodecConfigPanel'
import { useCodecConfig } from '../../../../hooks/useCodecConfig'
import type { AudioSource } from '@streamvu/shared'

interface AudioSourcePlaybackState {
  audioLevel: number
  isPlaying: boolean
  error: string | null
}

interface IOPanelProps {
  roomId: string
  isHost: boolean
  // Sources
  sources?: AudioSource[]
  playbackState?: Map<string, AudioSourcePlaybackState>
  onStartSource?: (sourceId: string) => void
  onStopSource?: (sourceId: string) => void
  onAddSource?: () => void
  sourcesRefreshKey?: number
  // Outputs
  onAddOutput?: () => void
  outputsRefreshKey?: number
}

type IOTab = 'sources' | 'outputs' | 'codec'

export function IOPanel({
  roomId,
  isHost,
  sources,
  playbackState,
  onStartSource,
  onStopSource,
  onAddSource,
  sourcesRefreshKey,
  onAddOutput,
  outputsRefreshKey,
}: IOPanelProps) {
  const [activeTab, setActiveTab] = useState<IOTab>('sources')

  // Codec configuration hook
  const codecConfig = useCodecConfig()

  // Get validation errors for codec config
  const codecValidation = codecConfig.validateConfig()

  return (
    <div className="flex h-full flex-col">
      {/* Tab Bar */}
      <div className="flex border-b border-gray-800">
        <button
          onClick={() => setActiveTab('sources')}
          className={`
            flex-1 px-3 py-2 text-[10px] font-mono uppercase tracking-wider transition-colors
            ${activeTab === 'sources'
              ? 'border-b-2 border-primary-500 bg-gray-900/30 text-primary-400'
              : 'text-gray-500 hover:bg-gray-900/20 hover:text-gray-400'
            }
          `}
        >
          Sources
        </button>
        <button
          onClick={() => setActiveTab('outputs')}
          className={`
            flex-1 px-3 py-2 text-[10px] font-mono uppercase tracking-wider transition-colors
            ${activeTab === 'outputs'
              ? 'border-b-2 border-primary-500 bg-gray-900/30 text-primary-400'
              : 'text-gray-500 hover:bg-gray-900/20 hover:text-gray-400'
            }
          `}
        >
          Outputs
        </button>
        <button
          onClick={() => setActiveTab('codec')}
          className={`
            flex-1 px-3 py-2 text-[10px] font-mono uppercase tracking-wider transition-colors
            ${activeTab === 'codec'
              ? 'border-b-2 border-primary-500 bg-gray-900/30 text-primary-400'
              : 'text-gray-500 hover:bg-gray-900/20 hover:text-gray-400'
            }
          `}
        >
          Codec
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'sources' && (
          <SourcesPanel
            roomId={roomId}
            isHost={isHost}
            sources={sources}
            playbackState={playbackState}
            onStartSource={onStartSource}
            onStopSource={onStopSource}
            onAddSource={onAddSource}
            refreshKey={sourcesRefreshKey}
            hideHeader
          />
        )}
        {activeTab === 'outputs' && (
          <UnifiedOutputsPanel
            roomId={roomId}
            isHost={isHost}
            onAddOutput={onAddOutput}
            refreshKey={outputsRefreshKey}
          />
        )}
        {activeTab === 'codec' && (
          <div className="h-full overflow-y-auto p-3">
            <CodecConfigPanel
              config={codecConfig.config}
              onConfigChange={codecConfig.updateConfig}
              onApplyPreset={codecConfig.applyPreset}
              onReset={codecConfig.resetToDefault}
              estimatedBandwidth={codecConfig.estimateBandwidth()}
              errors={codecValidation.errors}
              disabled={!isHost}
            />
          </div>
        )}
      </div>
    </div>
  )
}
