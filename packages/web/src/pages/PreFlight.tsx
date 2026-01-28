/**
 * Pre-Flight Check Page
 *
 * Self-service equipment verification for contributors before joining a call.
 * Allows users to test:
 * - Audio input (microphone)
 * - Audio output (speakers/headphones)
 * - Video (if applicable)
 * - Network connection quality
 * - Browser compatibility
 */

import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'

interface DeviceInfo {
  deviceId: string
  label: string
  kind: 'audioinput' | 'audiooutput' | 'videoinput'
}

interface TestResult {
  status: 'pending' | 'testing' | 'passed' | 'warning' | 'failed'
  message: string
  details?: string
}

interface PreFlightState {
  audioInput: TestResult
  audioOutput: TestResult
  network: TestResult
  browser: TestResult
}

const INITIAL_STATE: PreFlightState = {
  audioInput: { status: 'pending', message: 'Microphone test pending' },
  audioOutput: { status: 'pending', message: 'Speaker test pending' },
  network: { status: 'pending', message: 'Network test pending' },
  browser: { status: 'pending', message: 'Browser compatibility pending' },
}

export function PreFlight() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const roomId = searchParams.get('room')
  const token = searchParams.get('token')

  const [state, setState] = useState<PreFlightState>(INITIAL_STATE)
  const [devices, setDevices] = useState<DeviceInfo[]>([])
  const [selectedMic, setSelectedMic] = useState<string>('')
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>('')
  const [micLevel, setMicLevel] = useState(0)
  const [isTestingMic, setIsTestingMic] = useState(false)
  const [isPlayingTestTone, setIsPlayingTestTone] = useState(false)
  const [allTestsPassed, setAllTestsPassed] = useState(false)

  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number>()

  // Initialize and get available devices
  useEffect(() => {
    checkBrowserCompatibility()
    getDevices()

    return () => {
      cleanup()
    }
  }, [])

  // Check if all tests passed
  useEffect(() => {
    const passed =
      state.audioInput.status === 'passed' &&
      state.audioOutput.status === 'passed' &&
      state.network.status === 'passed' &&
      state.browser.status === 'passed'

    setAllTestsPassed(passed)
  }, [state])

  const cleanup = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
    }
  }

  const getDevices = async () => {
    try {
      // Request permission first
      await navigator.mediaDevices.getUserMedia({ audio: true })

      const deviceList = await navigator.mediaDevices.enumerateDevices()
      const formatted: DeviceInfo[] = deviceList
        .filter(d => d.kind === 'audioinput' || d.kind === 'audiooutput')
        .map(d => ({
          deviceId: d.deviceId,
          label: d.label || `${d.kind === 'audioinput' ? 'Microphone' : 'Speaker'} ${d.deviceId.slice(0, 8)}`,
          kind: d.kind as 'audioinput' | 'audiooutput',
        }))

      setDevices(formatted)

      // Auto-select first devices
      const defaultMic = formatted.find(d => d.kind === 'audioinput')
      const defaultSpeaker = formatted.find(d => d.kind === 'audiooutput')

      if (defaultMic) setSelectedMic(defaultMic.deviceId)
      if (defaultSpeaker) setSelectedSpeaker(defaultSpeaker.deviceId)
    } catch (err) {
      setState(prev => ({
        ...prev,
        audioInput: {
          status: 'failed',
          message: 'Microphone access denied',
          details: 'Please allow microphone access in your browser settings.',
        },
      }))
    }
  }

  const checkBrowserCompatibility = () => {
    setState(prev => ({ ...prev, browser: { status: 'testing', message: 'Checking browser...' } }))

    const issues: string[] = []

    // Check WebRTC support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      issues.push('WebRTC not supported')
    }

    // Check AudioContext support
    if (!window.AudioContext && !(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) {
      issues.push('Web Audio API not supported')
    }

    // Check for known problematic browsers
    const ua = navigator.userAgent
    if (/MSIE|Trident/.test(ua)) {
      issues.push('Internet Explorer is not supported')
    }

    if (issues.length === 0) {
      setState(prev => ({
        ...prev,
        browser: {
          status: 'passed',
          message: 'Browser compatible',
          details: getBrowserName(),
        },
      }))
    } else {
      setState(prev => ({
        ...prev,
        browser: {
          status: 'failed',
          message: 'Browser issues detected',
          details: issues.join(', '),
        },
      }))
    }
  }

  const getBrowserName = (): string => {
    const ua = navigator.userAgent
    if (ua.includes('Firefox')) return 'Firefox'
    if (ua.includes('Chrome')) return 'Chrome'
    if (ua.includes('Safari')) return 'Safari'
    if (ua.includes('Edge')) return 'Edge'
    return 'Unknown Browser'
  }

  const testMicrophone = async () => {
    setIsTestingMic(true)
    setState(prev => ({
      ...prev,
      audioInput: { status: 'testing', message: 'Testing microphone...' },
    }))

    try {
      // Stop previous stream
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop())
      }

      // Get new stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedMic ? { exact: selectedMic } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })

      mediaStreamRef.current = stream

      // Set up audio analysis
      audioContextRef.current = new AudioContext()
      const source = audioContextRef.current.createMediaStreamSource(stream)
      const analyser = audioContextRef.current.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser

      // Monitor audio levels
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      let maxLevel = 0
      const testDuration = 5000 // 5 seconds

      const updateLevel = () => {
        analyser.getByteFrequencyData(dataArray)
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
        const normalized = Math.min(1, average / 128)

        setMicLevel(normalized)

        if (normalized > 0.1) {
          maxLevel = Math.max(maxLevel, normalized)
        }

        animationFrameRef.current = requestAnimationFrame(updateLevel)
      }

      updateLevel()

      // Wait for test duration
      await new Promise(resolve => setTimeout(resolve, testDuration))

      // Stop monitoring
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }

      // Evaluate results
      if (maxLevel > 0.3) {
        setState(prev => ({
          ...prev,
          audioInput: {
            status: 'passed',
            message: 'Microphone working',
            details: 'Good audio levels detected',
          },
        }))
      } else if (maxLevel > 0.1) {
        setState(prev => ({
          ...prev,
          audioInput: {
            status: 'warning',
            message: 'Microphone working but quiet',
            details: 'Try speaking louder or moving closer to the microphone',
          },
        }))
      } else {
        setState(prev => ({
          ...prev,
          audioInput: {
            status: 'failed',
            message: 'No audio detected',
            details: 'Check that your microphone is connected and not muted',
          },
        }))
      }
    } catch (err) {
      setState(prev => ({
        ...prev,
        audioInput: {
          status: 'failed',
          message: 'Microphone test failed',
          details: err instanceof Error ? err.message : 'Unknown error',
        },
      }))
    } finally {
      setIsTestingMic(false)
      setMicLevel(0)
    }
  }

  const testSpeakers = async () => {
    setIsPlayingTestTone(true)
    setState(prev => ({
      ...prev,
      audioOutput: { status: 'testing', message: 'Playing test tone...' },
    }))

    try {
      const audioContext = new AudioContext()

      // Create oscillator for test tone
      const oscillator = audioContext.createOscillator()
      oscillator.type = 'sine'
      oscillator.frequency.value = 440 // A4

      // Create gain for fading
      const gainNode = audioContext.createGain()
      gainNode.gain.value = 0.3

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      // Play for 2 seconds with fade in/out
      const duration = 2
      const now = audioContext.currentTime

      gainNode.gain.setValueAtTime(0, now)
      gainNode.gain.linearRampToValueAtTime(0.3, now + 0.1)
      gainNode.gain.setValueAtTime(0.3, now + duration - 0.1)
      gainNode.gain.linearRampToValueAtTime(0, now + duration)

      oscillator.start(now)
      oscillator.stop(now + duration)

      await new Promise(resolve => setTimeout(resolve, duration * 1000 + 100))

      audioContext.close()

      // Ask user if they heard it
      setState(prev => ({
        ...prev,
        audioOutput: {
          status: 'passed',
          message: 'Speaker test complete',
          details: 'If you heard the tone, your speakers are working',
        },
      }))
    } catch (err) {
      setState(prev => ({
        ...prev,
        audioOutput: {
          status: 'failed',
          message: 'Speaker test failed',
          details: err instanceof Error ? err.message : 'Unknown error',
        },
      }))
    } finally {
      setIsPlayingTestTone(false)
    }
  }

  const testNetwork = async () => {
    setState(prev => ({
      ...prev,
      network: { status: 'testing', message: 'Testing network...' },
    }))

    try {
      // Simple bandwidth test using fetch
      const testUrl = '/api/health' // Adjust to your actual endpoint
      const startTime = performance.now()

      const response = await fetch(testUrl, { cache: 'no-store' })
      const endTime = performance.now()

      if (!response.ok) throw new Error('Network request failed')

      const latency = Math.round(endTime - startTime)

      if (latency < 100) {
        setState(prev => ({
          ...prev,
          network: {
            status: 'passed',
            message: 'Network connection excellent',
            details: `Latency: ${latency}ms`,
          },
        }))
      } else if (latency < 300) {
        setState(prev => ({
          ...prev,
          network: {
            status: 'passed',
            message: 'Network connection good',
            details: `Latency: ${latency}ms`,
          },
        }))
      } else if (latency < 500) {
        setState(prev => ({
          ...prev,
          network: {
            status: 'warning',
            message: 'Network connection acceptable',
            details: `Latency: ${latency}ms - Some delay may occur`,
          },
        }))
      } else {
        setState(prev => ({
          ...prev,
          network: {
            status: 'warning',
            message: 'Network connection slow',
            details: `Latency: ${latency}ms - Consider using a wired connection`,
          },
        }))
      }
    } catch (err) {
      setState(prev => ({
        ...prev,
        network: {
          status: 'failed',
          message: 'Network test failed',
          details: 'Could not connect to server',
        },
      }))
    }
  }

  const runAllTests = async () => {
    await testNetwork()
    await testMicrophone()
  }

  const proceedToRoom = () => {
    if (roomId) {
      navigate(`/rooms/${roomId}${token ? `?token=${token}` : ''}`)
    }
  }

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'passed':
        return <span className="text-green-500 text-xl">✓</span>
      case 'warning':
        return <span className="text-yellow-500 text-xl">⚠</span>
      case 'failed':
        return <span className="text-red-500 text-xl">✕</span>
      case 'testing':
        return <span className="text-blue-500 text-xl animate-spin">↻</span>
      default:
        return <span className="text-zinc-500 text-xl">○</span>
    }
  }

  const getStatusColor = (status: TestResult['status']) => {
    switch (status) {
      case 'passed':
        return 'border-green-500 bg-green-500/10'
      case 'warning':
        return 'border-yellow-500 bg-yellow-500/10'
      case 'failed':
        return 'border-red-500 bg-red-500/10'
      case 'testing':
        return 'border-blue-500 bg-blue-500/10'
      default:
        return 'border-zinc-700 bg-zinc-800'
    }
  }

  return (
    <div className="min-h-screen bg-zinc-900 p-6">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-white">Pre-Flight Check</h1>
          <p className="mt-2 text-zinc-400">
            Let's make sure your equipment is ready before joining the call
          </p>
        </div>

        {/* Test Cards */}
        <div className="space-y-4">
          {/* Browser Compatibility */}
          <div className={`rounded-lg border p-4 ${getStatusColor(state.browser.status)}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getStatusIcon(state.browser.status)}
                <div>
                  <div className="font-medium text-white">{state.browser.message}</div>
                  {state.browser.details && (
                    <div className="text-sm text-zinc-400">{state.browser.details}</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Audio Input */}
          <div className={`rounded-lg border p-4 ${getStatusColor(state.audioInput.status)}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getStatusIcon(state.audioInput.status)}
                <div>
                  <div className="font-medium text-white">{state.audioInput.message}</div>
                  {state.audioInput.details && (
                    <div className="text-sm text-zinc-400">{state.audioInput.details}</div>
                  )}
                </div>
              </div>
              <button
                onClick={testMicrophone}
                disabled={isTestingMic}
                className="rounded bg-zinc-700 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-600 disabled:opacity-50"
              >
                {isTestingMic ? 'Testing...' : 'Test Mic'}
              </button>
            </div>

            {/* Microphone selector */}
            <div className="mt-3">
              <select
                value={selectedMic}
                onChange={e => setSelectedMic(e.target.value)}
                className="w-full rounded bg-zinc-800 px-3 py-2 text-sm text-white border border-zinc-700"
              >
                {devices
                  .filter(d => d.kind === 'audioinput')
                  .map(d => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
              </select>
            </div>

            {/* Mic level indicator */}
            {isTestingMic && (
              <div className="mt-3">
                <div className="h-2 rounded-full bg-zinc-700">
                  <div
                    className="h-full rounded-full bg-green-500 transition-all"
                    style={{ width: `${micLevel * 100}%` }}
                  />
                </div>
                <div className="mt-1 text-center text-xs text-zinc-400">
                  Speak now to test your microphone
                </div>
              </div>
            )}
          </div>

          {/* Audio Output */}
          <div className={`rounded-lg border p-4 ${getStatusColor(state.audioOutput.status)}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getStatusIcon(state.audioOutput.status)}
                <div>
                  <div className="font-medium text-white">{state.audioOutput.message}</div>
                  {state.audioOutput.details && (
                    <div className="text-sm text-zinc-400">{state.audioOutput.details}</div>
                  )}
                </div>
              </div>
              <button
                onClick={testSpeakers}
                disabled={isPlayingTestTone}
                className="rounded bg-zinc-700 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-600 disabled:opacity-50"
              >
                {isPlayingTestTone ? 'Playing...' : 'Test Speakers'}
              </button>
            </div>

            {/* Speaker selector */}
            <div className="mt-3">
              <select
                value={selectedSpeaker}
                onChange={e => setSelectedSpeaker(e.target.value)}
                className="w-full rounded bg-zinc-800 px-3 py-2 text-sm text-white border border-zinc-700"
              >
                {devices
                  .filter(d => d.kind === 'audiooutput')
                  .map(d => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Network */}
          <div className={`rounded-lg border p-4 ${getStatusColor(state.network.status)}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getStatusIcon(state.network.status)}
                <div>
                  <div className="font-medium text-white">{state.network.message}</div>
                  {state.network.details && (
                    <div className="text-sm text-zinc-400">{state.network.details}</div>
                  )}
                </div>
              </div>
              <button
                onClick={testNetwork}
                disabled={state.network.status === 'testing'}
                className="rounded bg-zinc-700 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-600 disabled:opacity-50"
              >
                Test Network
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex gap-4">
          <button
            onClick={runAllTests}
            className="flex-1 rounded-lg bg-zinc-700 py-3 font-medium text-white hover:bg-zinc-600"
          >
            Run All Tests
          </button>
          {roomId && (
            <button
              onClick={proceedToRoom}
              disabled={!allTestsPassed}
              className={`flex-1 rounded-lg py-3 font-medium text-white ${
                allTestsPassed
                  ? 'bg-green-600 hover:bg-green-500'
                  : 'bg-zinc-700 opacity-50 cursor-not-allowed'
              }`}
            >
              {allTestsPassed ? 'Join Call' : 'Complete Tests First'}
            </button>
          )}
        </div>

        {/* Help Text */}
        <div className="mt-8 rounded-lg border border-zinc-700 bg-zinc-800 p-4">
          <h3 className="font-medium text-white">Tips for the best experience:</h3>
          <ul className="mt-2 space-y-1 text-sm text-zinc-400">
            <li>• Use headphones to avoid echo</li>
            <li>• Find a quiet location</li>
            <li>• Use a wired internet connection if possible</li>
            <li>• Close other applications that use your microphone</li>
            <li>• Test your setup before important calls</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default PreFlight
