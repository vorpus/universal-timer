const { app, BrowserWindow, Tray, nativeImage, ipcMain, globalShortcut, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Keep references to prevent garbage collection
let tray = null;
let mainWindow = null;

// Window configuration
const WINDOW_WIDTH = 360;
const WINDOW_HEIGHT = 520;

// Tray icon paths
const TRAY_ICONS_PATH = path.join(__dirname, 'assets', 'tray-icons');

function createTrayIcon(timerIndex) {
  let iconPath;

  if (timerIndex === null) {
    // No timer running - use paused icon
    iconPath = path.join(TRAY_ICONS_PATH, 'pausedTemplate.png');
  } else if (settings.useTaskNumberAsTrayIcon && timerIndex >= 1 && timerIndex <= 9) {
    // Timer 1-9 with setting enabled - use numbered icon
    iconPath = path.join(TRAY_ICONS_PATH, `${timerIndex}Template.png`);
  } else {
    // Timer 10+ or setting disabled - use generic recording icon
    iconPath = path.join(TRAY_ICONS_PATH, 'recordingTemplate.png');
  }

  const icon = nativeImage.createFromPath(iconPath);

  // For macOS, mark as template image for proper dark/light mode support
  if (process.platform === 'darwin') {
    icon.setTemplateImage(true);
  }

  return icon;
}

function updateTrayIcon(timerIndex) {
  if (tray) {
    tray.setImage(createTrayIcon(timerIndex));
    tray.setToolTip(timerIndex !== null ? 'Time Tracker (Recording)' : 'Time Tracker');
  }
}

// ========================================
// Sound Effects
// ========================================

function playSound(soundType) {
  if (!settings.playSounds) {
    return;
  }

  const soundFile = soundType === 'start' ? 'sound-start.wav' : 'sound-pause.wav';
  const soundPath = path.join(__dirname, 'assets', soundFile);

  // Check if sound file exists before trying to play
  if (!fs.existsSync(soundPath)) {
    return;
  }

  // Use Electron shell to play sound or spawn afplay on macOS
  if (process.platform === 'darwin') {
    const { exec } = require('child_process');
    exec(`afplay "${soundPath}"`, (err) => {
      if (err) {
        console.error('Failed to play sound:', err);
      }
    });
  }
}

function createTray() {
  tray = new Tray(createTrayIcon(null));
  tray.setToolTip('Time Tracker');

  // Toggle window on tray click
  tray.on('click', (event, bounds) => {
    toggleWindow(bounds);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile('index.html');

  // Hide window when it loses focus
  mainWindow.on('blur', () => {
    if (!mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.hide();
    }
  });

  // Prevent window from being destroyed, just hide it
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function toggleWindow(trayBounds) {
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    positionWindow(trayBounds);
    mainWindow.show();
    mainWindow.focus();
  }
}

function positionWindow(trayBounds) {
  const windowBounds = mainWindow.getBounds();

  // Position window below the tray icon, centered horizontally
  let x = Math.round(trayBounds.x + (trayBounds.width / 2) - (windowBounds.width / 2));
  let y = Math.round(trayBounds.y + trayBounds.height + 4);

  // Ensure window stays within screen bounds
  const { screen } = require('electron');
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
  const screenBounds = display.workArea;

  // Adjust if window would go off right edge
  if (x + windowBounds.width > screenBounds.x + screenBounds.width) {
    x = screenBounds.x + screenBounds.width - windowBounds.width;
  }

  // Adjust if window would go off left edge
  if (x < screenBounds.x) {
    x = screenBounds.x;
  }

  // On macOS, if tray is at bottom (unlikely but possible), position above
  if (y + windowBounds.height > screenBounds.y + screenBounds.height) {
    y = trayBounds.y - windowBounds.height - 4;
  }

  mainWindow.setPosition(x, y, false);
}

// Hide dock icon on macOS
if (process.platform === 'darwin') {
  app.dock.hide();
}

// ========================================
// Global Hotkeys
// ========================================

function registerGlobalHotkeys() {
  // Unregister all existing shortcuts first
  globalShortcut.unregisterAll();

  // Register pause all hotkey
  const pauseAllHotkey = settings.hotkeys?.pauseAll || 'CmdOrCtrl+Shift+P';
  try {
    const registered = globalShortcut.register(pauseAllHotkey, () => {
      pauseAll();
    });
    if (!registered) {
      console.error(`Failed to register hotkey: ${pauseAllHotkey}`);
    }
  } catch (err) {
    console.error(`Error registering hotkey ${pauseAllHotkey}:`, err);
  }

  // Register per-timer hotkeys
  const timerHotkeys = settings.hotkeys?.timers || {};
  for (const [timerName, hotkey] of Object.entries(timerHotkeys)) {
    try {
      const registered = globalShortcut.register(hotkey, () => {
        // Toggle timer: if running, pause it; if paused, start it
        const state = computeTimerState();
        if (state.runningTimer === timerName) {
          pauseTimer(timerName);
        } else {
          startTimer(timerName);
        }
      });
      if (!registered) {
        console.error(`Failed to register hotkey for timer "${timerName}": ${hotkey}`);
      }
    } catch (err) {
      console.error(`Error registering hotkey for timer "${timerName}":`, err);
    }
  }
}

// App lifecycle
app.whenReady().then(() => {
  createTray();
  createWindow();
  registerGlobalHotkeys();

  // Check if there's a running timer on startup (crash recovery) and update tray icon
  const initialState = computeTimerState();
  let timerIndex = null;
  if (initialState.runningTimer !== null) {
    const index = initialState.timers.findIndex(t => t.name === initialState.runningTimer);
    if (index !== -1) {
      timerIndex = index + 1; // 1-based index
    }
  }
  updateTrayIcon(timerIndex);
});

app.on('window-all-closed', () => {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('will-quit', () => {
  // Unregister all shortcuts when quitting
  globalShortcut.unregisterAll();
});

app.on('activate', () => {
  // On macOS, re-create window if dock icon is clicked (shouldn't happen since hidden)
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ========================================
// Data Storage
// ========================================

function getDataPath() {
  return app.getPath('userData');
}

function getSettingsPath() {
  return path.join(getDataPath(), 'settings.json');
}

function getEventsPath() {
  if (settings.eventLogPath) {
    return settings.eventLogPath;
  }
  return path.join(getDataPath(), 'events.jsonl');
}

// Default settings
const DEFAULT_SETTINGS = {
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
  useTaskNumberAsTrayIcon: true
};

// In-memory state
let settings = { ...DEFAULT_SETTINGS };
let runningTimer = null; // Name of the currently running timer (normalized)
let runningTimerStart = null; // Timestamp when it started

// ========================================
// Settings Management
// ========================================

function loadSettings() {
  try {
    const settingsPath = getSettingsPath();
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      settings = { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    }
  } catch (err) {
    notifyError('Failed to load settings - using defaults', err);
    settings = { ...DEFAULT_SETTINGS };
  }
  return settings;
}

function saveSettings() {
  try {
    const settingsPath = getSettingsPath();
    const tempPath = settingsPath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(settings, null, 2));
    fs.renameSync(tempPath, settingsPath);
  } catch (err) {
    notifyError('Failed to save settings', err);
  }
}

// ========================================
// Event Log Management
// ========================================

function notifyError(message, details = null) {
  console.error(message, details);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:error', { message, details: details?.message || details });
  }
}

function appendEvent(event) {
  try {
    const eventsPath = getEventsPath();
    const line = JSON.stringify(event) + '\n';
    fs.appendFileSync(eventsPath, line);
  } catch (err) {
    notifyError('Failed to save timer event', err);
  }
}

function loadEvents() {
  try {
    const eventsPath = getEventsPath();
    if (!fs.existsSync(eventsPath)) {
      return [];
    }
    const data = fs.readFileSync(eventsPath, 'utf8');
    const lines = data.split('\n').filter(line => line.trim());
    const events = [];
    for (const line of lines) {
      try {
        events.push(JSON.parse(line));
      } catch (e) {
        // Skip invalid lines
      }
    }
    return events;
  } catch (err) {
    notifyError('Failed to load timer history', err);
    return [];
  }
}

// ========================================
// Timer Name Normalization
// ========================================

function normalizeTimerName(name) {
  return name.trim().toLowerCase();
}

// Track display names (first occurrence casing)
const timerDisplayNames = new Map();

function getDisplayName(normalizedName, originalName) {
  if (!timerDisplayNames.has(normalizedName)) {
    timerDisplayNames.set(normalizedName, originalName.trim());
  }
  return timerDisplayNames.get(normalizedName);
}

// ========================================
// Day Boundary Calculations
// ========================================

function getDayStart(date = new Date()) {
  const dayStart = new Date(date);
  dayStart.setHours(settings.dayStartHour, settings.dayStartMinute, 0, 0);

  // If current time is before day start, go back to previous day's start
  if (date < dayStart) {
    dayStart.setDate(dayStart.getDate() - 1);
  }

  return dayStart;
}

function getDayEnd(dayStart) {
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  return dayEnd;
}

// ========================================
// Weekly Trend Calculation
// ========================================

function calculateTotalForDay(events, dayStart, dayEnd, activeTimers, now) {
  // Build intervals from events
  const timerIntervals = new Map();
  const tempActiveTimers = new Map();

  for (const event of events) {
    const ts = event.ts;
    const timer = event.timer;

    if (event.event === 'start') {
      tempActiveTimers.set(timer, ts);
    } else if (event.event === 'pause') {
      if (tempActiveTimers.has(timer)) {
        const startTs = tempActiveTimers.get(timer);
        if (!timerIntervals.has(timer)) {
          timerIntervals.set(timer, []);
        }
        timerIntervals.get(timer).push({ start: startTs, end: ts });
        tempActiveTimers.delete(timer);
      }
    } else if (event.event === 'pause_all') {
      for (const [t, startTs] of tempActiveTimers) {
        if (!timerIntervals.has(t)) {
          timerIntervals.set(t, []);
        }
        timerIntervals.get(t).push({ start: startTs, end: ts });
      }
      tempActiveTimers.clear();
    }
  }

  let total = 0;
  const dayStartTs = dayStart.getTime();
  const dayEndTs = dayEnd.getTime();

  // Sum completed intervals that overlap with this day
  for (const intervals of timerIntervals.values()) {
    for (const interval of intervals) {
      const overlapStart = Math.max(interval.start, dayStartTs);
      const overlapEnd = Math.min(interval.end, dayEndTs);
      if (overlapStart < overlapEnd) {
        total += overlapEnd - overlapStart;
      }
    }
  }

  // Add time from currently active timers (only for today)
  if (activeTimers && now) {
    for (const [timerName, startTs] of activeTimers) {
      const overlapStart = Math.max(startTs, dayStartTs);
      const overlapEnd = Math.min(now, dayEndTs);
      if (overlapStart < overlapEnd) {
        total += overlapEnd - overlapStart;
      }
    }
  }

  return total;
}

function calculateWeeklyTrend(events, todayTotal, activeTimers, now) {
  const today = getDayStart();

  // Get the start of the week (Monday as first day)
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  // If today is Monday, there's no previous week data to compare
  if (daysFromMonday === 0) {
    return 0;
  }

  // Calculate totals for each previous day this week
  const previousDayTotals = [];
  for (let i = 1; i <= daysFromMonday; i++) {
    const dayStart = new Date(today);
    dayStart.setDate(dayStart.getDate() - i);
    const dayEnd = getDayEnd(dayStart);

    const dayTotal = calculateTotalForDay(events, dayStart, dayEnd, null, null);
    previousDayTotals.push(dayTotal);
  }

  // Calculate average of previous days
  const previousSum = previousDayTotals.reduce((sum, t) => sum + t, 0);
  const previousAvg = previousSum / previousDayTotals.length;

  // If no previous data, return 0
  if (previousAvg === 0) {
    return todayTotal > 0 ? 100 : 0;
  }

  // Calculate percentage difference
  const trend = Math.round(((todayTotal - previousAvg) / previousAvg) * 100);
  return trend;
}

// ========================================
// Timer State Computation
// ========================================

function computeTimerState() {
  const events = loadEvents();
  const now = Date.now();
  const todayStart = getDayStart().getTime();
  const todayEnd = getDayEnd(getDayStart()).getTime();

  // Build timer elapsed times
  const timerIntervals = new Map(); // timer -> [{start, end}]
  const activeTimers = new Map(); // timer -> startTs (for unterminated timers)

  for (const event of events) {
    const ts = event.ts;
    const timer = event.timer;

    if (event.event === 'start') {
      activeTimers.set(timer, ts);
    } else if (event.event === 'pause') {
      if (activeTimers.has(timer)) {
        const startTs = activeTimers.get(timer);
        if (!timerIntervals.has(timer)) {
          timerIntervals.set(timer, []);
        }
        timerIntervals.get(timer).push({ start: startTs, end: ts });
        activeTimers.delete(timer);
      }
    } else if (event.event === 'pause_all') {
      for (const [t, startTs] of activeTimers) {
        if (!timerIntervals.has(t)) {
          timerIntervals.set(t, []);
        }
        timerIntervals.get(t).push({ start: startTs, end: ts });
      }
      activeTimers.clear();
    }
  }

  // Calculate elapsed today for each timer
  const timers = [];
  const allTimerNames = new Set([...timerIntervals.keys(), ...activeTimers.keys()]);

  for (const timerName of allTimerNames) {
    let elapsedToday = 0;
    const intervals = timerIntervals.get(timerName) || [];

    // Add completed intervals
    for (const interval of intervals) {
      const overlapStart = Math.max(interval.start, todayStart);
      const overlapEnd = Math.min(interval.end, todayEnd);
      if (overlapStart < overlapEnd) {
        elapsedToday += overlapEnd - overlapStart;
      }
    }

    // Add time from active (unterminated) timer
    if (activeTimers.has(timerName)) {
      const startTs = activeTimers.get(timerName);
      const overlapStart = Math.max(startTs, todayStart);
      const overlapEnd = Math.min(now, todayEnd);
      if (overlapStart < overlapEnd) {
        elapsedToday += overlapEnd - overlapStart;
      }
    }

    timers.push({
      name: timerName,
      displayName: timerDisplayNames.get(timerName) || timerName,
      elapsedToday
    });
  }

  // Sort by most recently used (or by elapsed time descending)
  timers.sort((a, b) => b.elapsedToday - a.elapsedToday);

  // Compute running timer
  let currentRunning = null;
  if (activeTimers.size > 0) {
    currentRunning = [...activeTimers.keys()][0];
  }

  // Calculate total today
  const totalToday = timers.reduce((sum, t) => sum + t.elapsedToday, 0);

  // Calculate weekly trend
  const weeklyTrend = calculateWeeklyTrend(events, totalToday, activeTimers, now);

  return {
    timers,
    runningTimer: currentRunning,
    totalToday,
    weeklyTrend
  };
}

// ========================================
// Timeline Data
// ========================================

// Color palette for timers (deterministic based on order of first appearance)
const TIMER_COLORS = [
  '#4a9eff', // blue
  '#4ade80', // green
  '#f472b6', // pink
  '#fbbf24', // amber
  '#a78bfa', // purple
  '#22d3d3', // cyan
  '#fb923c', // orange
  '#f87171', // red
];

function getTimerColor(timerName, timerOrder) {
  const index = timerOrder.indexOf(timerName);
  if (index === -1) return TIMER_COLORS[0];
  return TIMER_COLORS[index % TIMER_COLORS.length];
}

function getTodayTimeline() {
  const events = loadEvents();
  const now = Date.now();
  const todayStart = getDayStart().getTime();
  const todayEnd = getDayEnd(getDayStart()).getTime();

  // Build timer intervals
  const timerIntervals = new Map();
  const activeTimers = new Map();
  const timerOrder = []; // Track order of first appearance

  for (const event of events) {
    const ts = event.ts;
    const timer = event.timer;

    if (event.event === 'start') {
      activeTimers.set(timer, ts);
      if (timer && !timerOrder.includes(timer)) {
        timerOrder.push(timer);
      }
    } else if (event.event === 'pause') {
      if (activeTimers.has(timer)) {
        const startTs = activeTimers.get(timer);
        if (!timerIntervals.has(timer)) {
          timerIntervals.set(timer, []);
        }
        timerIntervals.get(timer).push({ start: startTs, end: ts });
        activeTimers.delete(timer);
      }
    } else if (event.event === 'pause_all') {
      for (const [t, startTs] of activeTimers) {
        if (!timerIntervals.has(t)) {
          timerIntervals.set(t, []);
        }
        timerIntervals.get(t).push({ start: startTs, end: ts });
      }
      activeTimers.clear();
    }
  }

  // Collect today's segments (clipped to day boundaries)
  const segments = [];

  for (const [timerName, intervals] of timerIntervals) {
    for (const interval of intervals) {
      const overlapStart = Math.max(interval.start, todayStart);
      const overlapEnd = Math.min(interval.end, todayEnd);
      if (overlapStart < overlapEnd) {
        segments.push({
          timer: timerName,
          displayName: timerDisplayNames.get(timerName) || timerName,
          start: overlapStart,
          end: overlapEnd,
          color: getTimerColor(timerName, timerOrder)
        });
      }
    }
  }

  // Add active timer segments up to now
  for (const [timerName, startTs] of activeTimers) {
    const overlapStart = Math.max(startTs, todayStart);
    const overlapEnd = Math.min(now, todayEnd);
    if (overlapStart < overlapEnd) {
      segments.push({
        timer: timerName,
        displayName: timerDisplayNames.get(timerName) || timerName,
        start: overlapStart,
        end: overlapEnd,
        color: getTimerColor(timerName, timerOrder)
      });
    }
  }

  // Sort by start time
  segments.sort((a, b) => a.start - b.start);

  return {
    dayStart: todayStart,
    dayEnd: todayEnd,
    segments,
    timerColors: Object.fromEntries(timerOrder.map((t, i) => [t, TIMER_COLORS[i % TIMER_COLORS.length]]))
  };
}

// ========================================
// Timer Actions
// ========================================

function startTimer(timerName) {
  const normalized = normalizeTimerName(timerName);
  getDisplayName(normalized, timerName);

  const now = Date.now();

  // Pause others if setting is enabled
  if (settings.pauseOthersOnStart) {
    const state = computeTimerState();
    if (state.runningTimer && state.runningTimer !== normalized) {
      appendEvent({ ts: now, event: 'pause', timer: state.runningTimer });
    }
  }

  appendEvent({ ts: now, event: 'start', timer: normalized });
  playSound('start');
  notifyRenderer();
}

function pauseTimer(timerName) {
  const normalized = normalizeTimerName(timerName);
  const now = Date.now();
  appendEvent({ ts: now, event: 'pause', timer: normalized });
  playSound('pause');
  notifyRenderer();
}

function pauseAll() {
  const now = Date.now();
  appendEvent({ ts: now, event: 'pause_all' });
  playSound('pause');
  notifyRenderer();
}

function notifyRenderer() {
  const state = computeTimerState();

  // Compute running timer's index (1-based position in sorted timer list)
  let timerIndex = null;
  if (state.runningTimer !== null) {
    const index = state.timers.findIndex(t => t.name === state.runningTimer);
    if (index !== -1) {
      timerIndex = index + 1; // 1-based index
    }
  }

  // Update tray icon based on running timer index
  updateTrayIcon(timerIndex);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('timer:updated', state);
  }
}

// ========================================
// IPC Handlers
// ========================================

ipcMain.handle('timer:start', (event, timerName) => {
  startTimer(timerName);
  return computeTimerState();
});

ipcMain.handle('timer:pause', (event, timerName) => {
  pauseTimer(timerName);
  return computeTimerState();
});

ipcMain.handle('timer:pauseAll', () => {
  pauseAll();
  return computeTimerState();
});

ipcMain.handle('timer:getAll', () => {
  return computeTimerState().timers;
});

ipcMain.handle('timer:getRunning', () => {
  return computeTimerState().runningTimer;
});

ipcMain.handle('timer:getState', () => {
  return computeTimerState();
});

ipcMain.handle('timer:getTimeline', () => {
  return getTodayTimeline();
});

ipcMain.handle('settings:get', () => {
  return settings;
});

ipcMain.handle('settings:update', (event, updates) => {
  const oldHotkeys = JSON.stringify(settings.hotkeys);
  const oldUseTaskNumber = settings.useTaskNumberAsTrayIcon;
  settings = { ...settings, ...updates };
  saveSettings();

  // Re-register hotkeys if they changed
  if (JSON.stringify(settings.hotkeys) !== oldHotkeys) {
    registerGlobalHotkeys();
  }

  // Refresh tray icon if the task number setting changed
  if (settings.useTaskNumberAsTrayIcon !== oldUseTaskNumber) {
    const state = computeTimerState();
    let timerIndex = null;
    if (state.runningTimer !== null) {
      const index = state.timers.findIndex(t => t.name === state.runningTimer);
      if (index !== -1) {
        timerIndex = index + 1;
      }
    }
    updateTrayIcon(timerIndex);
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('settings:updated', settings);
  }
  return settings;
});

// ========================================
// Export/Import
// ========================================

ipcMain.handle('data:export', async () => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Time Tracker Data',
      defaultPath: `time-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    // Bundle settings and events
    const events = loadEvents();
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: settings,
      events: events
    };

    const tempPath = result.filePath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(exportData, null, 2));
    fs.renameSync(tempPath, result.filePath);

    return { success: true, filePath: result.filePath };
  } catch (err) {
    console.error('Export failed:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('data:import', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Time Tracker Data',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile']
    });

    if (result.canceled || !result.filePaths.length) {
      return { success: false, canceled: true };
    }

    const filePath = result.filePaths[0];
    const data = fs.readFileSync(filePath, 'utf8');
    const importData = JSON.parse(data);

    // Validate import data structure
    if (!importData.version || !importData.settings || !importData.events) {
      return { success: false, error: 'Invalid backup file format' };
    }

    // Confirm with user before overwriting
    const confirm = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Cancel', 'Import'],
      defaultId: 0,
      title: 'Confirm Import',
      message: 'This will replace all your current data.',
      detail: `The backup contains ${importData.events.length} events. Your current data will be overwritten.`
    });

    if (confirm.response === 0) {
      return { success: false, canceled: true };
    }

    // Import settings
    settings = { ...DEFAULT_SETTINGS, ...importData.settings };
    saveSettings();

    // Import events (overwrite the events file)
    const eventsPath = getEventsPath();
    const eventsContent = importData.events.map(e => JSON.stringify(e)).join('\n') + '\n';
    const tempPath = eventsPath + '.tmp';
    fs.writeFileSync(tempPath, eventsContent);
    fs.renameSync(tempPath, eventsPath);

    // Reload display names from imported events
    timerDisplayNames.clear();
    for (const event of importData.events) {
      if (event.timer) {
        const normalized = normalizeTimerName(event.timer);
        if (!timerDisplayNames.has(normalized)) {
          timerDisplayNames.set(normalized, event.timer);
        }
      }
    }

    // Re-register hotkeys with new settings
    registerGlobalHotkeys();

    // Notify renderer of changes
    notifyRenderer();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('settings:updated', settings);
    }

    return { success: true, eventsCount: importData.events.length };
  } catch (err) {
    console.error('Import failed:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('app:quit', () => {
  app.quit();
});

ipcMain.handle('data:getEventsPath', () => {
  return getEventsPath();
});

ipcMain.handle('data:setEventsPath', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Event Log Location',
      defaultPath: path.dirname(getEventsPath()),
      properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || !result.filePaths.length) {
      return { success: false, canceled: true };
    }

    const newPath = path.join(result.filePaths[0], 'events.jsonl');
    const oldPath = getEventsPath();

    // Copy existing events to new location if they exist
    if (fs.existsSync(oldPath) && oldPath !== newPath) {
      const existingData = fs.readFileSync(oldPath, 'utf8');
      fs.writeFileSync(newPath, existingData);
    }

    // Update settings
    settings.eventLogPath = newPath;
    saveSettings();

    return { success: true, path: newPath };
  } catch (err) {
    console.error('Failed to set events path:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('data:resetEventsPath', () => {
  settings.eventLogPath = null;
  saveSettings();
  return { success: true, path: getEventsPath() };
});

// ========================================
// Initialization
// ========================================

// Load settings and display names on startup
loadSettings();

// Load existing events to populate display names
const existingEvents = loadEvents();
for (const event of existingEvents) {
  if (event.timer) {
    const normalized = normalizeTimerName(event.timer);
    if (!timerDisplayNames.has(normalized)) {
      timerDisplayNames.set(normalized, event.timer);
    }
  }
}
