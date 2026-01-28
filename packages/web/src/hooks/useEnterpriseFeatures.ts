import { useState, useCallback, useEffect, useRef } from 'react'

/**
 * Room summary for multi-room management
 */
export interface RoomSummary {
  id: string
  name: string
  isActive: boolean
  participantCount: number
  maxParticipants: number
  createdAt: string
  hostName: string
  // Status indicators
  isRecording: boolean
  hasActiveOutput: boolean
  currentRundownItem?: string
  // Quality metrics
  averageConnectionQuality: number
  issueCount: number
}

/**
 * Analytics data structures
 */
export interface UsageAnalytics {
  // Room metrics
  totalRooms: number
  activeRooms: number
  totalParticipants: number
  peakParticipants: number
  averageSessionDuration: number
  // Time-based data
  roomsOverTime: TimeSeriesData[]
  participantsOverTime: TimeSeriesData[]
  // Quality metrics
  averageConnectionQuality: number
  packetLossRate: number
  averageLatency: number
  // Output metrics
  totalOutputs: number
  activeOutputs: number
  bytesStreamed: number
  // Recording metrics
  totalRecordings: number
  recordingHours: number
  storageUsed: number
}

export interface TimeSeriesData {
  timestamp: string
  value: number
}

export interface AlertConfig {
  id: string
  name: string
  type: AlertType
  threshold: number
  enabled: boolean
  notifyEmail: boolean
  notifyWebhook: boolean
  webhookUrl?: string
}

export type AlertType =
  | 'room_participant_count'
  | 'connection_quality'
  | 'packet_loss'
  | 'recording_storage'
  | 'output_disconnected'
  | 'high_latency'

export interface Alert {
  id: string
  configId: string
  roomId?: string
  type: AlertType
  severity: 'warning' | 'critical'
  message: string
  timestamp: string
  acknowledged: boolean
}

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  id: string
  timestamp: string
  userId: string
  userName: string
  action: AuditAction
  resourceType: string
  resourceId: string
  details: Record<string, unknown>
  ipAddress?: string
}

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'join'
  | 'leave'
  | 'start_recording'
  | 'stop_recording'
  | 'connect_output'
  | 'disconnect_output'
  | 'send_cue'
  | 'kick_participant'

interface UseEnterpriseFeaturesOptions {
  organizationId?: string // Used for scoping API requests
  pollingIntervalMs?: number
}

interface UseEnterpriseFeaturesReturn {
  // Multi-room management
  rooms: RoomSummary[]
  activeRoomsCount: number
  totalParticipants: number
  refreshRooms: () => Promise<void>
  // Analytics
  analytics: UsageAnalytics | null
  refreshAnalytics: () => Promise<void>
  getAnalyticsForPeriod: (startDate: Date, endDate: Date) => Promise<UsageAnalytics | null>
  // Alerts
  alerts: Alert[]
  alertConfigs: AlertConfig[]
  addAlertConfig: (config: Omit<AlertConfig, 'id'>) => string
  updateAlertConfig: (id: string, updates: Partial<AlertConfig>) => void
  removeAlertConfig: (id: string) => void
  acknowledgeAlert: (id: string) => void
  // Audit log
  auditLog: AuditLogEntry[]
  loadMoreAuditLog: () => Promise<void>
  // Export
  exportAnalytics: (format: 'csv' | 'json') => string
  exportAuditLog: (format: 'csv' | 'json') => string
}

// Mock data for demonstration
const MOCK_ROOMS: RoomSummary[] = [
  {
    id: '1',
    name: 'Morning Show',
    isActive: true,
    participantCount: 4,
    maxParticipants: 8,
    createdAt: new Date().toISOString(),
    hostName: 'Alice Host',
    isRecording: true,
    hasActiveOutput: true,
    currentRundownItem: 'Interview Segment',
    averageConnectionQuality: 85,
    issueCount: 0,
  },
  {
    id: '2',
    name: 'News Update',
    isActive: true,
    participantCount: 2,
    maxParticipants: 8,
    createdAt: new Date().toISOString(),
    hostName: 'Bob Producer',
    isRecording: false,
    hasActiveOutput: true,
    currentRundownItem: 'Headlines',
    averageConnectionQuality: 72,
    issueCount: 1,
  },
  {
    id: '3',
    name: 'Weekend Special',
    isActive: false,
    participantCount: 0,
    maxParticipants: 8,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    hostName: 'Charlie DJ',
    isRecording: false,
    hasActiveOutput: false,
    averageConnectionQuality: 0,
    issueCount: 0,
  },
]

