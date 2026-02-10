import { contextBridge, ipcRenderer } from 'electron'
import type { TimerAPI, TimerState, Settings, AppError } from '../shared/types'

// Expose a safe API to the renderer process
const api: TimerAPI = {
  // Timer operations
  startTimer: (timerName: string) => ipcRenderer.invoke('timer:start', timerName),
  pauseTimer: (timerName: string) => ipcRenderer.invoke('timer:pause', timerName),
  pauseAll: () => ipcRenderer.invoke('timer:pauseAll'),
  renameTimer: (name: string, newName: string) => ipcRenderer.invoke('timer:rename', name, newName),
  deleteTimer: (name: string) => ipcRenderer.invoke('timer:delete', name),

  // Get timer state
  getTimers: () => ipcRenderer.invoke('timer:getAll'),
  getRunningTimer: () => ipcRenderer.invoke('timer:getRunning'),
  getState: () => ipcRenderer.invoke('timer:getState'),
  getTimeline: (dateTs?: number) => ipcRenderer.invoke('timer:getTimeline', dateTs),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings: Partial<Settings>) => ipcRenderer.invoke('settings:update', settings),
  updateTimerOrder: (order: string[]) => ipcRenderer.invoke('settings:updateTimerOrder', order),

  // Data export/import
  exportData: () => ipcRenderer.invoke('data:export'),
  importData: () => ipcRenderer.invoke('data:import'),
  getEventsPath: () => ipcRenderer.invoke('data:getEventsPath'),
  setEventsPath: () => ipcRenderer.invoke('data:setEventsPath'),
  resetEventsPath: () => ipcRenderer.invoke('data:resetEventsPath'),

  // Platform info
  platform: process.platform,

  // Window pin
  togglePin: () => ipcRenderer.invoke('window:togglePin'),
  getPinned: () => ipcRenderer.invoke('window:getPinned'),
  onPinUpdate: (callback: (pinned: boolean) => void) => {
    ipcRenderer.on('window:pinUpdated', (_event, pinned: boolean) => callback(pinned))
  },
  removePinListener: () => {
    ipcRenderer.removeAllListeners('window:pinUpdated')
  },

  // App control
  quitApp: () => ipcRenderer.invoke('app:quit'),

  // Event listeners for updates from main process
  onTimerUpdate: (callback: (data: TimerState) => void) => {
    ipcRenderer.on('timer:updated', (_event, data: TimerState) => callback(data))
  },
  onSettingsUpdate: (callback: (data: Settings) => void) => {
    ipcRenderer.on('settings:updated', (_event, data: Settings) => callback(data))
  },
  onError: (callback: (data: AppError) => void) => {
    ipcRenderer.on('app:error', (_event, data: AppError) => callback(data))
  },

  // Remove listeners
  removeTimerListener: () => {
    ipcRenderer.removeAllListeners('timer:updated')
  },
  removeSettingsListener: () => {
    ipcRenderer.removeAllListeners('settings:updated')
  },
  removeErrorListener: () => {
    ipcRenderer.removeAllListeners('app:error')
  }
}

contextBridge.exposeInMainWorld('timerAPI', api)
