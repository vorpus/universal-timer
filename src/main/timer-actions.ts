import { app, globalShortcut, nativeImage } from 'electron'
import path from 'path'
import fs from 'fs'
import { exec } from 'child_process'

import { getMainWindow, getTray } from './app-state'
import { settings, normalizeTimerName, getDisplayName, appendEvent, saveSettings } from './storage'
import { computeTimerState, getTrayIconIndex } from './timer-state'

// ========================================
// Resource Path Helper
// ========================================

function getResourcePath(...segments: string[]): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'resources', ...segments)
  }
  return path.join(__dirname, '../../resources', ...segments)
}

// ========================================
// Sound Effects
// ========================================

export function playSound(soundType: 'start' | 'pause'): void {
  if (!settings.playSounds) return

  const soundFile = soundType === 'start' ? 'sound-start.wav' : 'sound-pause.wav'
  const soundPath = getResourcePath(soundFile)

  if (!fs.existsSync(soundPath)) return

  if (process.platform === 'darwin') {
    exec(`afplay "${soundPath}"`, (err) => {
      if (err) console.error('Failed to play sound:', err)
    })
  }
}

// ========================================
// Tray Icon Management
// ========================================

export function createTrayIcon(timerIndex: number | null): Electron.NativeImage {
  const iconsPath = getResourcePath('tray-icons')
  let iconPath: string

  if (timerIndex === null) {
    iconPath = path.join(iconsPath, 'pausedTemplate.png')
  } else if (settings.useTaskNumberAsTrayIcon && timerIndex >= 1 && timerIndex <= 9) {
    iconPath = path.join(iconsPath, `${timerIndex}Template.png`)
  } else {
    iconPath = path.join(iconsPath, 'recordingTemplate.png')
  }

  const icon = nativeImage.createFromPath(iconPath)

  if (process.platform === 'darwin') {
    icon.setTemplateImage(true)
  }

  return icon
}

export function updateTrayIcon(timerIndex: number | null): void {
  const tray = getTray()
  if (tray) {
    tray.setImage(createTrayIcon(timerIndex))
    tray.setToolTip(timerIndex !== null ? 'Time Tracker (Recording)' : 'Time Tracker')
  }
}

// ========================================
// Notify Renderer
// ========================================

export function notifyRenderer(): void {
  const state = computeTimerState()
  updateTrayIcon(getTrayIconIndex(state))

  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send('timer:updated', state)
  }
}

// ========================================
// Timer Actions
// ========================================

export function startTimer(timerName: string): void {
  const normalized = normalizeTimerName(timerName)
  getDisplayName(normalized, timerName)

  if (!settings.timerOrder.includes(normalized)) {
    settings.timerOrder.push(normalized)
    saveSettings()
  }

  const now = Date.now()

  if (settings.pauseOthersOnStart) {
    const state = computeTimerState()
    for (const running of state.runningTimers) {
      if (running !== normalized) {
        appendEvent({ ts: now, event: 'pause', timer: running })
      }
    }
  }

  appendEvent({ ts: now, event: 'start', timer: normalized })
  playSound('start')
  notifyRenderer()
}

export function pauseTimer(timerName: string): void {
  const normalized = normalizeTimerName(timerName)
  const now = Date.now()
  appendEvent({ ts: now, event: 'pause', timer: normalized })
  playSound('pause')
  notifyRenderer()
}

export function pauseAll(): void {
  const now = Date.now()
  appendEvent({ ts: now, event: 'pause_all' })
  playSound('pause')
  notifyRenderer()
}

// ========================================
// Global Hotkeys
// ========================================

export function registerGlobalHotkeys(): void {
  globalShortcut.unregisterAll()

  const pauseAllHotkey = settings.hotkeys?.pauseAll || 'CmdOrCtrl+Shift+P'
  try {
    const registered = globalShortcut.register(pauseAllHotkey, () => {
      pauseAll()
    })
    if (!registered) {
      console.error(`Failed to register hotkey: ${pauseAllHotkey}`)
    }
  } catch (err) {
    console.error(`Error registering hotkey ${pauseAllHotkey}:`, err)
  }

  const timerHotkeys = settings.hotkeys?.timers || {}
  for (const [timerName, hotkey] of Object.entries(timerHotkeys)) {
    try {
      const registered = globalShortcut.register(hotkey, () => {
        const state = computeTimerState()
        if (state.runningTimers.includes(timerName)) {
          pauseTimer(timerName)
        } else {
          startTimer(timerName)
        }
      })
      if (!registered) {
        console.error(`Failed to register hotkey for timer "${timerName}": ${hotkey}`)
      }
    } catch (err) {
      console.error(`Error registering hotkey for timer "${timerName}":`, err)
    }
  }
}
