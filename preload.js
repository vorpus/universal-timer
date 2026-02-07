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

  // Event listeners for updates from main process
  onTimerUpdate: (callback) => {
    ipcRenderer.on('timer:updated', (event, data) => callback(data));
  },
  onSettingsUpdate: (callback) => {
    ipcRenderer.on('settings:updated', (event, data) => callback(data));
  },

  // Remove listeners
  removeTimerListener: () => {
    ipcRenderer.removeAllListeners('timer:updated');
  },
  removeSettingsListener: () => {
    ipcRenderer.removeAllListeners('settings:updated');
  }
});
