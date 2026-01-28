import { useEffect } from 'react'
import { useStreamStore } from '../stores/streamStore'
import { api } from '../services/api'

export function useStreams() {
  const { streams, loading, error, setStreams, setLoading, setError } = useStreamStore()

  useEffect(() => {
    const fetchStreams = async () => {
      setLoading(true)
      try {
        const data = await api.streams.list()
        setStreams(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load streams')
      }
    }

    fetchStreams()
  }, [setStreams, setLoading, setError])

  const refresh = async () => {
    setLoading(true)
    try {
      const data = await api.streams.list()
      setStreams(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh streams')
    }
  }

  return { streams, loading, error, refresh }
}
