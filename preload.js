const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe API to the renderer process
contextBridge.exposeInMainWorld('timerAPI', {
  // Timer operations
  startTimer: (timerName) => ipcRenderer.invoke('timer:start', timerName),
  pauseTimer: (timerName) => ipcRenderer.invoke('timer:pause', timerName),
  pauseAll: () => ipcRenderer.invoke('timer:pauseAll'),

  // Get timer state
  getTimers: () => ipcRenderer.invoke('timer:getAll'),
  getRunningTimer: () => ipcRenderer.invoke('timer:getRunning'),
  getState: () => ipcRenderer.invoke('timer:getState'),
  getTimeline: () => ipcRenderer.invoke('timer:getTimeline'),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),

  // Data export/import
  exportData: () => ipcRenderer.invoke('data:export'),
  importData: () => ipcRenderer.invoke('data:import'),
  getEventsPath: () => ipcRenderer.invoke('data:getEventsPath'),
  setEventsPath: () => ipcRenderer.invoke('data:setEventsPath'),
  resetEventsPath: () => ipcRenderer.invoke('data:resetEventsPath'),

  // App control
  quitApp: () => ipcRenderer.invoke('app:quit'),

  // Event listeners for updates from main process
  onTimerUpdate: (callback) => {
    ipcRenderer.on('timer:updated', (event, data) => callback(data));
  },
  onSettingsUpdate: (callback) => {
    ipcRenderer.on('settings:updated', (event, data) => callback(data));
  },
  onError: (callback) => {
    ipcRenderer.on('app:error', (event, data) => callback(data));
  },

  // Remove listeners
  removeTimerListener: () => {
    ipcRenderer.removeAllListeners('timer:updated');
  },
  removeSettingsListener: () => {
    ipcRenderer.removeAllListeners('settings:updated');
  },
  removeErrorListener: () => {
    ipcRenderer.removeAllListeners('app:error');
  }
});
