/**
 * Centralized configuration for the StreamVU web application.
 * All environment-dependent values should be accessed through this module.
 *
 * Environment Variables:
 * - VITE_API_URL: Backend API URL (e.g., "https://api.streamvu.example.com")
 * - VITE_APP_URL: Frontend app URL for OAuth callbacks (e.g., "https://streamvu.example.com")
 * - VITE_WS_URL: WebSocket URL if different from API (optional, defaults to API_URL)
 */

/**
 * Get the API URL dynamically based on the current browser location.
 * This allows the app to work on localhost AND network IPs without configuration.
 */
function getApiUrl(): string {
  // Explicit configuration takes priority
  const envUrl = import.meta.env.VITE_API_URL
  if (envUrl && envUrl.trim() !== '') {
    return envUrl
  }

  // Auto-detect based on current browser location
  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location
    return `${protocol}//${hostname}:3002`
  }

  // Fallback for SSR or non-browser environments
  return 'http://localhost:3002'
}

/**
 * Get WebSocket URL for Socket.io connections.
 * Defaults to API URL but can be overridden.
 */
function getWsUrl(): string {
  const envUrl = import.meta.env.VITE_WS_URL
  if (envUrl && envUrl.trim() !== '') {
    return envUrl
  }
  return getApiUrl()
}

/**
 * Get the app's public URL for OAuth callbacks and sharing.
 */
function getAppUrl(): string {
  const envUrl = import.meta.env.VITE_APP_URL
  if (envUrl && envUrl.trim() !== '') {
    return envUrl
  }
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return 'http://localhost:3003'
}

// Use getters to ensure values are computed at access time, not module load time
export const config = {
  get api() {
    return {
      url: getApiUrl(),
      timeout: 30000,
    }
  },

  get ws() {
    return {
      url: getWsUrl(),
      reconnectAttempts: 5,
      reconnectDelay: 1000,
    }
  },

  get app() {
    return {
      url: getAppUrl(),
      name: 'StreamVU',
      version: import.meta.env.VITE_APP_VERSION || '1.0.0',
    }
  },

  features: {
    googleOAuth: !!import.meta.env.VITE_GOOGLE_CLIENT_ID,
    bondedConnections: !!import.meta.env.VITE_ENABLE_BONDED_CONNECTIONS,
    recordings: true,
    callCenter: true,
  },

  oauth: {
    google: {
      clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
    },
  },

  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
} as const

// Export getters that compute the URL each time they're accessed
export const API_URL = {
  toString: getApiUrl,
  valueOf: getApiUrl,
  get value() { return getApiUrl() },
}

export const WS_URL = {
  toString: getWsUrl,
  valueOf: getWsUrl,
  get value() { return getWsUrl() },
}

export const APP_URL = {
  toString: getAppUrl,
  valueOf: getAppUrl,
  get value() { return getAppUrl() },
}

// For template literals and string concatenation, export functions
export { getApiUrl, getWsUrl, getAppUrl }

// Debug logging in development
if (import.meta.env.DEV && typeof window !== 'undefined') {
  // Log after a small delay to ensure window.location is fully set
  setTimeout(() => {
    console.log('[Config] Loaded configuration:', {
      apiUrl: getApiUrl(),
      wsUrl: getWsUrl(),
      appUrl: getAppUrl(),
      isDev: config.isDev,
    })
  }, 0)
}
