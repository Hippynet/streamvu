import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '../stores/authStore'
import { useStreamStore } from '../stores/streamStore'
import { getWsUrl } from '../config'

let socket: Socket | null = null

export function connectSocket(): Socket | null {
  const { tokens } = useAuthStore.getState()

  if (!tokens?.accessToken) {
    console.warn('Cannot connect socket: not authenticated')
    return null
  }

  if (socket?.connected) {
    return socket
  }

  socket = io(getWsUrl(), {
    auth: {
      token: tokens.accessToken,
    },
  })

  socket.on('connect', () => {
    console.log('Socket connected')
    socket?.emit('subscribe:streams')
  })

  socket.on('disconnect', () => {
    console.log('Socket disconnected')
  })

  socket.on(
    'stream:status',
    (data: { streamId: string; isOnline: boolean; bitrate?: number; listeners?: number }) => {
      useStreamStore
        .getState()
        .updateStreamStatus(data.streamId, data.isOnline, data.bitrate, data.listeners)
    }
  )

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error.message)
  })

  return socket
}

export function disconnectSocket(): void {
  if (socket) {
    socket.emit('unsubscribe:streams')
    socket.disconnect()
    socket = null
  }
}

export function getSocket(): Socket | null {
  return socket
}
