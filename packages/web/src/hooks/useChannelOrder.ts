/**
 * Channel Order Hook
 *
 * Manages the order of mixer channels per room.
 * Order is persisted to localStorage.
 */

import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY_PREFIX = 'streamvu-channel-order-'

interface UseChannelOrderOptions {
  roomId: string
  channelIds: string[]
}

interface UseChannelOrderReturn {
  /** Ordered list of channel IDs */
  orderedIds: string[]
  /** Move a channel from one position to another */
  moveChannel: (fromIndex: number, toIndex: number) => void
  /** Reset to default order (as provided by channelIds) */
  resetOrder: () => void
  /** Check if order has been customized */
  isCustomOrder: boolean
}

export function useChannelOrder({
  roomId,
  channelIds,
}: UseChannelOrderOptions): UseChannelOrderReturn {
  const storageKey = `${STORAGE_KEY_PREFIX}${roomId}`

  // Load saved order from localStorage
  const [savedOrder, setSavedOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        return JSON.parse(saved)
      }
    } catch {
      // Ignore parse errors
    }
    return []
  })

  // Compute ordered IDs based on saved order and current channels
  const orderedIds = useCallback(() => {
    if (savedOrder.length === 0) {
      return channelIds
    }

    // Filter saved order to only include channels that still exist
    const validSavedOrder = savedOrder.filter((id) => channelIds.includes(id))

    // Find any new channels not in saved order
    const newChannels = channelIds.filter((id) => !savedOrder.includes(id))

    // Combine: saved order first, then new channels at the end
    return [...validSavedOrder, ...newChannels]
  }, [savedOrder, channelIds])()

  // Move a channel from one position to another
  const moveChannel = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return
      if (fromIndex < 0 || fromIndex >= orderedIds.length) return
      if (toIndex < 0 || toIndex >= orderedIds.length) return

      const newOrder = [...orderedIds]
      const [moved] = newOrder.splice(fromIndex, 1)
      newOrder.splice(toIndex, 0, moved)

      setSavedOrder(newOrder)
      localStorage.setItem(storageKey, JSON.stringify(newOrder))
    },
    [orderedIds, storageKey]
  )

  // Reset to default order
  const resetOrder = useCallback(() => {
    setSavedOrder([])
    localStorage.removeItem(storageKey)
  }, [storageKey])

  // Check if order has been customized
  const isCustomOrder = savedOrder.length > 0

  // Sync storage when roomId changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        setSavedOrder(JSON.parse(saved))
      } else {
        setSavedOrder([])
      }
    } catch {
      setSavedOrder([])
    }
  }, [storageKey])

  return {
    orderedIds,
    moveChannel,
    resetOrder,
    isCustomOrder,
  }
}

/**
 * Helper to create drag handlers for channel reordering
 */
export function createDragHandlers(
  channelId: string,
  index: number,
  moveChannel: (from: number, to: number) => void
) {
  let draggedIndex: number | null = null

  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      draggedIndex = index
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', channelId)
      // Add visual feedback
      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.style.opacity = '0.5'
      }
    },
    onDragEnd: (e: React.DragEvent) => {
      draggedIndex = null
      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.style.opacity = '1'
      }
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      const fromId = e.dataTransfer.getData('text/plain')
      if (fromId && fromId !== channelId && draggedIndex !== null) {
        moveChannel(draggedIndex, index)
      }
    },
  }
}
