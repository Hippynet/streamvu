/**
 * NDI Bridge - Main Electron Process
 *
 * Desktop application that bridges WebRTC streams to NDI output.
 * Allows StreamVU contributors to be received by vMix, TriCaster,
 * and other NDI-compatible broadcast equipment.
 */

import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage } from 'electron'
import * as path from 'path'
import Store from 'electron-store'

// Types for stream management
interface StreamConfig {
  id: string
  name: string
  serverUrl: string
  roomId: string
  participantId?: string
  ndiOutputName: string
  isActive: boolean
}

interface AppState {
  streams: StreamConfig[]
  autoStart: boolean
  minimizeToTray: boolean
}

// Persistent store for settings
const store = new Store<AppState>({
  defaults: {
    streams: [],
    autoStart: false,
    minimizeToTray: true,
  },
})

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

// Active NDI senders (would be managed by the NDI service)
const activeNdiSenders = new Map<string, unknown>()

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 400,
    title: 'StreamVU NDI Bridge',
    backgroundColor: '#0a0a0a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, '../assets/icon.png'),
  })

  // Load the UI
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173/ndi-bridge')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // Handle close to tray
  mainWindow.on('close', (event) => {
    if (store.get('minimizeToTray') && !app.isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createTray(): void {
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Window',
      click: () => mainWindow?.show(),
    },
    { type: 'separator' },
    {
      label: 'Active Streams',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true
        app.quit()
      },
    },
  ])

  tray.setToolTip('StreamVU NDI Bridge')
  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    mainWindow?.show()
  })
}

// IPC Handlers for renderer communication
function setupIpcHandlers(): void {
  // Get all configured streams
  ipcMain.handle('streams:list', () => {
    return store.get('streams')
  })

  // Add a new stream configuration
  ipcMain.handle('streams:add', (_event, config: Omit<StreamConfig, 'id' | 'isActive'>) => {
    const streams = store.get('streams')
    const newStream: StreamConfig = {
      ...config,
      id: `stream-${Date.now()}`,
      isActive: false,
    }
    streams.push(newStream)
    store.set('streams', streams)
    return newStream
  })

  // Remove a stream
  ipcMain.handle('streams:remove', (_event, streamId: string) => {
    const streams = store.get('streams')
    const updated = streams.filter((s) => s.id !== streamId)
    store.set('streams', updated)

    // Stop NDI sender if active
    if (activeNdiSenders.has(streamId)) {
      stopNdiSender(streamId)
    }

    return true
  })

  // Start streaming (WebRTC -> NDI)
  ipcMain.handle('streams:start', async (_event, streamId: string) => {
    const streams = store.get('streams')
    const stream = streams.find((s) => s.id === streamId)

    if (!stream) {
      throw new Error('Stream not found')
    }

    try {
      await startNdiSender(stream)

      // Update stream state
      const updated = streams.map((s) =>
        s.id === streamId ? { ...s, isActive: true } : s
      )
      store.set('streams', updated)

      return true
    } catch (error) {
      console.error('Failed to start stream:', error)
      throw error
    }
  })

  // Stop streaming
  ipcMain.handle('streams:stop', async (_event, streamId: string) => {
    stopNdiSender(streamId)

    const streams = store.get('streams')
    const updated = streams.map((s) =>
      s.id === streamId ? { ...s, isActive: false } : s
    )
    store.set('streams', updated)

    return true
  })

  // Get app settings
  ipcMain.handle('settings:get', () => {
    return {
      autoStart: store.get('autoStart'),
      minimizeToTray: store.get('minimizeToTray'),
    }
  })

  // Update app settings
  ipcMain.handle('settings:set', (_event, settings: Partial<AppState>) => {
    if (settings.autoStart !== undefined) {
      store.set('autoStart', settings.autoStart)
      app.setLoginItemSettings({ openAtLogin: settings.autoStart })
    }
    if (settings.minimizeToTray !== undefined) {
      store.set('minimizeToTray', settings.minimizeToTray)
    }
    return true
  })

  // Get NDI sources (for monitoring)
  ipcMain.handle('ndi:sources', () => {
    // In a real implementation, this would enumerate NDI sources on the network
    return []
  })
}

// NDI Sender management
async function startNdiSender(config: StreamConfig): Promise<void> {
  console.log(`[NDI] Starting sender: ${config.ndiOutputName}`)

  // In a real implementation:
  // 1. Connect to StreamVU server via WebRTC
  // 2. Receive video/audio frames
  // 3. Send frames to NDI using grandiern-ndi or similar library

  // Placeholder for NDI sender
  const sender = {
    name: config.ndiOutputName,
    config,
    startedAt: new Date(),
  }

  activeNdiSenders.set(config.id, sender)

  // Notify renderer of status change
  mainWindow?.webContents.send('stream:status', {
    streamId: config.id,
    status: 'active',
  })
}

function stopNdiSender(streamId: string): void {
  const sender = activeNdiSenders.get(streamId)
  if (sender) {
    console.log(`[NDI] Stopping sender: ${streamId}`)
    // Clean up NDI sender resources
    activeNdiSenders.delete(streamId)

    mainWindow?.webContents.send('stream:status', {
      streamId,
      status: 'stopped',
    })
  }
}

// App lifecycle
app.whenReady().then(() => {
  createWindow()
  createTray()
  setupIpcHandlers()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else {
      mainWindow?.show()
    }
  })

  // Auto-start configured streams
  if (store.get('autoStart')) {
    const streams = store.get('streams')
    streams
      .filter((s) => s.isActive)
      .forEach((s) => {
        startNdiSender(s).catch(console.error)
      })
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  app.isQuitting = true

  // Stop all NDI senders
  for (const streamId of activeNdiSenders.keys()) {
    stopNdiSender(streamId)
  }
})

// Extend app type for isQuitting flag
declare module 'electron' {
  interface App {
    isQuitting?: boolean
  }
}
