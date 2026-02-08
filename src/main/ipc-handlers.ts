import { app, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs'

import type { Settings, ExportData, OperationResult } from '../shared/types'
import { getMainWindow } from './app-state'
import {
  settings,
  DEFAULT_SETTINGS,
  loadEvents,
  saveSettings,
  updateSettings,
  getEventsPath,
  purgeTimerEvents,
  normalizeTimerName,
  timerDisplayNames
} from './storage'
import { computeTimerState, getTodayTimeline } from './timer-state'
import { startTimer, pauseTimer, pauseAll, notifyRenderer, registerGlobalHotkeys, updateTrayIcon } from './timer-actions'
import { getTrayIconIndex } from './timer-state'

export function registerIpcHandlers(): void {
  // ========================================
  // Timer Operations
  // ========================================

  ipcMain.handle('timer:start', (_event: Electron.IpcMainInvokeEvent, timerName: string) => {
    startTimer(timerName)
    return computeTimerState()
  })

  ipcMain.handle('timer:pause', (_event: Electron.IpcMainInvokeEvent, timerName: string) => {
    pauseTimer(timerName)
    return computeTimerState()
  })

  ipcMain.handle('timer:pauseAll', () => {
    pauseAll()
    return computeTimerState()
  })

  ipcMain.handle('timer:getAll', () => {
    return computeTimerState().timers
  })

  ipcMain.handle('timer:getRunning', () => {
    return computeTimerState().runningTimers
  })

  ipcMain.handle('timer:getState', () => {
    return computeTimerState()
  })

  ipcMain.handle('timer:getTimeline', () => {
    return getTodayTimeline()
  })

  ipcMain.handle('timer:rename', (_event: Electron.IpcMainInvokeEvent, normalizedName: string, newFriendlyName: string) => {
    if (!settings.timerFriendlyNames) {
      settings.timerFriendlyNames = {}
    }
    settings.timerFriendlyNames[normalizedName] = newFriendlyName.trim()
    saveSettings()
    notifyRenderer()
    return computeTimerState()
  })

  ipcMain.handle('timer:delete', (_event: Electron.IpcMainInvokeEvent, normalizedName: string) => {
    settings.timerOrder = (settings.timerOrder || []).filter(n => n !== normalizedName)

    if (settings.hotkeys?.timers?.[normalizedName]) {
      delete settings.hotkeys.timers[normalizedName]
    }

    if (settings.timerFriendlyNames?.[normalizedName]) {
      delete settings.timerFriendlyNames[normalizedName]
    }

    if (settings.deletedTimers) {
      settings.deletedTimers = settings.deletedTimers.filter(n => n !== normalizedName)
    }

    saveSettings()
    purgeTimerEvents(normalizedName)
    timerDisplayNames.delete(normalizedName)
    registerGlobalHotkeys()
    notifyRenderer()
    return computeTimerState()
  })

  // ========================================
  // Settings
  // ========================================

  ipcMain.handle('settings:get', () => {
    return settings
  })

  ipcMain.handle('settings:updateTimerOrder', (_event: Electron.IpcMainInvokeEvent, order: string[]) => {
    settings.timerOrder = order
    saveSettings()
    notifyRenderer()
    return settings
  })

  ipcMain.handle('settings:update', (_event: Electron.IpcMainInvokeEvent, updates: Partial<Settings>) => {
    const oldHotkeys = JSON.stringify(settings.hotkeys)
    const oldUseTaskNumber = settings.useTaskNumberAsTrayIcon
    updateSettings(updates)
    saveSettings()

    if (JSON.stringify(settings.hotkeys) !== oldHotkeys) {
      registerGlobalHotkeys()
    }

    if (settings.useTaskNumberAsTrayIcon !== oldUseTaskNumber) {
      const state = computeTimerState()
      updateTrayIcon(getTrayIconIndex(state))
    }

    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('settings:updated', settings)
    }
    return settings
  })

  // ========================================
  // Export / Import
  // ========================================

  ipcMain.handle('data:export', async () => {
    const win = getMainWindow()
    try {
      const result = await dialog.showSaveDialog(win!, {
        title: 'Export Time Tracker Data',
        defaultPath: `time-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
      })

      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true } as OperationResult
      }

      const events = loadEvents()
      const exportData: ExportData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: settings,
        events: events
      }

      const tempPath = result.filePath + '.tmp'
      fs.writeFileSync(tempPath, JSON.stringify(exportData, null, 2))
      fs.renameSync(tempPath, result.filePath)

      return { success: true, filePath: result.filePath } as OperationResult
    } catch (err) {
      console.error('Export failed:', err)
      return { success: false, error: (err as Error).message } as OperationResult
    }
  })

  ipcMain.handle('data:import', async () => {
    const win = getMainWindow()
    try {
      const result = await dialog.showOpenDialog(win!, {
        title: 'Import Time Tracker Data',
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
        properties: ['openFile']
      })

      if (result.canceled || !result.filePaths.length) {
        return { success: false, canceled: true } as OperationResult
      }

      const filePath = result.filePaths[0]
      const data = fs.readFileSync(filePath, 'utf8')
      const importData = JSON.parse(data) as ExportData

      if (!importData.version || !importData.settings || !importData.events) {
        return { success: false, error: 'Invalid backup file format' } as OperationResult
      }

      const confirm = await dialog.showMessageBox(win!, {
        type: 'warning',
        buttons: ['Cancel', 'Import'],
        defaultId: 0,
        title: 'Confirm Import',
        message: 'This will replace all your current data.',
        detail: `The backup contains ${importData.events.length} events. Your current data will be overwritten.`
      })

      if (confirm.response === 0) {
        return { success: false, canceled: true } as OperationResult
      }

      updateSettings({ ...DEFAULT_SETTINGS, ...importData.settings })
      saveSettings()

      const eventsPath = getEventsPath()
      const eventsContent = importData.events.map(e => JSON.stringify(e)).join('\n') + '\n'
      const tempPath = eventsPath + '.tmp'
      fs.writeFileSync(tempPath, eventsContent)
      fs.renameSync(tempPath, eventsPath)

      timerDisplayNames.clear()
      for (const event of importData.events) {
        if ('timer' in event) {
          const normalized = normalizeTimerName(event.timer)
          if (!timerDisplayNames.has(normalized)) {
            timerDisplayNames.set(normalized, event.timer)
          }
        }
      }

      registerGlobalHotkeys()
      notifyRenderer()

      if (win && !win.isDestroyed()) {
        win.webContents.send('settings:updated', settings)
      }

      return { success: true, eventsCount: importData.events.length } as OperationResult
    } catch (err) {
      console.error('Import failed:', err)
      return { success: false, error: (err as Error).message } as OperationResult
    }
  })

  // ========================================
  // Data Path Management
  // ========================================

  ipcMain.handle('data:getEventsPath', () => {
    return getEventsPath()
  })

  ipcMain.handle('data:setEventsPath', async () => {
    const win = getMainWindow()
    try {
      const result = await dialog.showOpenDialog(win!, {
        title: 'Select Event Log Location',
        defaultPath: path.dirname(getEventsPath()),
        properties: ['openDirectory', 'createDirectory']
      })

      if (result.canceled || !result.filePaths.length) {
        return { success: false, canceled: true } as OperationResult
      }

      const newPath = path.join(result.filePaths[0], 'events.jsonl')
      const oldPath = getEventsPath()

      if (oldPath !== newPath && fs.existsSync(oldPath)) {
        fs.copyFileSync(oldPath, newPath)
      }

      settings.eventLogPath = newPath
      saveSettings()

      return { success: true, path: newPath } as OperationResult
    } catch (err) {
      console.error('Failed to set events path:', err)
      return { success: false, error: (err as Error).message } as OperationResult
    }
  })

  ipcMain.handle('data:resetEventsPath', () => {
    settings.eventLogPath = null
    saveSettings()
    return { success: true, path: getEventsPath() } as OperationResult
  })

  // ========================================
  // App Control
  // ========================================

  ipcMain.handle('app:quit', () => {
    app.quit()
  })
}
