/**
 * ReturnVideoPlayer - Program output return feed for contributors
 *
 * Displays the master control program output so contributors can see context.
 * Supports HLS for reliable delivery or WebRTC for ultra-low-latency.
 *
 * Features:
 * - HLS playback via hls.js
 * - WebRTC playback option for <1s latency
 * - ON AIR indicator when contributor is live
 * - Picture-in-picture support
 * - Countdown timer overlay
 * - Sync indicator (lip-sync offset)
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import Hls from 'hls.js'

interface ReturnVideoPlayerProps {
  /** HLS stream URL (m3u8) */
  hlsUrl?: string
  /** WebRTC stream for ultra-low-latency */
  webrtcStream?: MediaStream
  /** Whether the local contributor is currently on-air */
  isOnAir?: boolean
  /** Optional countdown timer value in seconds */
  countdown?: number
  /** Whether to show sync indicator */
  showSyncIndicator?: boolean
  /** Whether the player is minimized/collapsed */
  minimized?: boolean
  /** Callback when user toggles minimized state */
  onToggleMinimize?: () => void
  /** Title to display above the video */
  title?: string
}

export function ReturnVideoPlayer({
  hlsUrl,
  webrtcStream,
  isOnAir = false,
  countdown,
  showSyncIndicator = false,
  minimized = false,
  onToggleMinimize,
  title = 'PROGRAM',
}: ReturnVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [latency, setLatency] = useState<number | null>(null)
  const [isPiP, setIsPiP] = useState(false)

  // Initialize HLS playback
  useEffect(() => {
    const video = videoRef.current
    if (!video || !hlsUrl) return

    // Cleanup previous instance
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
      })

      hls.loadSource(hlsUrl)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {
          // Autoplay blocked - user will need to click
        })
      })

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setError('Network error - retrying...')
              hls.startLoad()
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              setError('Media error - recovering...')
              hls.recoverMediaError()
              break
            default:
              setError('Failed to load stream')
              hls.destroy()
              break
          }
        }
      })

      hlsRef.current = hls

      return () => {
        hls.destroy()
        hlsRef.current = null
      }
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      video.src = hlsUrl
      video.play().catch(() => {
        // Autoplay blocked
      })
    }
  }, [hlsUrl])

  // Initialize WebRTC playback
  useEffect(() => {
    const video = videoRef.current
    if (!video || !webrtcStream) return

    video.srcObject = webrtcStream
    video.play().catch(() => {
      // Autoplay blocked
    })

    return () => {
      video.srcObject = null
    }
  }, [webrtcStream])

  // Track playing state
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleError = () => setError('Playback error')

    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('error', handleError)

    return () => {
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('error', handleError)
    }
  }, [])

  // Measure latency for HLS
  useEffect(() => {
    if (!showSyncIndicator || !hlsRef.current) return

    const interval = setInterval(() => {
      const hls = hlsRef.current
      if (hls && hls.latency !== undefined) {
        setLatency(Math.round(hls.latency * 1000))
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [showSyncIndicator])

  // Picture-in-Picture support
  const togglePiP = useCallback(async () => {
    const video = videoRef.current
    if (!video) return

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
        setIsPiP(false)
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture()
        setIsPiP(true)
      }
    } catch {
      // PiP not supported or failed
    }
  }, [])

  // Track PiP state
  useEffect(() => {
    const handleEnterPiP = () => setIsPiP(true)
    const handleLeavePiP = () => setIsPiP(false)

    document.addEventListener('enterpictureinpicture', handleEnterPiP)
    document.addEventListener('leavepictureinpicture', handleLeavePiP)

    return () => {
      document.removeEventListener('enterpictureinpicture', handleEnterPiP)
      document.removeEventListener('leavepictureinpicture', handleLeavePiP)
    }
  }, [])

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play()
      }
    }
  }

  if (!hlsUrl && !webrtcStream) {
    return (
      <div className="flex flex-col items-center justify-center border border-gray-800 bg-gray-950 p-4 text-center">
        <div className="text-[10px] font-mono text-gray-600 uppercase tracking-wider mb-2">
          Return Feed
        </div>
        <p className="text-xs text-gray-500">No return feed configured</p>
      </div>
    )
  }

  if (minimized) {
    return (
      <button
        onClick={onToggleMinimize}
        className="flex items-center gap-2 border border-gray-800 bg-gray-900 px-2 py-1 text-xs text-gray-400 hover:bg-gray-800"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
        </svg>
        {title}
        {isOnAir && (
          <span className="rounded bg-red-600 px-1 py-0.5 text-[8px] font-bold text-white animate-pulse">
            ON AIR
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="relative overflow-hidden border border-gray-800 bg-black">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 bg-gray-950 px-2 py-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
            {title}
          </span>
          {isOnAir && (
            <span className="rounded bg-red-600 px-1.5 py-0.5 text-[8px] font-bold text-white animate-pulse shadow-[0_0_6px_rgba(220,38,38,0.6)]">
              ON AIR
            </span>
          )}
          {countdown !== undefined && countdown > 0 && (
            <span className="rounded bg-amber-600 px-1.5 py-0.5 text-[10px] font-mono font-bold text-white">
              {countdown}s
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {showSyncIndicator && latency !== null && (
            <span className="text-[9px] font-mono text-gray-500">
              {latency}ms
            </span>
          )}

          {/* Mute button */}
          <button
            onClick={toggleMute}
            className="p-1 text-gray-500 hover:text-white"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? (
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.531V19.94a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.506-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.395C2.806 8.757 3.63 8.25 4.51 8.25H6.75z" />
              </svg>
            ) : (
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
              </svg>
            )}
          </button>

          {/* PiP button */}
          {document.pictureInPictureEnabled && (
            <button
              onClick={togglePiP}
              className={`p-1 ${isPiP ? 'text-primary-400' : 'text-gray-500 hover:text-white'}`}
              title="Picture-in-Picture"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125" />
              </svg>
            </button>
          )}

          {/* Minimize button */}
          {onToggleMinimize && (
            <button
              onClick={onToggleMinimize}
              className="p-1 text-gray-500 hover:text-white"
              title="Minimize"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Video container */}
      <div className="relative aspect-video bg-black">
        <video
          ref={videoRef}
          className="h-full w-full object-contain"
          muted={isMuted}
          playsInline
          autoPlay
        />

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center">
              <p className="text-xs text-red-400">{error}</p>
              <button
                onClick={togglePlay}
                className="mt-2 rounded bg-gray-800 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Play button overlay (when paused) */}
        {!isPlaying && !error && (
          <button
            onClick={togglePlay}
            className="absolute inset-0 flex items-center justify-center bg-black/50"
          >
            <div className="rounded-full bg-white/20 p-4">
              <svg className="h-8 w-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </button>
        )}

        {/* ON AIR overlay (prominent indicator) */}
        {isOnAir && (
          <div className="absolute inset-0 pointer-events-none border-4 border-red-600 animate-pulse" />
        )}

        {/* Countdown overlay */}
        {countdown !== undefined && countdown > 0 && (
          <div className="absolute bottom-4 right-4 rounded bg-amber-600 px-3 py-1.5 text-lg font-mono font-bold text-white shadow-lg">
            {countdown}
          </div>
        )}
      </div>
    </div>
  )
}

export default ReturnVideoPlayer
