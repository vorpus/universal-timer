const { app, BrowserWindow, Tray, nativeImage, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');

// Keep references to prevent garbage collection
let tray = null;
let mainWindow = null;

// Window configuration
const WINDOW_WIDTH = 360;
const WINDOW_HEIGHT = 520;

// Tray icons (16x16 PNG base64)
// Idle icon: simple clock outline
const TRAY_ICON_IDLE = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA0klEQVQ4y62TsQ3CMBAE30FKRBfpgA5CBxQAHVACJUABdJAOKIAOUgJ0QAl0EDoIA4GQ4H+xZEt2gCefPL67f7vNVHwxFUBEGOEcEdqKP/0OHOELOMDxH4ABjoI7cPwLYIhz4ARMIILF9oDRN4AGCOAErF0ACVA9wAI0wAnYu4C5CyiNXkSEA4TuAtLDl0Zu4gIq4BhoJA4QQg1EcBwBM9cL1q4htww0wBLYehdYqBesvZnKh5TeRSowwLl6hQvwpZU7W6CnB/AALHpvqd+B/78vgXCTTJW9gAIAAAAASUVORK5CYII=';

// Active icon: clock with green dot indicator (recording)
const TRAY_ICON_ACTIVE = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAABCElEQVQ4y6WTsU7DMBCG/4uTlKYdkBiYWHgANt6AhQdg6MbCxsLGwsLExsLGxMLCxMTExMbEwkBVVaVpYufsA1dqSUvLgCXL8t397vP5Lgh+SERAzPgDAFaSBB8Pj2qfzTrR6zfY3S+U29kRO3tFF+EYOANfD49K5rSOnz6gmO9iOL1Er9+AJy8+7LJqgee7Z9WEwSsQjWV4uEYy62AwvfQRJAx7fLqBFD/VmTjGYHoJRGMAwP7xFZK5WXkbEIddhGNfAR9hwC2cR2MEuzfI5ru+ipwIh10/QZAEKOY7DQSd+3PMd9twHtCdXwEJQ6ub7+H08gH7x1dYKP/P32DziC9gv9P7p98DkKZmEg+YKRAAAAAASUVORK5CYII=';

function createTrayIcon(isActive) {
  const iconBase64 = isActive ? TRAY_ICON_ACTIVE : TRAY_ICON_IDLE;
  let icon = nativeImage.createFromDataURL(`data:image/png;base64,${iconBase64}`);

  // For macOS, mark as template image for proper dark/light mode support
  // But only for idle icon - active icon should show color
  if (process.platform === 'darwin' && !isActive) {
    icon.setTemplateImage(true);
  }

  return icon;
}

function updateTrayIcon(isActive) {
  if (tray) {
    tray.setImage(createTrayIcon(isActive));
    tray.setToolTip(isActive ? 'Time Tracker (Recording)' : 'Time Tracker');
  }
}

function createTray() {
  tray = new Tray(createTrayIcon(false));
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
  updateTrayIcon(initialState.runningTimer !== null);
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
  timerIcons: {}
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
    console.error('Failed to load settings:', err);
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
    console.error('Failed to save settings:', err);
  }
}

// ========================================
// Event Log Management
// ========================================

function appendEvent(event) {
  try {
    const eventsPath = getEventsPath();
    const line = JSON.stringify(event) + '\n';
    fs.appendFileSync(eventsPath, line);
  } catch (err) {
    console.error('Failed to append event:', err);
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
    console.error('Failed to load events:', err);
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
  notifyRenderer();
}

function pauseTimer(timerName) {
  const normalized = normalizeTimerName(timerName);
  const now = Date.now();
  appendEvent({ ts: now, event: 'pause', timer: normalized });
  notifyRenderer();
}

function pauseAll() {
  const now = Date.now();
  appendEvent({ ts: now, event: 'pause_all' });
  notifyRenderer();
}

function notifyRenderer() {
  const state = computeTimerState();

  // Update tray icon based on running timer
  updateTrayIcon(state.runningTimer !== null);

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
  settings = { ...settings, ...updates };
  saveSettings();

  // Re-register hotkeys if they changed
  if (JSON.stringify(settings.hotkeys) !== oldHotkeys) {
    registerGlobalHotkeys();
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('settings:updated', settings);
  }
  return settings;
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
