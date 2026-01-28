import { useState, useCallback, useMemo } from 'react'
import { RundownItemType } from '@streamvu/shared'
import type { Rundown, RundownItem } from '@streamvu/shared'

interface RundownPanelProps {
  roomId: string
  isHost: boolean
  rundown: Rundown | null
  onSetCurrentItem: (itemId: string) => void
  onAddItem?: (item: { title: string; durationSec?: number; notes?: string; type?: RundownItemType }) => void
  onUpdateItem?: (itemId: string, updates: Partial<RundownItem>) => void
  onDeleteItem?: (itemId: string) => void
  onCreateRundown?: (name: string) => void
}

const ITEM_TYPE_COLORS: Record<RundownItemType, { border: string; text: string; badge: string }> = {
  SEGMENT: { border: 'border-blue-500', text: 'text-blue-400', badge: 'bg-blue-950/50' },
  BREAK: { border: 'border-yellow-500', text: 'text-yellow-400', badge: 'bg-yellow-950/50' },
  MUSIC: { border: 'border-purple-500', text: 'text-purple-400', badge: 'bg-purple-950/50' },
  AD: { border: 'border-orange-500', text: 'text-orange-400', badge: 'bg-orange-950/50' },
  INTERVIEW: { border: 'border-green-500', text: 'text-green-400', badge: 'bg-green-950/50' },
  CALL: { border: 'border-cyan-500', text: 'text-cyan-400', badge: 'bg-cyan-950/50' },
  NOTE: { border: 'border-gray-600', text: 'text-gray-400', badge: 'bg-gray-900' },
}

