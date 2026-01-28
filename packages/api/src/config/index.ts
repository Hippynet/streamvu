import { config as dotenvConfig } from 'dotenv'

dotenvConfig()

/**
 * Determine if we're in production mode
 */
const isProduction = process.env.NODE_ENV === 'production'

/**
 * Parse CORS origins from environment variable.
 * Supports:
 * - Single origin: "https://app.example.com"
 * - Multiple origins: "https://app.example.com,https://admin.example.com"
 * - Wildcard in development: "*"
 */
function parseCorsOrigin(): string | string[] | boolean {
  const corsOrigin = process.env.CORS_ORIGIN

  if (!corsOrigin) {
    // Default: allow both localhost and 127.0.0.1 in development
    return isProduction ? false : ['http://localhost:3003', 'http://127.0.0.1:3003']
  }

  if (corsOrigin === '*') {
    if (isProduction) {
      console.warn('[Config] WARNING: CORS_ORIGIN="*" is insecure in production!')
    }
    return true // Allow all origins
  }

  if (corsOrigin.includes(',')) {
    return corsOrigin.split(',').map((o) => o.trim())
  }

  return corsOrigin
}

/**
 * Parse trusted proxies for rate limiting and IP detection
 */
function parseTrustedProxies(): string[] {
  const proxies = process.env.TRUSTED_PROXIES
  if (!proxies) return []
  return proxies.split(',').map((p) => p.trim())
}

export const config = {
  // Environment
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction,
  isDevelopment: !isProduction,

  // Server
  port: parseInt(process.env.API_PORT || process.env.PORT || '3002', 10),
  host: process.env.API_HOST || '0.0.0.0',

  // Public URL (for generating links in emails, callbacks, etc.)
  publicUrl: process.env.PUBLIC_URL || (isProduction ? '' : 'http://localhost:3002'),
  frontendUrl: process.env.FRONTEND_URL || (isProduction ? '' : 'http://localhost:3003'),

  // Database
  database: {
    url: process.env.DATABASE_URL || '',
  },

  // JWT Authentication
  jwt: {
    secret: process.env.JWT_SECRET || '',
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  },

  // CORS
  cors: {
    origin: parseCorsOrigin(),
    credentials: true,
  },

  // Google OAuth
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || '',
    enabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  },

  // WHMCS Integration
  whmcs: {
    secret: process.env.WHMCS_SECRET || '',
    enabled: !!process.env.WHMCS_SECRET,
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10), // 1 minute
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
    format: process.env.LOG_FORMAT || (isProduction ? 'json' : 'pretty'),
  },

  // Trusted Proxies (for correct IP detection behind load balancers)
  trustedProxies: parseTrustedProxies(),

  // Feature Flags
  features: {
    callCenter: process.env.FEATURE_CALL_CENTER !== 'false',
    recordings: process.env.FEATURE_RECORDINGS !== 'false',
  },
} as const

export type AppConfig = typeof config

/**
 * Validate configuration and throw/warn for missing required values
 */
export function validateConfig(): void {
  const errors: string[] = []
  const warnings: string[] = []

  // Required in all environments
  if (!config.database.url) {
    errors.push('DATABASE_URL is required')
  }

  if (!config.jwt.secret) {
    if (isProduction) {
      errors.push('JWT_SECRET is required in production')
    } else {
      // Set a dev default
      ;(config.jwt as { secret: string }).secret = 'dev-secret-do-not-use-in-production'
      warnings.push('JWT_SECRET not set, using insecure default for development')
    }
  }

  // Production-only requirements
  if (isProduction) {
    if (!config.publicUrl) {
      errors.push('PUBLIC_URL is required in production')
    }

    if (!config.frontendUrl) {
      errors.push('FRONTEND_URL is required in production')
    }

    if (config.cors.origin === true) {
      warnings.push('CORS allows all origins (*) - this is insecure in production')
    }
  }

  // Optional but recommended warnings
  if (!config.google.enabled) {
    warnings.push('Google OAuth not configured (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)')
  }

  if (!config.whmcs.enabled) {
    warnings.push('WHMCS integration not configured')
  }

  // Output warnings
  warnings.forEach((w) => console.warn(`[Config] WARNING: ${w}`))

  // Throw if there are errors
  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.map((e) => `  - ${e}`).join('\n')}`)
  }

  console.log('[Config] Configuration validated successfully')
  if (!isProduction) {
    console.log('[Config] Running in development mode')
    console.log(`[Config] API URL: http://${config.host}:${config.port}`)
  }
}
