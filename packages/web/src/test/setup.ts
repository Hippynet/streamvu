import '@testing-library/jest-dom'

// Mock window.matchMedia for tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// Mock ResizeObserver
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

// Mock AudioContext for VU meter tests
globalThis.AudioContext = class AudioContext {
  createAnalyser() {
    return {
      fftSize: 2048,
      smoothingTimeConstant: 0.8,
      connect: () => {},
      getFloatTimeDomainData: () => {},
    }
  }
  createMediaElementSource() {
    return { connect: () => {} }
  }
  createChannelSplitter() {
    return { connect: () => {} }
  }
  createMediaStreamDestination() {
    return { stream: new MediaStream() }
  }
  createGain() {
    return { connect: () => {}, gain: { value: 1 } }
  }
  get destination() {
    return {}
  }
  close() {}
} as unknown as typeof AudioContext
