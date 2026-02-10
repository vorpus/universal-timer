import { app, BrowserWindow, Tray, globalShortcut, screen } from 'electron'
import path from 'path'

import { setMainWindow, setTray, isPinned } from './app-state'
import { loadSettings, loadEvents, normalizeTimerName, timerDisplayNames } from './storage'
import { computeTimerState, getTrayIconIndex } from './timer-state'
import { createTrayIcon, updateTrayIcon, registerGlobalHotkeys, syncTrayTitleInterval } from './timer-actions'
import { registerIpcHandlers } from './ipc-handlers'
import { rebuildContextMenu, popUpContextMenu } from './window-actions'

declare module 'electron' {
  interface App {
    isQuitting?: boolean
  }
}

// ========================================
// Window Configuration
// ========================================

const WINDOW_WIDTH = 360
const WINDOW_HEIGHT = 520

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  setMainWindow(mainWindow)

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('blur', () => {
    if (!mainWindow!.webContents.isDevToolsOpened() && !isPinned()) {
      mainWindow!.hide()
    }
  })

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault()
      mainWindow!.hide()
    }
  })
}

function positionWindow(trayBounds: Electron.Rectangle): void {
  const windowBounds = mainWindow!.getBounds()

  let x = Math.round(trayBounds.x + (trayBounds.width / 2) - (windowBounds.width / 2))
  let y = Math.round(trayBounds.y + trayBounds.height + 4)

  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y })
  const screenBounds = display.workArea

  if (x + windowBounds.width > screenBounds.x + screenBounds.width) {
    x = screenBounds.x + screenBounds.width - windowBounds.width
  }
  if (x < screenBounds.x) {
    x = screenBounds.x
  }
  if (y + windowBounds.height > screenBounds.y + screenBounds.height) {
    y = trayBounds.y - windowBounds.height - 4
  }

  mainWindow!.setPosition(x, y, false)
}

function toggleWindow(trayBounds: Electron.Rectangle): void {
  if (mainWindow!.isVisible()) {
    if (isPinned()) {
      mainWindow!.focus()
    } else {
      mainWindow!.hide()
    }
  } else {
    positionWindow(trayBounds)
    mainWindow!.show()
    mainWindow!.focus()
  }
}

// ========================================
// Tray Setup
// ========================================

function createTray(): void {
  tray = new Tray(createTrayIcon(null))
  tray.setToolTip('Time Tracker')
  setTray(tray)

  tray.on('click', (_event, bounds) => {
    toggleWindow(bounds)
  })

  rebuildContextMenu()
  tray.on('right-click', () => {
    popUpContextMenu()
  })
}

// ========================================
// App Lifecycle
// ========================================

// Hide dock icon on macOS
if (process.platform === 'darwin') {
  app.dock.hide()
}

app.whenReady().then(() => {
  createTray()
  createWindow()
  registerGlobalHotkeys()
  registerIpcHandlers()

  const initialState = computeTimerState()
  updateTrayIcon(getTrayIconIndex(initialState))
  syncTrayTitleInterval()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  app.isQuitting = true
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// ========================================
// Initialization
// ========================================

loadSettings()

const existingEvents = loadEvents()
for (const event of existingEvents) {
  if ('timer' in event) {
    const normalized = normalizeTimerName(event.timer)
    if (!timerDisplayNames.has(normalized)) {
      timerDisplayNames.set(normalized, event.timer)
    }
  }
}
