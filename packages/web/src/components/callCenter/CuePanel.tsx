import { useState, useCallback } from 'react'
import { CueType } from '@streamvu/shared'
import type { RoomCue } from '@streamvu/shared'

interface CuePanelProps {
  roomId: string
  isHost: boolean
  currentCue: RoomCue | null
  participants: Array<{ participantId: string; displayName: string }>
  onSendCue: (cueType: CueType, cueText?: string, targetParticipantId?: string) => void
  onClearCue: (targetParticipantId?: string) => void
}

const CUE_PRESETS = [
  { type: CueType.GREEN, label: 'GO', color: 'bg-green-600 hover:bg-green-500', textColor: 'text-white' },
  { type: CueType.YELLOW, label: 'STANDBY', color: 'bg-yellow-600 hover:bg-yellow-500', textColor: 'text-black' },
  { type: CueType.RED, label: 'STOP', color: 'bg-red-600 hover:bg-red-500', textColor: 'text-white' },
]

const CUSTOM_CUE_PRESETS = [
  'WRAP',
  '30 SEC',
  '10 SEC',
  'CUT',
  'HOLD',
  'SPEED UP',
]

export function CuePanel({
  roomId: _roomId,
  isHost,
  currentCue,
  participants,
  onSendCue,
  onClearCue,
}: CuePanelProps) {
  const [selectedTarget, setSelectedTarget] = useState<string>('all')
  const [customText, setCustomText] = useState('')
  const [showCustom, setShowCustom] = useState(false)

  const handleSendCue = useCallback((cueType: CueType, text?: string) => {
    const targetId = selectedTarget === 'all' ? undefined : selectedTarget
    onSendCue(cueType, text, targetId)
  }, [selectedTarget, onSendCue])

  const handleClearCue = useCallback(() => {
    const targetId = selectedTarget === 'all' ? undefined : selectedTarget
    onClearCue(targetId)
  }, [selectedTarget, onClearCue])

  const handleCustomCue = useCallback(() => {
    if (customText.trim()) {
      handleSendCue(CueType.CUSTOM, customText.trim())
      setCustomText('')
      setShowCustom(false)
    }
  }, [customText, handleSendCue])

  if (!isHost) {
    return null
  }

  return (
    <div className="flex flex-col bg-black">
      {/* Header with Clear button */}
      <div className="flex items-center justify-between border-b border-gray-800 px-2 py-1.5">
        <h3 className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Cue System</h3>
        {currentCue && currentCue.cueType !== 'OFF' && (
          <button
            onClick={handleClearCue}
            className="bg-gray-800 px-1.5 py-0.5 text-[9px] font-mono text-gray-400 hover:bg-gray-700 hover:text-white"
          >
            CLEAR
          </button>
        )}
      </div>

      <div className="p-2">
        {/* Target Selector */}
        <div className="mb-2">
          <label className="mb-0.5 block text-[9px] font-mono uppercase tracking-wider text-gray-600">
            Send To
          </label>
          <select
            value={selectedTarget}
            onChange={(e) => setSelectedTarget(e.target.value)}
            className="w-full bg-gray-900 px-2 py-1 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-gray-700"
          >
            <option value="all">ALL PARTICIPANTS</option>
            {participants.map((p) => (
              <option key={p.participantId} value={p.participantId}>
                {p.displayName}
              </option>
            ))}
          </select>
        </div>

        {/* Traffic Light Cues */}
        <div className="mb-2 grid grid-cols-3 gap-1">
          {CUE_PRESETS.map((preset) => (
            <button
              key={preset.type}
              onClick={() => handleSendCue(preset.type)}
              className={`py-2.5 text-[11px] font-mono font-bold transition-all ${preset.color} ${preset.textColor} ${
                currentCue?.cueType === preset.type ? 'ring-2 ring-white ring-offset-1 ring-offset-black' : ''
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Custom Cue Presets */}
        {showCustom ? (
          <div className="space-y-1.5">
            <div className="flex gap-1">
              <input
                type="text"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCustomCue()}
                placeholder="Custom cue..."
                className="flex-1 bg-gray-900 px-2 py-1 text-[11px] text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-700"
                autoFocus
              />
              <button
                onClick={handleCustomCue}
                disabled={!customText.trim()}
                className="bg-purple-900/50 px-2 py-1 text-[10px] font-mono text-purple-400 hover:bg-purple-900/70 disabled:opacity-50"
              >
                SEND
              </button>
            </div>
            <div className="flex flex-wrap gap-0.5">
              {CUSTOM_CUE_PRESETS.map((text) => (
                <button
                  key={text}
                  onClick={() => handleSendCue(CueType.CUSTOM, text)}
                  className="bg-gray-800 px-1.5 py-0.5 text-[9px] font-mono text-gray-400 hover:bg-gray-700 hover:text-white"
                >
                  {text}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowCustom(false)}
              className="text-[9px] font-mono text-gray-600 hover:text-gray-400"
            >
              CANCEL
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowCustom(true)}
            className="w-full bg-gray-900 py-1.5 text-[10px] font-mono text-gray-500 hover:bg-gray-800 hover:text-gray-400"
          >
            CUSTOM CUE...
          </button>
        )}

        {/* Current Cue Status */}
        {currentCue && currentCue.cueType !== 'OFF' && (
          <div className="mt-2 border-t border-gray-800 pt-2 text-center">
            <span className="text-[9px] font-mono uppercase tracking-wider text-gray-600">ACTIVE</span>
            <div className={`mt-0.5 text-[12px] font-mono font-bold ${
              currentCue.cueType === 'GREEN' ? 'text-green-400' :
              currentCue.cueType === 'YELLOW' ? 'text-yellow-400' :
              currentCue.cueType === 'RED' ? 'text-red-400' :
              'text-purple-400'
            }`}>
              {currentCue.cueType === 'CUSTOM' ? currentCue.cueText : currentCue.cueType}
            </div>
            {currentCue.targetParticipantId && (
              <div className="mt-0.5 text-[9px] font-mono text-gray-600">
                → {participants.find(p => p.participantId === currentCue.targetParticipantId)?.displayName || 'Unknown'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
