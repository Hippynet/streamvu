import type {
  ApiResponse,
  LoginResponse,
  GoogleAuthResponse,
  AuthTokens,
  User,
  StreamWithHealth,
  Stream,
  Organization,
  OrganizationStats,
  OrganizationMember,
  OrganizationInvite,
  CreateInviteRequest,
  OrgMemberRole,
  CreateStreamRequest,
  UpdateStreamRequest,
  CallRoom,
  CallRoomWithParticipants,
  CreateRoomRequest,
  UpdateRoomRequest,
  AudioSource,
  AudioOutput,
  UploadedFile,
  CreateAudioSourceRequest,
  UpdateAudioSourceRequest,
  CreateAudioOutputRequest,
  UpdateAudioOutputRequest,
  // Cloud storage types
  CloudStorageConfig,
  CloudStorageProvider,
  TestStorageConnectionResponse,
  // Webhook types
  WebhookEventType,
  // Transcription types
  TranscriptionConfig,
  TranscriptionProvider,
} from '@streamvu/shared'
import { useAuthStore } from '../stores/authStore'
import { getApiUrl } from '../config'

class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const { tokens, updateTokens, logout } = useAuthStore.getState()

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  if (tokens?.accessToken) {
    ;(headers as Record<string, string>)['Authorization'] = `Bearer ${tokens.accessToken}`
  }

  let response = await fetch(`${getApiUrl()}${endpoint}`, {
    ...options,
    headers,
  })

  // Handle token refresh
  if (response.status === 401 && tokens?.refreshToken) {
    const refreshResponse = await fetch(`${getApiUrl()}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    })

    if (refreshResponse.ok) {
      const refreshData = (await refreshResponse.json()) as ApiResponse<{
        accessToken: string
        refreshToken: string
      }>
      if (refreshData.success && refreshData.data) {
        updateTokens(refreshData.data)

        // Retry original request
        ;(headers as Record<string, string>)['Authorization'] =
          `Bearer ${refreshData.data.accessToken}`
        response = await fetch(`${getApiUrl()}${endpoint}`, {
          ...options,
          headers,
        })
      }
    } else {
      logout()
      throw new ApiError('UNAUTHORIZED', 'Session expired', 401)
    }
  }

  const data = (await response.json()) as ApiResponse<T>

  if (!data.success) {
    throw new ApiError(
      data.error?.code || 'UNKNOWN_ERROR',
      data.error?.message || 'An error occurred',
      response.status
    )
  }

  return data.data as T
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),

    logout: (refreshToken: string) =>
      request<void>('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      }),

    me: () => request<User>('/api/auth/me'),

    googleAuth: (idToken: string) =>
      request<GoogleAuthResponse>('/api/auth/google/token', {
        method: 'POST',
        body: JSON.stringify({ idToken }),
      }),

    switchOrganization: (organizationId: string) =>
      request<AuthTokens>('/api/auth/switch-organization', {
        method: 'POST',
        body: JSON.stringify({ organizationId }),
      }),
  },

  streams: {
    list: () => request<StreamWithHealth[]>('/api/streams'),

    get: (id: string) => request<StreamWithHealth>(`/api/streams/${id}`),

    create: (data: CreateStreamRequest) =>
      request<Stream>('/api/streams', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (id: string, data: UpdateStreamRequest) =>
      request<Stream>(`/api/streams/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    delete: (id: string) =>
      request<void>(`/api/streams/${id}`, {
        method: 'DELETE',
      }),
  },

  organization: {
    get: () => request<Organization>('/api/organization'),

    update: (data: Partial<Organization>) =>
      request<Organization>('/api/organization', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    stats: () => request<OrganizationStats>('/api/organization/stats'),

    members: () => request<OrganizationMember[]>('/api/organization/members'),

    updateMember: (userId: string, role: OrgMemberRole) =>
      request<OrganizationMember>(`/api/organization/members/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
      }),

    removeMember: (userId: string) =>
      request<void>(`/api/organization/members/${userId}`, {
        method: 'DELETE',
      }),

    invites: () => request<OrganizationInvite[]>('/api/organization/invites'),

    createInvite: (data: CreateInviteRequest) =>
      request<OrganizationInvite>('/api/organization/invites', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    revokeInvite: (inviteId: string) =>
      request<void>(`/api/organization/invites/${inviteId}`, {
        method: 'DELETE',
      }),
  },

  invites: {
    get: (token: string) =>
      request<OrganizationInvite & { organization: Organization }>(`/api/invites/${token}`),

    accept: (token: string) =>
      request<OrganizationMember>(`/api/invites/${token}/accept`, {
        method: 'POST',
      }),
  },

  rooms: {
    list: () => request<CallRoomWithParticipants[]>('/api/rooms'),

    get: (id: string) => request<CallRoomWithParticipants>(`/api/rooms/${id}`),

    getByInviteToken: (token: string) =>
      request<CallRoomWithParticipants>(`/api/rooms/join/${token}`),

    create: (data: CreateRoomRequest) =>
      request<CallRoom>('/api/rooms', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (id: string, data: UpdateRoomRequest) =>
      request<CallRoom>(`/api/rooms/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    delete: (id: string) =>
      request<void>(`/api/rooms/${id}`, {
        method: 'DELETE',
      }),

    close: (id: string) =>
      request<CallRoom>(`/api/rooms/${id}/close`, {
        method: 'POST',
      }),

    regenerateToken: (id: string) =>
      request<CallRoom>(`/api/rooms/${id}/regenerate-token`, {
        method: 'POST',
      }),

    kickParticipant: (roomId: string, participantId: string) =>
      request<void>(`/api/rooms/${roomId}/kick/${participantId}`, {
        method: 'POST',
      }),

    admitParticipant: (roomId: string, participantId: string) =>
      request<void>(`/api/rooms/${roomId}/admit/${participantId}`, {
        method: 'POST',
      }),

    getWaitingParticipants: (roomId: string) =>
      request<Array<{ id: string; displayName: string; joinedAt: string }>>(
        `/api/rooms/${roomId}/waiting`
      ),
  },

  // Enterprise Contribution Suite - Audio Sources
  audioSources: {
    list: (roomId: string) =>
      request<AudioSource[]>(`/api/rooms/${roomId}/sources`),

    get: (roomId: string, sourceId: string) =>
      request<AudioSource>(`/api/rooms/${roomId}/sources/${sourceId}`),

    create: (roomId: string, data: CreateAudioSourceRequest) =>
      request<AudioSource>(`/api/rooms/${roomId}/sources`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (roomId: string, sourceId: string, data: UpdateAudioSourceRequest) =>
      request<AudioSource>(`/api/rooms/${roomId}/sources/${sourceId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    delete: (roomId: string, sourceId: string) =>
      request<void>(`/api/rooms/${roomId}/sources/${sourceId}`, {
        method: 'DELETE',
      }),

    start: (roomId: string, sourceId: string) =>
      request<AudioSource>(`/api/rooms/${roomId}/sources/${sourceId}/start`, {
        method: 'POST',
      }),

    stop: (roomId: string, sourceId: string) =>
      request<AudioSource>(`/api/rooms/${roomId}/sources/${sourceId}/stop`, {
        method: 'POST',
      }),

    play: (roomId: string, sourceId: string) =>
      request<AudioSource>(`/api/rooms/${roomId}/sources/${sourceId}/play`, {
        method: 'POST',
      }),

    pause: (roomId: string, sourceId: string) =>
      request<AudioSource>(`/api/rooms/${roomId}/sources/${sourceId}/pause`, {
        method: 'POST',
      }),

    seek: (roomId: string, sourceId: string, position: number) =>
      request<AudioSource>(`/api/rooms/${roomId}/sources/${sourceId}/seek`, {
        method: 'POST',
        body: JSON.stringify({ position }),
      }),
  },

  // Enterprise Contribution Suite - Audio Outputs
  audioOutputs: {
    list: (roomId: string) =>
      request<AudioOutput[]>(`/api/rooms/${roomId}/outputs`),

    get: (roomId: string, outputId: string) =>
      request<AudioOutput>(`/api/rooms/${roomId}/outputs/${outputId}`),

    create: (roomId: string, data: CreateAudioOutputRequest) =>
      request<AudioOutput>(`/api/rooms/${roomId}/outputs`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (roomId: string, outputId: string, data: UpdateAudioOutputRequest) =>
      request<AudioOutput>(`/api/rooms/${roomId}/outputs/${outputId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    delete: (roomId: string, outputId: string) =>
      request<void>(`/api/rooms/${roomId}/outputs/${outputId}`, {
        method: 'DELETE',
      }),

    start: (roomId: string, outputId: string) =>
      request<AudioOutput>(`/api/rooms/${roomId}/outputs/${outputId}/start`, {
        method: 'POST',
      }),

    stop: (roomId: string, outputId: string) =>
      request<AudioOutput>(`/api/rooms/${roomId}/outputs/${outputId}/stop`, {
        method: 'POST',
      }),

    getStats: (roomId: string, outputId: string) =>
      request<{
        bytesStreamed: string
        isConnected: boolean
        connectedAt: string | null
        uptime: number
      }>(`/api/rooms/${roomId}/outputs/${outputId}/stats`),

    updateRouting: (roomId: string, outputId: string, busRouting: {
      pgm?: number
      tb?: number
      aux1?: number
      aux2?: number
      aux3?: number
      aux4?: number
    }) =>
      request<AudioOutput>(`/api/rooms/${roomId}/outputs/${outputId}/routing`, {
        method: 'PUT',
        body: JSON.stringify(busRouting),
      }),

    // Real-time level update with debounced encoder restart
    updateLevels: (roomId: string, outputId: string, busRouting: {
      pgm?: number
      tb?: number
      aux1?: number
      aux2?: number
      aux3?: number
      aux4?: number
    }) =>
      request<{ success: boolean; willRestart: boolean; message: string }>(
        `/api/rooms/${roomId}/outputs/${outputId}/levels`,
        {
          method: 'PUT',
          body: JSON.stringify(busRouting),
        }
      ),
  },

  // Enterprise Contribution Suite - Files
  files: {
    list: () => request<UploadedFile[]>('/api/files'),

    get: (fileId: string) => request<UploadedFile>(`/api/files/${fileId}`),

    upload: async (file: File): Promise<UploadedFile> => {
      const { tokens } = useAuthStore.getState()
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${getApiUrl()}/api/files`, {
        method: 'POST',
        headers: {
          Authorization: tokens?.accessToken ? `Bearer ${tokens.accessToken}` : '',
        },
        body: formData,
      })

      const data = (await response.json()) as ApiResponse<UploadedFile>
      if (!data.success) {
        throw new ApiError(
          data.error?.code || 'UPLOAD_ERROR',
          data.error?.message || 'File upload failed',
          response.status
        )
      }
      return data.data as UploadedFile
    },

    delete: (fileId: string) =>
      request<void>(`/api/files/${fileId}`, {
        method: 'DELETE',
      }),

    getDownloadUrl: (fileId: string) => `${getApiUrl()}/api/files/${fileId}/download`,

    getWaveform: (fileId: string) =>
      request<{ peaks: number[] }>(`/api/files/${fileId}/waveform`),
  },

  // Cloud Storage API
  cloudStorage: {
    // Get all storage configurations
    listConfigs: () =>
      request<{ configs: CloudStorageConfig[] }>('/api/cloud-storage/configs'),

    // Get current active config
    getConfig: () =>
      request<{ config: CloudStorageConfig | null }>('/api/cloud-storage/config'),

    // Create a new storage configuration
    createConfig: (config: {
      provider: CloudStorageProvider
      name: string
      enabled?: boolean
      isDefault?: boolean
      bucket?: string
      region?: string
      accessKeyId?: string
      secretAccessKey?: string
      endpoint?: string
      projectId?: string
      credentials?: string
      containerName?: string
      accountName?: string
      accountKey?: string
      teamId?: string
      frameioProjectId?: string
      accessToken?: string
      prefix?: string
    }) =>
      request<{ config: CloudStorageConfig }>('/api/cloud-storage/configs', {
        method: 'POST',
        body: JSON.stringify(config),
      }),

    // Update a storage configuration
    updateConfig: (
      configId: string,
      config: {
        name?: string
        enabled?: boolean
        isDefault?: boolean
        bucket?: string
        region?: string
        accessKeyId?: string
        secretAccessKey?: string
        endpoint?: string
        projectId?: string
        credentials?: string
        containerName?: string
        accountName?: string
        accountKey?: string
        teamId?: string
        frameioProjectId?: string
        accessToken?: string
        prefix?: string
      }
    ) =>
      request<{ config: CloudStorageConfig }>(`/api/cloud-storage/configs/${configId}`, {
        method: 'PUT',
        body: JSON.stringify(config),
      }),

    // Delete a storage configuration
    deleteConfig: (configId: string) =>
      request<{ success: boolean }>(`/api/cloud-storage/configs/${configId}`, {
        method: 'DELETE',
      }),

    // Test storage connection
    testConnection: (config: {
      provider: CloudStorageProvider
      bucket?: string
      region?: string
      accessKeyId?: string
      secretAccessKey?: string
      endpoint?: string
      projectId?: string
      credentials?: string
      containerName?: string
      accountName?: string
      accountKey?: string
      teamId?: string
      frameioProjectId?: string
      accessToken?: string
    }) =>
      request<TestStorageConnectionResponse>('/api/cloud-storage/test', {
        method: 'POST',
        body: JSON.stringify(config),
      }),

    // Configure cloud storage (legacy endpoint)
    configure: (config: {
      provider: CloudStorageProvider
      bucket?: string
      region?: string
      accessKeyId?: string
      secretAccessKey?: string
      endpoint?: string
      projectId?: string
      connectionString?: string
      frameioToken?: string
      frameioProjectId?: string
      basePrefix?: string
      retentionDays?: number
    }) =>
      request<{ success: boolean; provider: string; message: string }>(
        '/api/cloud-storage/configure',
        {
          method: 'POST',
          body: JSON.stringify(config),
        }
      ),
  },

  // Webhooks API
  webhooks: {
    // List all webhooks
    list: (roomId?: string) =>
      request<{
        webhooks: Array<{
          id: string
          url: string
          events: WebhookEventType[]
          enabled: boolean
          roomId?: string
          createdAt: string
          lastTriggered?: string
          failureCount: number
        }>
      }>(`/api/automation/webhooks${roomId ? `?roomId=${roomId}` : ''}`),

    // Create a new webhook
    create: (webhook: {
      name?: string
      url: string
      events: WebhookEventType[]
      secret?: string
      roomId?: string
    }) =>
      request<{
        webhook: {
          id: string
          url: string
          events: WebhookEventType[]
          enabled: boolean
          roomId?: string
          createdAt: string
        }
      }>('/api/automation/webhooks', {
        method: 'POST',
        body: JSON.stringify(webhook),
      }),

    // Update a webhook
    update: (
      webhookId: string,
      webhook: {
        name?: string
        url?: string
        events?: WebhookEventType[]
        secret?: string
        enabled?: boolean
      }
    ) =>
      request<{
        webhook: {
          id: string
          url: string
          events: WebhookEventType[]
          enabled: boolean
          roomId?: string
        }
      }>(`/api/automation/webhooks/${webhookId}`, {
        method: 'PATCH',
        body: JSON.stringify(webhook),
      }),

    // Delete a webhook
    delete: (webhookId: string) =>
      request<{ success: boolean }>(`/api/automation/webhooks/${webhookId}`, {
        method: 'DELETE',
      }),

    // Test a webhook
    test: (webhookId: string) =>
      request<{ success: boolean; message: string }>(`/api/automation/webhooks/${webhookId}/test`, {
        method: 'POST',
      }),
  },

  // Transcription API
  transcription: {
    // List all transcription configurations
    listConfigs: () =>
      request<{ configs: TranscriptionConfig[] }>('/api/transcription/configs'),

    // Get current transcription config
    getConfig: () =>
      request<{ config: TranscriptionConfig | null }>('/api/transcription/config'),

    // Create a new transcription configuration
    createConfig: (config: {
      provider: TranscriptionProvider
      name: string
      apiKey?: string
      apiUrl?: string
      model?: string
      language?: string
      autoDetectLanguage?: boolean
      enableSpeakerDiarization?: boolean
      maxSpeakers?: number
      enablePunctuation?: boolean
      enableProfanityFilter?: boolean
      customVocabulary?: string[]
      enabled?: boolean
      isDefault?: boolean
    }) =>
      request<{ config: TranscriptionConfig }>('/api/transcription/configs', {
        method: 'POST',
        body: JSON.stringify(config),
      }),

    // Update a transcription configuration
    updateConfig: (
      configId: string,
      config: {
        name?: string
        apiKey?: string
        apiUrl?: string
        model?: string
        language?: string
        autoDetectLanguage?: boolean
        enableSpeakerDiarization?: boolean
        maxSpeakers?: number
        enablePunctuation?: boolean
        enableProfanityFilter?: boolean
        customVocabulary?: string[]
        enabled?: boolean
        isDefault?: boolean
      }
    ) =>
      request<{ config: TranscriptionConfig }>(`/api/transcription/configs/${configId}`, {
        method: 'PUT',
        body: JSON.stringify(config),
      }),

    // Delete a transcription configuration
    deleteConfig: (configId: string) =>
      request<{ success: boolean }>(`/api/transcription/configs/${configId}`, {
        method: 'DELETE',
      }),

    // Configure transcription (legacy endpoint)
    configure: (config: {
      provider: TranscriptionProvider
      apiKey?: string
      apiUrl?: string
      language?: string
      enableDiarization?: boolean
      enableTimestamps?: boolean
      model?: string
    }) =>
      request<{ success: boolean; provider: string; message: string }>(
        '/api/transcription/configure',
        {
          method: 'POST',
          body: JSON.stringify(config),
        }
      ),

    // List transcriptions
    list: (roomId?: string) =>
      request<{ transcriptions: Array<{ id: string; filename: string; status: string }> }>(
        `/api/transcription/list${roomId ? `?roomId=${roomId}` : ''}`
      ),
  },
}

export { ApiError }
