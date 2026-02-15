import { app } from 'electron'
import path from 'path'
import fs from 'fs'

import type { Settings, TimerEvent } from '../shared/types'
import { getMainWindow } from './app-state'
import { appendEventToCache, replaceAllEvents } from './event-cache'

// ========================================
// Default Settings
// ========================================

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  pauseOthersOnStart: true,
  playSounds: false,
  dayStartHour: 0,
  dayStartMinute: 0,
  eventLogPath: null,
  hotkeys: {
    pauseAll: 'CmdOrCtrl+Shift+P',
    timers: {}
  },
  timerIcons: {},
  useTaskNumberAsTrayIcon: true,
  showActiveTaskInTray: false,
  showActiveTimeInTray: false,
  timerOrder: [],
  timerFriendlyNames: {}
}

// ========================================
// In-memory State
// ========================================

export let settings: Settings = { ...DEFAULT_SETTINGS }

// Track display names (first occurrence casing)
export const timerDisplayNames = new Map<string, string>()

// ========================================
// Error Notification
// ========================================

export function notifyError(message: string, details: Error | string | null = null): void {
  console.error(message, details)
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send('app:error', { message, details: (details instanceof Error ? details.message : details) })
  }
}

// ========================================
// Paths
// ========================================

function getDataPath(): string {
  return app.getPath('userData')
}

export function getSettingsPath(): string {
  return path.join(getDataPath(), 'settings.json')
}

export function getEventsPath(): string {
  if (settings.eventLogPath) {
    return settings.eventLogPath
  }
  return path.join(getDataPath(), 'events.jsonl')
}

// ========================================
// Settings Management
// ========================================

export function loadSettings(): Settings {
  try {
    const settingsPath = getSettingsPath()
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8')
      settings = { ...DEFAULT_SETTINGS, ...JSON.parse(data) }
    }
  } catch (err) {
    notifyError('Failed to load settings - using defaults', err as Error)
    settings = { ...DEFAULT_SETTINGS }
  }
  return settings
}

export function saveSettings(): void {
  try {
    const settingsPath = getSettingsPath()
    const tempPath = settingsPath + '.tmp'
    fs.writeFileSync(tempPath, JSON.stringify(settings, null, 2))
    fs.renameSync(tempPath, settingsPath)
  } catch (err) {
    notifyError('Failed to save settings', err as Error)
  }
}

export function updateSettings(updates: Partial<Settings>): void {
  settings = { ...settings, ...updates }
}

// ========================================
// Event Log Management
// ========================================

export function appendEvent(event: TimerEvent): void {
  try {
    const eventsPath = getEventsPath()
    const line = JSON.stringify(event) + '\n'
    fs.appendFileSync(eventsPath, line)
    appendEventToCache(event)
  } catch (err) {
    notifyError('Failed to save timer event', err as Error)
  }
}

export function loadEvents(): TimerEvent[] {
  try {
    const eventsPath = getEventsPath()
    if (!fs.existsSync(eventsPath)) {
      return []
    }
    const data = fs.readFileSync(eventsPath, 'utf8')
    const lines = data.split('\n').filter(line => line.trim())
    const events: TimerEvent[] = []
    for (const line of lines) {
      try {
        events.push(JSON.parse(line))
      } catch (_e) {
        // Skip invalid lines
      }
    }
    return events
  } catch (err) {
    notifyError('Failed to load timer history', err as Error)
    return []
  }
}

export function purgeTimerEvents(normalizedName: string): void {
  try {
    const events = loadEvents()
    const filtered = events.filter(e => {
      if (e.event === 'pause_all') return true
      if ('timer' in e) {
        return e.timer !== normalizedName
      }
      return true
    })
    const eventsPath = getEventsPath()
    const content = filtered.map(e => JSON.stringify(e)).join('\n') + (filtered.length ? '\n' : '')
    const tempPath = eventsPath + '.tmp'
    fs.writeFileSync(tempPath, content)
    fs.renameSync(tempPath, eventsPath)
    replaceAllEvents(filtered)
  } catch (err) {
    notifyError('Failed to purge timer events', err as Error)
  }
}

// ========================================
// Timer Name Normalization
// ========================================

export function normalizeTimerName(name: string): string {
  return name.trim().toLowerCase()
}

export function getDisplayName(normalizedName: string, originalName: string): string {
  if (!timerDisplayNames.has(normalizedName)) {
    timerDisplayNames.set(normalizedName, originalName.trim())
  }
  if (settings.timerFriendlyNames?.[normalizedName]) {
    return settings.timerFriendlyNames[normalizedName]
  }
  return timerDisplayNames.get(normalizedName)!
}
