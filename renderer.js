// Toast notifications
function showToast(message, duration = 5000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Listen for errors from main process
window.timerAPI.onError((data) => {
  showToast(data.message);
});

// Tab switching
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

// Live update state
let currentTimers = [];
let currentRunningTimer = null;
let liveUpdateInterval = null;

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.dataset.tab;

    // Update active tab
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    // Update active content
    tabContents.forEach(content => {
      content.classList.remove('active');
      if (content.id === `${targetTab}-tab`) {
        content.classList.add('active');
      }
    });
  });
});

// Timer input handling
const timerInput = document.getElementById('timer-input');
const timerList = document.getElementById('timer-list');

timerInput.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') {
    const timerName = timerInput.value.trim();
    if (timerName) {
      try {
        await window.timerAPI.startTimer(timerName);
        timerInput.value = '';
      } catch (err) {
        console.error('Failed to start timer:', err);
      }
    }
  }
});

// Format time as H:MM:SS
function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Render timer list
function renderTimers(timers, runningTimer) {
  // Store current state for live updates
  currentTimers = timers || [];
  currentRunningTimer = runningTimer;

  if (!timers || timers.length === 0) {
    timerList.innerHTML = `
      <div class="empty-state">
        <p>No timers yet</p>
        <p>Type a name above and press Enter to start</p>
      </div>
    `;
    stopLiveUpdate();
    return;
  }

  timerList.innerHTML = timers.map((timer, index) => {
    const isRunning = runningTimer === timer.name;
    const orderNumber = index + 1;
    return `
      <div class="timer-item ${isRunning ? 'running' : ''}" data-timer="${timer.name}">
        <div class="timer-info">
          <div class="timer-name"><span class="timer-order">${orderNumber}</span>${escapeHtml(timer.displayName || timer.name)}</div>
          <div class="timer-time" data-base-elapsed="${timer.elapsedToday}">${formatTime(timer.elapsedToday)}</div>
        </div>
        <button class="timer-btn ${isRunning ? 'pause' : 'play'}" data-action="${isRunning ? 'pause' : 'play'}">
          ${isRunning ? '⏸' : '▶'}
        </button>
      </div>
    `;
  }).join('');

  // Add click handlers for play/pause buttons
  timerList.querySelectorAll('.timer-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const timerItem = e.target.closest('.timer-item');
      const timerName = timerItem.dataset.timer;
      const action = btn.dataset.action;

      try {
        if (action === 'play') {
          await window.timerAPI.startTimer(timerName);
        } else {
          await window.timerAPI.pauseTimer(timerName);
        }
      } catch (err) {
        console.error('Failed to toggle timer:', err);
      }
    });
  });

  // Start or stop live update based on whether a timer is running
  if (runningTimer) {
    startLiveUpdate();
  } else {
    stopLiveUpdate();
  }

  // Update timer hotkeys in settings if visible
  updateTimerHotkeysIfNeeded();
}