const ITEM_TYPE_LABELS: Record<RundownItemType, string> = {
  SEGMENT: 'SEG',
  BREAK: 'BRK',
  MUSIC: 'MUS',
  AD: 'AD',
  INTERVIEW: 'INT',
  CALL: 'CALL',
  NOTE: 'NOTE',
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '--:--'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function RundownItemRow({
  item,
  isHost,
  onSetCurrent,
  onUpdate: _onUpdate,
  onDelete,
}: {
  item: RundownItem
  isHost: boolean
  onSetCurrent: () => void
  onUpdate?: (updates: Partial<RundownItem>) => void
  onDelete?: () => void
}) {
  const colors = ITEM_TYPE_COLORS[item.type]

  return (
    <div
      className={`
        group flex items-center gap-2 border-l-2 px-1.5 py-1
        ${colors.border}
        ${item.isCurrent ? 'bg-green-950/30 ring-1 ring-green-500' : 'bg-gray-900/50 hover:bg-gray-900'}
        ${item.isCompleted ? 'opacity-50' : ''}
      `}
    >
      {/* Order Number */}
      <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center bg-gray-800 text-[9px] font-mono text-gray-500">
        {item.order + 1}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className={`text-[8px] font-mono uppercase ${colors.badge} ${colors.text} px-0.5`}>
            {ITEM_TYPE_LABELS[item.type]}
          </span>
          {item.isCurrent && (
            <span className="animate-pulse bg-green-600 px-1 py-0.5 text-[7px] font-mono font-bold text-white">
              LIVE
            </span>
          )}
          {item.isCompleted && (
            <span className="bg-gray-800 px-1 py-0.5 text-[7px] font-mono text-gray-500">
              DONE
            </span>
          )}
        </div>
        <div className="truncate text-[10px] text-white">{item.title}</div>
        {item.notes && (
          <div className="mt-0.5 truncate text-[9px] text-gray-600">{item.notes}</div>
        )}
      </div>

      {/* Duration */}
      <div className="flex-shrink-0 text-right font-mono text-[11px] text-gray-400">
        {formatDuration(item.durationSec)}
      </div>

      {/* Actions (Host Only) */}
      {isHost && (
        <div className="flex flex-shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {!item.isCurrent && !item.isCompleted && (
            <button
              onClick={onSetCurrent}
              className="bg-green-900/50 p-0.5 text-[10px] text-green-400 hover:bg-green-900/70"
              title="Set as current"
            >
              ▶
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="bg-gray-800 p-0.5 text-[10px] text-gray-500 hover:bg-red-900/50 hover:text-red-400"
              title="Delete"
            >
              ×
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function AddItemForm({
  onAdd,
  onCancel,
}: {
  onAdd: (item: { title: string; durationSec?: number; notes?: string; type?: RundownItemType }) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [duration, setDuration] = useState('')
  const [notes, setNotes] = useState('')
  const [type, setType] = useState<RundownItemType>(RundownItemType.SEGMENT)

  const handleSubmit = () => {
    if (!title.trim()) return

    const durationSec = duration ? parseInt(duration) * 60 : undefined
    onAdd({
      title: title.trim(),
      durationSec,
      notes: notes.trim() || undefined,
      type,
    })
  }

  return (
    <div className="space-y-1.5 bg-gray-900 p-2">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Item title..."
        className="w-full bg-gray-800 px-2 py-1 text-[11px] text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-700"
        autoFocus
      />

      <div className="flex gap-1">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as RundownItemType)}
          className="bg-gray-800 px-1.5 py-1 text-[10px] font-mono text-gray-400 focus:outline-none"
        >
          {Object.entries(ITEM_TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>

        <input
          type="number"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          placeholder="Min"
          className="w-14 bg-gray-800 px-1.5 py-1 text-[10px] font-mono text-white placeholder-gray-600 focus:outline-none"
        />
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes..."
        rows={2}
        className="w-full resize-none bg-gray-800 px-2 py-1 text-[10px] text-white placeholder-gray-600 focus:outline-none"
      />

      <div className="flex justify-end gap-1">
        <button
          onClick={onCancel}
          className="px-2 py-0.5 text-[9px] font-mono text-gray-500 hover:text-gray-400"
        >
          CANCEL
        </button>
        <button
          onClick={handleSubmit}
          disabled={!title.trim()}
          className="bg-primary-900/50 px-2 py-0.5 text-[9px] font-mono text-primary-400 hover:bg-primary-900/70 disabled:opacity-50"
        >
          ADD
        </button>
      </div>
    </div>
  )
}

function CreateRundownForm({
  onCreate,
}: {
  onCreate: (name: string) => void
}) {
  const [name, setName] = useState('')

  return (
    <div className="p-3 text-center">
      <p className="mb-2 text-[10px] font-mono text-gray-600">NO RUNDOWN</p>
      <div className="flex gap-1">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Rundown name..."
          className="flex-1 bg-gray-900 px-2 py-1 text-[11px] text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-700"
        />
        <button
          onClick={() => name.trim() && onCreate(name.trim())}
          disabled={!name.trim()}
          className="bg-primary-900/50 px-2 py-1 text-[10px] font-mono text-primary-400 hover:bg-primary-900/70 disabled:opacity-50"
        >
          CREATE
        </button>
      </div>
    </div>
  )
}

export function RundownPanel({
  roomId: _roomId,
  isHost,
  rundown,
  onSetCurrentItem,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onCreateRundown,
}: RundownPanelProps) {
  const [showAddForm, setShowAddForm] = useState(false)

  const { totalDuration, elapsedDuration, currentIndex: _currentIndex } = useMemo(() => {
    if (!rundown?.items.length) return { totalDuration: 0, elapsedDuration: 0, currentIndex: -1 }

    let total = 0
    let elapsed = 0
    let currIdx = -1

    rundown.items.forEach((item, idx) => {
      if (item.durationSec) total += item.durationSec
      if (item.isCompleted && item.durationSec) elapsed += item.durationSec
      if (item.isCurrent) currIdx = idx
    })

    return { totalDuration: total, elapsedDuration: elapsed, currentIndex: currIdx }
  }, [rundown])

  const handleAddItem = useCallback((item: { title: string; durationSec?: number; notes?: string; type?: RundownItemType }) => {
    onAddItem?.(item)
    setShowAddForm(false)
  }, [onAddItem])

  // No rundown yet
  if (!rundown && isHost && onCreateRundown) {
    return (
      <div className="flex flex-col bg-black">
        <div className="border-b border-gray-800 px-2 py-1.5">
          <h3 className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Rundown</h3>
        </div>
        <CreateRundownForm onCreate={onCreateRundown} />
      </div>
    )
  }

  if (!rundown) {
    return (
      <div className="flex flex-col bg-black p-3">
        <h3 className="mb-1 text-[10px] font-mono uppercase tracking-wider text-gray-500">Rundown</h3>
        <p className="text-[10px] font-mono text-gray-600">NO RUNDOWN</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col bg-black">
      {/* Header */}
      <div className="border-b border-gray-800 px-2 py-1.5">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
            {rundown.name}
          </h3>
          <div className="text-[9px] font-mono text-gray-600">
            {rundown.items.length} • {formatDuration(totalDuration)}
          </div>
        </div>

        {/* Progress bar */}
        {totalDuration > 0 && (
          <div className="mt-1 h-0.5 overflow-hidden bg-gray-800">
            <div
              className="h-full bg-primary-500 transition-all"
              style={{ width: `${(elapsedDuration / totalDuration) * 100}%` }}
            />
          </div>
        )}
      </div>

      {/* Items List */}
      <div className="max-h-80 space-y-0.5 overflow-y-auto p-1.5">
        {rundown.items.map((item) => (
          <RundownItemRow
            key={item.id}
            item={item}
            isHost={isHost}
            onSetCurrent={() => onSetCurrentItem(item.id)}
            onUpdate={onUpdateItem ? (updates) => onUpdateItem(item.id, updates) : undefined}
            onDelete={onDeleteItem ? () => onDeleteItem(item.id) : undefined}
          />
        ))}

        {rundown.items.length === 0 && (
          <p className="py-6 text-center text-[10px] font-mono text-gray-600">NO ITEMS</p>
        )}
      </div>

      {/* Add Item (Host Only) */}
      {isHost && onAddItem && (
        <div className="border-t border-gray-800 p-1.5">
          {showAddForm ? (
            <AddItemForm
              onAdd={handleAddItem}
              onCancel={() => setShowAddForm(false)}
            />
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full bg-gray-900 py-1.5 text-[10px] font-mono text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-400"
            >
              + ADD ITEM
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Compact view for talent (read-only, shows current + next)
export function RundownCompact({
  rundown,
}: {
  rundown: Rundown | null
}) {
  if (!rundown?.items.length) return null

  const currentItem = rundown.items.find((i) => i.isCurrent)
  const currentIndex = currentItem ? rundown.items.indexOf(currentItem) : -1
  const nextItem = currentIndex >= 0 ? rundown.items[currentIndex + 1] : rundown.items[0]

  return (
    <div className="bg-gray-900 p-2">
      <h4 className="mb-1.5 text-[9px] font-mono uppercase tracking-wider text-gray-600">
        Rundown
      </h4>

      {currentItem && (
        <div className="mb-1.5">
          <div className="text-[9px] font-mono font-medium text-green-500">NOW</div>
          <div className="text-[11px] font-medium text-white">{currentItem.title}</div>
          {currentItem.durationSec && (
            <div className="text-[9px] font-mono text-gray-600">{formatDuration(currentItem.durationSec)}</div>
          )}
        </div>
      )}

      {nextItem && nextItem !== currentItem && (
        <div className="border-t border-gray-800 pt-1.5">
          <div className="text-[9px] font-mono font-medium text-yellow-500">NEXT</div>
          <div className="text-[10px] text-gray-400">{nextItem.title}</div>
          {nextItem.durationSec && (
            <div className="text-[9px] font-mono text-gray-600">{formatDuration(nextItem.durationSec)}</div>
          )}
        </div>
      )}
    </div>
  )
}
