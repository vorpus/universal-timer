// Tab switching
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

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
  if (!timers || timers.length === 0) {
    timerList.innerHTML = `
      <div class="empty-state">
        <p>No timers yet</p>
        <p>Type a name above and press Enter to start</p>
      </div>
    `;
    return;
  }

  timerList.innerHTML = timers.map(timer => {
    const isRunning = runningTimer === timer.name;
    return `
      <div class="timer-item ${isRunning ? 'running' : ''}" data-timer="${timer.name}">
        <div class="timer-info">
          <div class="timer-name">${escapeHtml(timer.displayName || timer.name)}</div>
          <div class="timer-time">${formatTime(timer.elapsedToday)}</div>
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
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Update metrics display
function updateMetrics(data) {
  const totalTimeEl = document.getElementById('total-time');
  const weeklyTrendEl = document.getElementById('weekly-trend');

  if (data.totalToday !== undefined) {
    totalTimeEl.textContent = formatTime(data.totalToday);
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
  renderTimers(data.timers, data.runningTimer);
  updateMetrics(data);
});

// Initial load
async function init() {
  await initSettings();

  try {
    const timers = await window.timerAPI.getTimers();
    const runningTimer = await window.timerAPI.getRunningTimer();
    renderTimers(timers, runningTimer);
  } catch (err) {
    console.error('Failed to load timers:', err);
  }
}

init();
