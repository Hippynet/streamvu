/**
 * NDI Bridge - Preload Script
 *
 * Exposes secure IPC methods to the renderer process.
 */

import { contextBridge, ipcRenderer } from 'electron'

// Types
interface StreamConfig {
  id: string
  name: string
  serverUrl: string
  roomId: string
  participantId?: string
  ndiOutputName: string
  isActive: boolean
}

interface AppSettings {
  autoStart: boolean
  minimizeToTray: boolean
}

interface StreamStatusEvent {
  streamId: string
  status: 'active' | 'stopped' | 'error'
  error?: string
}

// Expose API to renderer
contextBridge.exposeInMainWorld('ndiBridge', {
  // Stream management
  streams: {
    list: (): Promise<StreamConfig[]> => ipcRenderer.invoke('streams:list'),
    add: (config: Omit<StreamConfig, 'id' | 'isActive'>): Promise<StreamConfig> =>
      ipcRenderer.invoke('streams:add', config),
    remove: (streamId: string): Promise<boolean> =>
      ipcRenderer.invoke('streams:remove', streamId),
    start: (streamId: string): Promise<boolean> =>
      ipcRenderer.invoke('streams:start', streamId),
    stop: (streamId: string): Promise<boolean> =>
      ipcRenderer.invoke('streams:stop', streamId),
  },

  // Settings
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    set: (settings: Partial<AppSettings>): Promise<boolean> =>
      ipcRenderer.invoke('settings:set', settings),
  },

  // NDI
  ndi: {
    getSources: (): Promise<string[]> => ipcRenderer.invoke('ndi:sources'),
  },

  // Events
  on: (channel: string, callback: (data: StreamStatusEvent) => void) => {
    const validChannels = ['stream:status']
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, data) => callback(data))
    }
  },

  off: (channel: string) => {
    const validChannels = ['stream:status']
    if (validChannels.includes(channel)) {
      ipcRenderer.removeAllListeners(channel)
    }
  },

  // App info
  version: process.env.npm_package_version || '1.0.0',
  platform: process.platform,
})

// Type declaration for window
declare global {
  interface Window {
    ndiBridge: {
      streams: {
        list: () => Promise<StreamConfig[]>
        add: (config: Omit<StreamConfig, 'id' | 'isActive'>) => Promise<StreamConfig>
        remove: (streamId: string) => Promise<boolean>
        start: (streamId: string) => Promise<boolean>
        stop: (streamId: string) => Promise<boolean>
      }
      settings: {
        get: () => Promise<AppSettings>
        set: (settings: Partial<AppSettings>) => Promise<boolean>
      }
      ndi: {
        getSources: () => Promise<string[]>
      }
      on: (channel: string, callback: (data: StreamStatusEvent) => void) => void
      off: (channel: string) => void
      version: string
      platform: NodeJS.Platform
    }
  }
}
