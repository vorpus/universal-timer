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

  timerList.innerHTML = timers.map(timer => {
    const isRunning = runningTimer === timer.name;
    return `
      <div class="timer-item ${isRunning ? 'running' : ''}" data-timer="${timer.name}">
        <div class="timer-info">
          <div class="timer-name">${escapeHtml(timer.displayName || timer.name)}</div>
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

// Initialize settings UI
async function initSettings() {
  try {
    const settings = await window.timerAPI.getSettings();
    if (settings) {
      document.getElementById('pause-others').checked = settings.pauseOthersOnStart ?? true;
      document.getElementById('play-sounds').checked = settings.playSounds ?? false;

      const hour = String(settings.dayStartHour ?? 0).padStart(2, '0');
      const minute = String(settings.dayStartMinute ?? 0).padStart(2, '0');
      document.getElementById('day-start').value = `${hour}:${minute}`;

      document.getElementById('pause-all-hotkey').textContent = settings.hotkeys?.pauseAll ?? 'CmdOrCtrl+Shift+P';
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

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

document.getElementById('day-start').addEventListener('change', async (e) => {
  try {
    const [hour, minute] = e.target.value.split(':').map(Number);
    await window.timerAPI.updateSettings({ dayStartHour: hour, dayStartMinute: minute });
  } catch (err) {
    console.error('Failed to update setting:', err);
  }
});

// Listen for updates from main process
window.timerAPI.onTimerUpdate((data) => {
  // Stop current live update and reset timing
  stopLiveUpdate();

  renderTimers(data.timers, data.runningTimer);
  updateMetrics(data);
});

// Initial load
async function init() {
  await initSettings();

  try {
    const state = await window.timerAPI.getState();
    renderTimers(state.timers, state.runningTimer);
    updateMetrics(state);
  } catch (err) {
    console.error('Failed to load timers:', err);
  }
}

init();
