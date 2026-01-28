import { create } from 'zustand'
import type { StreamWithHealth } from '@streamvu/shared'

interface StreamState {
  streams: StreamWithHealth[]
  loading: boolean
  error: string | null
  setStreams: (streams: StreamWithHealth[]) => void
  updateStreamStatus: (
    streamId: string,
    isOnline: boolean,
    bitrate?: number,
    listeners?: number
  ) => void
  addStream: (stream: StreamWithHealth) => void
  updateStream: (streamId: string, updates: Partial<StreamWithHealth>) => void
  removeStream: (streamId: string) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export const useStreamStore = create<StreamState>((set) => ({
  streams: [],
  loading: false,
  error: null,

  setStreams: (streams) => set({ streams, loading: false, error: null }),

  updateStreamStatus: (streamId, isOnline, bitrate, listeners) =>
    set((state) => ({
      streams: state.streams.map((stream) =>
        stream.id === streamId
          ? {
              ...stream,
              latestHealth: {
                id: 'live',
                streamId,
                isOnline,
                bitrate: bitrate ?? null,
                listeners: listeners ?? null,
                responseMs: null,
                checkedAt: new Date().toISOString(),
                contentType: null,
                codec: null,
                sampleRate: null,
                channels: null,
                serverType: null,
                stationName: null,
                genre: null,
                currentTitle: null,
                serverDesc: null,
                icyUrl: null,
                icyPub: null,
                audioInfo: null,
              },
            }
          : stream
      ),
    })),

  addStream: (stream) =>
    set((state) => ({
      streams: [...state.streams, stream],
    })),

  updateStream: (streamId, updates) =>
    set((state) => ({
      streams: state.streams.map((stream) =>
        stream.id === streamId ? { ...stream, ...updates } : stream
      ),
    })),

  removeStream: (streamId) =>
    set((state) => ({
      streams: state.streams.filter((s) => s.id !== streamId),
    })),

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
}))