const MOCK_ANALYTICS: UsageAnalytics = {
  totalRooms: 15,
  activeRooms: 2,
  totalParticipants: 6,
  peakParticipants: 12,
  averageSessionDuration: 3600,
  roomsOverTime: Array.from({ length: 24 }, (_, i) => ({
    timestamp: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
    value: Math.floor(Math.random() * 5) + 1,
  })),
  participantsOverTime: Array.from({ length: 24 }, (_, i) => ({
    timestamp: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
    value: Math.floor(Math.random() * 15) + 2,
  })),
  averageConnectionQuality: 82,
  packetLossRate: 0.5,
  averageLatency: 45,
  totalOutputs: 8,
  activeOutputs: 3,
  bytesStreamed: 1024 * 1024 * 1024 * 5, // 5 GB
  totalRecordings: 24,
  recordingHours: 48,
  storageUsed: 1024 * 1024 * 1024 * 12, // 12 GB
}

/**
 * Hook for enterprise features like multi-room management and analytics
 */
export function useEnterpriseFeatures({
  organizationId: _organizationId,
  pollingIntervalMs = 30000,
}: UseEnterpriseFeaturesOptions): UseEnterpriseFeaturesReturn {
  const [rooms, setRooms] = useState<RoomSummary[]>(MOCK_ROOMS)
  const [analytics, setAnalytics] = useState<UsageAnalytics | null>(MOCK_ANALYTICS)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [alertConfigs, setAlertConfigs] = useState<AlertConfig[]>([])
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([])

  const pollingRef = useRef<ReturnType<typeof setInterval>>()

  // Calculate derived values
  const activeRoomsCount = rooms.filter((r) => r.isActive).length
  const totalParticipants = rooms.reduce((sum, r) => sum + r.participantCount, 0)

  // Refresh rooms
  const refreshRooms = useCallback(async (): Promise<void> => {
    // In production, this would fetch from API
    // For now, simulate with mock data
    setRooms(MOCK_ROOMS.map((room) => ({
      ...room,
      participantCount: room.isActive
        ? Math.floor(Math.random() * room.maxParticipants) + 1
        : 0,
    })))
  }, [])

  // Refresh analytics
  const refreshAnalytics = useCallback(async (): Promise<void> => {
    // In production, this would fetch from API
    setAnalytics({
      ...MOCK_ANALYTICS,
      totalParticipants: rooms.reduce((sum, r) => sum + r.participantCount, 0),
      activeRooms: rooms.filter((r) => r.isActive).length,
    })
  }, [rooms])

  // Get analytics for a specific period
  const getAnalyticsForPeriod = useCallback(async (
    _startDate: Date,
    _endDate: Date
  ): Promise<UsageAnalytics | null> => {
    // In production, this would fetch from API with date filters
    return MOCK_ANALYTICS
  }, [])

  // Alert management
  const addAlertConfig = useCallback((config: Omit<AlertConfig, 'id'>): string => {
    const id = `alert-${Date.now()}`
    setAlertConfigs((prev) => [...prev, { ...config, id }])
    return id
  }, [])

  const updateAlertConfig = useCallback((id: string, updates: Partial<AlertConfig>) => {
    setAlertConfigs((prev) =>
      prev.map((config) => (config.id === id ? { ...config, ...updates } : config))
    )
  }, [])

  const removeAlertConfig = useCallback((id: string) => {
    setAlertConfigs((prev) => prev.filter((config) => config.id !== id))
  }, [])

  const acknowledgeAlert = useCallback((id: string) => {
    setAlerts((prev) =>
      prev.map((alert) => (alert.id === id ? { ...alert, acknowledged: true } : alert))
    )
  }, [])

  // Audit log
  const loadMoreAuditLog = useCallback(async (): Promise<void> => {
    // In production, this would fetch more entries with pagination
    const newEntries: AuditLogEntry[] = [
      {
        id: `audit-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: 'user-1',
        userName: 'Alice Host',
        action: 'start_recording',
        resourceType: 'room',
        resourceId: '1',
        details: { format: 'wav', sampleRate: 48000 },
      },
    ]
    setAuditLog((prev) => [...prev, ...newEntries])
  }, [])

  // Export functions
  const exportAnalytics = useCallback((format: 'csv' | 'json'): string => {
    if (!analytics) return ''

    if (format === 'json') {
      return JSON.stringify(analytics, null, 2)
    }

    // CSV export
    const lines = [
      'Metric,Value',
      `Total Rooms,${analytics.totalRooms}`,
      `Active Rooms,${analytics.activeRooms}`,
      `Total Participants,${analytics.totalParticipants}`,
      `Peak Participants,${analytics.peakParticipants}`,
      `Average Session Duration (s),${analytics.averageSessionDuration}`,
      `Average Connection Quality,${analytics.averageConnectionQuality}%`,
      `Packet Loss Rate,${analytics.packetLossRate}%`,
      `Average Latency,${analytics.averageLatency}ms`,
      `Total Outputs,${analytics.totalOutputs}`,
      `Active Outputs,${analytics.activeOutputs}`,
      `Bytes Streamed,${analytics.bytesStreamed}`,
      `Total Recordings,${analytics.totalRecordings}`,
      `Recording Hours,${analytics.recordingHours}`,
      `Storage Used (bytes),${analytics.storageUsed}`,
    ]
    return lines.join('\n')
  }, [analytics])

  const exportAuditLog = useCallback((format: 'csv' | 'json'): string => {
    if (format === 'json') {
      return JSON.stringify(auditLog, null, 2)
    }

    // CSV export
    const lines = [
      'Timestamp,User,Action,Resource Type,Resource ID,Details',
      ...auditLog.map(
        (entry) =>
          `${entry.timestamp},${entry.userName},${entry.action},${entry.resourceType},${entry.resourceId},"${JSON.stringify(entry.details)}"`
      ),
    ]
    return lines.join('\n')
  }, [auditLog])

  // Polling for real-time updates
  useEffect(() => {
    refreshRooms()
    refreshAnalytics()

    pollingRef.current = setInterval(() => {
      refreshRooms()
    }, pollingIntervalMs)

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [pollingIntervalMs, refreshRooms, refreshAnalytics])

  // Alert checking
  useEffect(() => {
    const checkAlerts = () => {
      const newAlerts: Alert[] = []

      alertConfigs.forEach((config) => {
        if (!config.enabled) return

        switch (config.type) {
          case 'room_participant_count':
            rooms.forEach((room) => {
              if (room.participantCount >= config.threshold) {
                newAlerts.push({
                  id: `alert-${Date.now()}-${room.id}`,
                  configId: config.id,
                  roomId: room.id,
                  type: config.type,
                  severity: room.participantCount >= room.maxParticipants ? 'critical' : 'warning',
                  message: `Room "${room.name}" has ${room.participantCount} participants (threshold: ${config.threshold})`,
                  timestamp: new Date().toISOString(),
                  acknowledged: false,
                })
              }
            })
            break

          case 'connection_quality':
            rooms.forEach((room) => {
              if (room.averageConnectionQuality < config.threshold && room.isActive) {
                newAlerts.push({
                  id: `alert-${Date.now()}-${room.id}`,
                  configId: config.id,
                  roomId: room.id,
                  type: config.type,
                  severity: room.averageConnectionQuality < 50 ? 'critical' : 'warning',
                  message: `Room "${room.name}" connection quality is ${room.averageConnectionQuality}% (threshold: ${config.threshold}%)`,
                  timestamp: new Date().toISOString(),
                  acknowledged: false,
                })
              }
            })
            break

          // Add more alert type handlers as needed
        }
      })

      if (newAlerts.length > 0) {
        setAlerts((prev) => [...prev.filter((a) => !a.acknowledged).slice(-50), ...newAlerts])
      }
    }

    checkAlerts()
  }, [rooms, alertConfigs])

  return {
    rooms,
    activeRoomsCount,
    totalParticipants,
    refreshRooms,
    analytics,
    refreshAnalytics,
    getAnalyticsForPeriod,
    alerts,
    alertConfigs,
    addAlertConfig,
    updateAlertConfig,
    removeAlertConfig,
    acknowledgeAlert,
    auditLog,
    loadMoreAuditLog,
    exportAnalytics,
    exportAuditLog,
  }
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

/**
 * Format duration in seconds to human readable
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}