// Update timer hotkeys section if it exists and timers have changed
async function updateTimerHotkeysIfNeeded() {
  const container = document.getElementById('timer-hotkeys-container');
  if (container) {
    try {
      const settings = await window.timerAPI.getSettings();
      renderTimerHotkeys(settings.hotkeys?.timers ?? {});
    } catch (err) {
      console.error('Failed to update timer hotkeys:', err);
    }
  }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Live update functions for running timer display
let liveUpdateStartTime = null;

function startLiveUpdate() {
  if (liveUpdateInterval) {
    return; // Already running
  }

  liveUpdateStartTime = Date.now();

  liveUpdateInterval = setInterval(() => {
    updateRunningTimerDisplay();
  }, 1000);
}

function stopLiveUpdate() {
  if (liveUpdateInterval) {
    clearInterval(liveUpdateInterval);
    liveUpdateInterval = null;
    liveUpdateStartTime = null;
  }
}

function updateRunningTimerDisplay() {
  if (!currentRunningTimer || !liveUpdateStartTime) {
    return;
  }

  const elapsed = Date.now() - liveUpdateStartTime;

  // Find the running timer element and update its display
  const runningTimerItem = timerList.querySelector(`.timer-item[data-timer="${currentRunningTimer}"]`);
  if (runningTimerItem) {
    const timeEl = runningTimerItem.querySelector('.timer-time');
    if (timeEl) {
      const baseElapsed = parseInt(timeEl.dataset.baseElapsed, 10) || 0;
      timeEl.textContent = formatTime(baseElapsed + elapsed);
    }
  }

  // Also update the total time in metrics
  updateTotalTimeDisplay(elapsed);
}

function updateTotalTimeDisplay(additionalElapsed) {
  const totalTimeEl = document.getElementById('total-time');
  if (totalTimeEl && totalTimeEl.dataset.baseTotal !== undefined) {
    const baseTotal = parseInt(totalTimeEl.dataset.baseTotal, 10) || 0;
    totalTimeEl.textContent = formatTime(baseTotal + additionalElapsed);
  }
}

// Update metrics display
function updateMetrics(data) {
  const totalTimeEl = document.getElementById('total-time');
  const weeklyTrendEl = document.getElementById('weekly-trend');

  if (data.totalToday !== undefined) {
    totalTimeEl.textContent = formatTime(data.totalToday);
    totalTimeEl.dataset.baseTotal = data.totalToday;
  }

  if (data.weeklyTrend !== undefined) {
    const trend = data.weeklyTrend;
    if (trend > 0) {
      weeklyTrendEl.textContent = `+${trend}% vs weekly avg`;
      weeklyTrendEl.className = 'metric-trend up';
    } else if (trend < 0) {
      weeklyTrendEl.textContent = `${trend}% vs weekly avg`;
      weeklyTrendEl.className = 'metric-trend down';
    } else {
      weeklyTrendEl.textContent = 'Same as weekly avg';
      weeklyTrendEl.className = 'metric-trend';
    }
  }
}

// Render timeline bar with color-coded segments
async function renderTimeline() {
  const timelineBar = document.getElementById('timeline-bar');

  try {
    const timeline = await window.timerAPI.getTimeline();

    if (!timeline.segments || timeline.segments.length === 0) {
      timelineBar.innerHTML = '';
      return;
    }

    const dayDuration = timeline.dayEnd - timeline.dayStart;
    const now = Date.now();
    const currentDayProgress = Math.min(now - timeline.dayStart, dayDuration);

    // Build timeline segments as percentage of day progress so far
    // This shows the timeline relative to how much of the day has passed
    const segmentsHtml = timeline.segments.map(segment => {
      // Calculate position and width relative to the full day
      const startPercent = ((segment.start - timeline.dayStart) / dayDuration) * 100;
      const widthPercent = ((segment.end - segment.start) / dayDuration) * 100;

      return `<div class="timeline-segment" style="
        position: absolute;
        left: ${startPercent}%;
        width: ${widthPercent}%;
        background: ${segment.color};
      " title="${escapeHtml(segment.displayName)}"></div>`;
    }).join('');

    // Show current time indicator
    const nowPercent = (currentDayProgress / dayDuration) * 100;
    const nowIndicator = `<div style="
      position: absolute;
      left: ${nowPercent}%;
      width: 2px;
      height: 100%;
      background: rgba(255,255,255,0.5);
    "></div>`;

    timelineBar.style.position = 'relative';
    timelineBar.innerHTML = segmentsHtml + nowIndicator;
  } catch (err) {
    console.error('Failed to render timeline:', err);
  }
}

// Initialize settings UI
async function initSettings() {
  try {
    const settings = await window.timerAPI.getSettings();
    if (settings) {
      document.getElementById('pause-others').checked = settings.pauseOthersOnStart ?? true;
      document.getElementById('play-sounds').checked = settings.playSounds ?? false;
      document.getElementById('use-task-number-tray').checked = settings.useTaskNumberAsTrayIcon ?? true;

      const hour = String(settings.dayStartHour ?? 0).padStart(2, '0');
      const minute = String(settings.dayStartMinute ?? 0).padStart(2, '0');
      document.getElementById('day-start').value = `${hour}:${minute}`;

      document.getElementById('pause-all-hotkey').value = settings.hotkeys?.pauseAll ?? '';

      // Render per-timer hotkeys
      renderTimerHotkeys(settings.hotkeys?.timers ?? {});
    }

    // Load events path
    const eventsPath = await window.timerAPI.getEventsPath();
    document.getElementById('events-path').textContent = eventsPath;
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

// Render per-timer hotkeys in settings
function renderTimerHotkeys(timerHotkeys) {
  const container = document.getElementById('timer-hotkeys-container');
  if (!currentTimers || currentTimers.length === 0) {
    container.innerHTML = '<div class="setting-description" style="padding: 12px; color: #666;">Create timers to assign hotkeys</div>';
    return;
  }

  container.innerHTML = currentTimers.map(timer => {
    const hotkey = timerHotkeys[timer.name] || '';
    return `
      <div class="setting-row">
        <div>
          <div class="setting-label">${escapeHtml(timer.displayName || timer.name)}</div>
          <div class="setting-description">Start/pause this timer</div>
        </div>
        <div class="hotkey-input-container">
          <input type="text" class="hotkey-input timer-hotkey-input" data-timer="${timer.name}" readonly placeholder="Click to set" value="${escapeHtml(hotkey)}">
          <button class="hotkey-clear timer-hotkey-clear" data-timer="${timer.name}" title="Clear hotkey">&times;</button>
        </div>
      </div>
    `;
  }).join('');

  // Add event listeners to timer hotkey inputs
  container.querySelectorAll('.timer-hotkey-input').forEach(input => {
    setupHotkeyInput(input, async (hotkey) => {
      const timerName = input.dataset.timer;
      const settings = await window.timerAPI.getSettings();
      const timers = { ...(settings.hotkeys?.timers ?? {}), [timerName]: hotkey };
      await window.timerAPI.updateSettings({ hotkeys: { ...settings.hotkeys, timers } });
    });
  });

  container.querySelectorAll('.timer-hotkey-clear').forEach(btn => {
    btn.addEventListener('click', async () => {
      const timerName = btn.dataset.timer;
      const input = container.querySelector(`.timer-hotkey-input[data-timer="${timerName}"]`);
      if (input) input.value = '';
      const settings = await window.timerAPI.getSettings();
      const timers = { ...(settings.hotkeys?.timers ?? {}) };
      delete timers[timerName];
      await window.timerAPI.updateSettings({ hotkeys: { ...settings.hotkeys, timers } });
    });
  });
}

// Convert key event to Electron accelerator format
function keyEventToAccelerator(e) {
  const parts = [];

  if (e.metaKey) parts.push('CmdOrCtrl');
  else if (e.ctrlKey) parts.push('CmdOrCtrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  // Get the key
  let key = e.key;

  // Skip if only modifier keys
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
    return null;
  }

  // Normalize key names
  if (key === ' ') key = 'Space';
  else if (key === 'ArrowUp') key = 'Up';
  else if (key === 'ArrowDown') key = 'Down';
  else if (key === 'ArrowLeft') key = 'Left';
  else if (key === 'ArrowRight') key = 'Right';
  else if (key.length === 1) key = key.toUpperCase();

  parts.push(key);

  // Must have at least one modifier
  if (parts.length < 2) {
    return null;
  }

  return parts.join('+');
}

// Setup hotkey recording for an input
function setupHotkeyInput(input, onSave) {
  input.addEventListener('focus', () => {
    input.classList.add('recording');
    input.value = 'Press keys...';
  });

  input.addEventListener('blur', () => {
    input.classList.remove('recording');
    // Restore previous value if not set
    if (input.value === 'Press keys...') {
      input.value = input.dataset.previousValue || '';
    }
  });

  input.addEventListener('keydown', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') {
      input.value = input.dataset.previousValue || '';
      input.blur();
      return;
    }

    const accelerator = keyEventToAccelerator(e);
    if (accelerator) {
      input.value = accelerator;
      input.dataset.previousValue = accelerator;
      input.classList.remove('recording');
      input.blur();
      await onSave(accelerator);
    }
  });

  // Store initial value
  input.dataset.previousValue = input.value;
}

// Setup pause-all hotkey input
const pauseAllHotkeyInput = document.getElementById('pause-all-hotkey');
setupHotkeyInput(pauseAllHotkeyInput, async (hotkey) => {
  const settings = await window.timerAPI.getSettings();
  await window.timerAPI.updateSettings({
    hotkeys: { ...settings.hotkeys, pauseAll: hotkey }
  });
});

document.getElementById('pause-all-clear').addEventListener('click', async () => {
  pauseAllHotkeyInput.value = '';
  pauseAllHotkeyInput.dataset.previousValue = '';
  const settings = await window.timerAPI.getSettings();
  await window.timerAPI.updateSettings({
    hotkeys: { ...settings.hotkeys, pauseAll: '' }
  });
});

// Settings change handlers
document.getElementById('pause-others').addEventListener('change', async (e) => {
  try {
    await window.timerAPI.updateSettings({ pauseOthersOnStart: e.target.checked });
  } catch (err) {
    console.error('Failed to update setting:', err);
  }
});

document.getElementById('play-sounds').addEventListener('change', async (e) => {
  try {
    await window.timerAPI.updateSettings({ playSounds: e.target.checked });
  } catch (err) {
    console.error('Failed to update setting:', err);
  }
});

document.getElementById('use-task-number-tray').addEventListener('change', async (e) => {
  try {
    await window.timerAPI.updateSettings({ useTaskNumberAsTrayIcon: e.target.checked });
  } catch (err) {
    console.error('Failed to update setting:', err);
  }
});

document.getElementById('day-start').addEventListener('change', async (e) => {
  try {
    const [hour, minute] = e.target.value.split(':').map(Number);
    await window.timerAPI.updateSettings({ dayStartHour: hour, dayStartMinute: minute });
  } catch (err) {
    console.error('Failed to update setting:', err);
  }
});

// Event log path handlers
document.getElementById('change-path-btn').addEventListener('click', async () => {
  try {
    const result = await window.timerAPI.setEventsPath();
    if (result.success) {
      document.getElementById('events-path').textContent = result.path;
    }
  } catch (err) {
    console.error('Failed to change events path:', err);
  }
});

document.getElementById('reset-path-btn').addEventListener('click', async () => {
  try {
    const result = await window.timerAPI.resetEventsPath();
    if (result.success) {
      document.getElementById('events-path').textContent = result.path;
    }
  } catch (err) {
    console.error('Failed to reset events path:', err);
  }
});

// Export/Import handlers
document.getElementById('export-btn').addEventListener('click', async () => {
  try {
    const result = await window.timerAPI.exportData();
    if (result.success) {
      console.log('Export successful:', result.filePath);
    } else if (result.error) {
      console.error('Export failed:', result.error);
    }
  } catch (err) {
    console.error('Export failed:', err);
  }
});

document.getElementById('import-btn').addEventListener('click', async () => {
  try {
    const result = await window.timerAPI.importData();
    if (result.success) {
      console.log('Import successful:', result.eventsCount, 'events imported');
      // Refresh the UI
      await initSettings();
      const state = await window.timerAPI.getState();
      renderTimers(state.timers, state.runningTimer);
      updateMetrics(state);
      await renderTimeline();
    } else if (result.error) {
      console.error('Import failed:', result.error);
    }
  } catch (err) {
    console.error('Import failed:', err);
  }
});

// Exit button handler
document.getElementById('exit-btn').addEventListener('click', async () => {
  await window.timerAPI.quitApp();
});

// Listen for updates from main process
window.timerAPI.onTimerUpdate((data) => {
  // Stop current live update and reset timing
  stopLiveUpdate();

  renderTimers(data.timers, data.runningTimer);
  updateMetrics(data);
  renderTimeline();
});

// Initial load
async function init() {
  await initSettings();

  try {
    const state = await window.timerAPI.getState();
    renderTimers(state.timers, state.runningTimer);
    updateMetrics(state);
    await renderTimeline();
  } catch (err) {
    console.error('Failed to load timers:', err);
  }
}

init();
