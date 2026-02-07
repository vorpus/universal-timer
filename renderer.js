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
let currentRunningTimers = [];
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
const addTimerBtn = document.getElementById('add-timer-btn');
const addTimerWrapper = document.getElementById('add-timer-wrapper');

// Expand/collapse add timer input
function expandAddTimer() {
  addTimerWrapper.classList.add('expanded');
  addTimerBtn.style.display = 'none';
  timerInput.focus();
}

function collapseAddTimer() {
  addTimerWrapper.classList.remove('expanded');
  addTimerBtn.style.display = 'flex';
  timerInput.value = '';
}

addTimerBtn.addEventListener('click', expandAddTimer);

timerInput.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') {
    const timerName = timerInput.value.trim();
    if (timerName) {
      try {
        await window.timerAPI.startTimer(timerName);
        timerInput.value = '';
        collapseAddTimer();
      } catch (err) {
        console.error('Failed to start timer:', err);
      }
    }
  } else if (e.key === 'Escape') {
    collapseAddTimer();
  }
});

// Close add timer on click outside
document.addEventListener('click', (e) => {
  if (addTimerWrapper.classList.contains('expanded')) {
    const addTimerSection = document.querySelector('.add-timer-section');
    const isClickInsideSection = addTimerSection && addTimerSection.contains(e.target);
    if (!isClickInsideSection) {
      collapseAddTimer();
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

// Format duration as compact string like "2h 30m" or "45m"
function formatDuration(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else {
    return `${minutes}m`;
  }
}

// Format timestamp as compact hour label like "8a", "12p", "5p"
function formatCompactHour(timestamp) {
  const date = new Date(timestamp);
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const suffix = hours >= 12 ? 'p' : 'a';
  if (hours === 0) hours = 12;
  else if (hours > 12) hours -= 12;

  if (minutes === 0) {
    return `${hours}${suffix}`;
  }
  return `${hours}:${String(minutes).padStart(2, '0')}${suffix}`;
}

// Context menu state
let contextMenuTimer = null;

function showContextMenu(x, y, timerName) {
  const menu = document.getElementById('context-menu');
  contextMenuTimer = timerName;

  menu.style.display = 'block';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  // Adjust if menu goes off right edge
  const menuRect = menu.getBoundingClientRect();
  if (menuRect.right > window.innerWidth) {
    menu.style.left = `${window.innerWidth - menuRect.width - 4}px`;
  }
  // Adjust if menu goes off bottom edge
  if (menuRect.bottom > window.innerHeight) {
    menu.style.top = `${window.innerHeight - menuRect.height - 4}px`;
  }
}

function hideContextMenu() {
  const menu = document.getElementById('context-menu');
  menu.style.display = 'none';
  contextMenuTimer = null;
}

// Hide context menu on any click
document.addEventListener('click', () => {
  hideContextMenu();
});

// Context menu actions
document.getElementById('context-menu-rename').addEventListener('click', () => {
  if (!contextMenuTimer) return;
  const timerName = contextMenuTimer;
  hideContextMenu();
  startInlineRename(timerName);
});

document.getElementById('context-menu-delete').addEventListener('click', async () => {
  if (!contextMenuTimer) return;
  const timerName = contextMenuTimer;
  hideContextMenu();
  try {
    await window.timerAPI.deleteTimer(timerName);
  } catch (err) {
    console.error('Failed to delete timer:', err);
  }
});

function startInlineRename(timerName) {
  const timerItem = timerList.querySelector(`.timer-item[data-timer="${timerName}"]`);
  if (!timerItem) return;

  const nameEl = timerItem.querySelector('.timer-name');
  const orderBadge = nameEl.querySelector('.timer-order');
  const currentText = nameEl.textContent.replace(orderBadge?.textContent || '', '').trim();

  // Override overflow so input is visible
  nameEl.classList.add('renaming');

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'timer-name-input';
  input.value = currentText;

  nameEl.textContent = '';
  if (orderBadge) nameEl.appendChild(orderBadge);
  nameEl.appendChild(input);
  input.focus();
  input.select();

  function restoreName() {
    nameEl.classList.remove('renaming');
    nameEl.textContent = '';
    if (orderBadge) nameEl.appendChild(orderBadge);
    nameEl.appendChild(document.createTextNode(currentText));
  }

  let committed = false;
  async function commitRename() {
    if (committed) return;
    committed = true;
    const newName = input.value.trim();
    if (newName && newName !== currentText) {
      try {
        await window.timerAPI.renameTimer(timerName, newName);
      } catch (err) {
        console.error('Failed to rename timer:', err);
        restoreName();
      }
    } else {
      restoreName();
    }
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      committed = true;
      restoreName();
      input.remove();
    }
  });

  input.addEventListener('blur', commitRename);
}

// Drag and drop state
let draggedElement = null;

// Render timer list
function renderTimers(timers) {
  // Store current state for live updates
  currentTimers = timers || [];
  currentRunningTimers = currentTimers.filter(t => t.isRunning).map(t => t.name);

  if (!timers || timers.length === 0) {
    timerList.innerHTML = `
      <div class="empty-state">
        <p>No timers yet</p>
        <p>Click "Add Timer" below to start</p>
      </div>
    `;
    stopLiveUpdate();
    return;
  }

  timerList.innerHTML = timers.map((timer, index) => {
    const isRunning = timer.isRunning;
    const orderNumber = index + 1;
    return `
      <div class="timer-item ${isRunning ? 'running' : ''}" data-timer="${timer.name}" draggable="true">
        <span class="drag-handle">⋮⋮</span>
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

  // Add drag and drop handlers + context menu
  timerList.querySelectorAll('.timer-item').forEach(item => {
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragend', handleDragEnd);
    item.addEventListener('dragover', handleDragOver);
    item.addEventListener('dragleave', handleDragLeave);
    item.addEventListener('drop', handleDrop);
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, item.dataset.timer);
    });
  });

  // Start or stop live update based on whether any timer is running
  if (currentRunningTimers.length > 0) {
    startLiveUpdate();
  } else {
    stopLiveUpdate();
  }

  // Update timer hotkeys in settings if visible
  updateTimerHotkeysIfNeeded();
}

// Drag and drop handlers
function handleDragStart(e) {
  draggedElement = e.target.closest('.timer-item');
  draggedElement.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedElement.dataset.timer);
}

function handleDragEnd(e) {
  if (draggedElement) {
    draggedElement.classList.remove('dragging');
  }
  timerList.querySelectorAll('.timer-item').forEach(item => {
    item.classList.remove('drag-over');
  });
  draggedElement = null;
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const targetItem = e.target.closest('.timer-item');
  if (targetItem && targetItem !== draggedElement) {
    timerList.querySelectorAll('.timer-item').forEach(item => {
      item.classList.remove('drag-over');
    });
    targetItem.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  const targetItem = e.target.closest('.timer-item');
  if (targetItem) {
    targetItem.classList.remove('drag-over');
  }
}

async function handleDrop(e) {
  e.preventDefault();
  const targetItem = e.target.closest('.timer-item');

  if (targetItem && draggedElement && targetItem !== draggedElement) {
    // Reorder in DOM
    const items = [...timerList.querySelectorAll('.timer-item')];
    const draggedIndex = items.indexOf(draggedElement);
    const targetIndex = items.indexOf(targetItem);

    if (draggedIndex < targetIndex) {
      targetItem.parentNode.insertBefore(draggedElement, targetItem.nextSibling);
    } else {
      targetItem.parentNode.insertBefore(draggedElement, targetItem);
    }

    // Extract new order and persist
    const newOrder = [...timerList.querySelectorAll('.timer-item')].map(item => item.dataset.timer);
    try {
      await window.timerAPI.updateTimerOrder(newOrder);
    } catch (err) {
      console.error('Failed to save timer order:', err);
    }
  }

  timerList.querySelectorAll('.timer-item').forEach(item => {
    item.classList.remove('drag-over');
  });
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
  if (currentRunningTimers.length === 0 || !liveUpdateStartTime) {
    return;
  }

  const elapsed = Date.now() - liveUpdateStartTime;

  // Update all running timer elements
  for (const timerName of currentRunningTimers) {
    const timerItem = timerList.querySelector(`.timer-item[data-timer="${timerName}"]`);
    if (timerItem) {
      const timeEl = timerItem.querySelector('.timer-time');
      if (timeEl) {
        const baseElapsed = parseInt(timeEl.dataset.baseElapsed, 10) || 0;
        timeEl.textContent = formatTime(baseElapsed + elapsed);
      }
    }
  }

  // Also update per-timer stats in metrics tab
  const perTimerStats = document.getElementById('per-timer-stats');
  if (perTimerStats) {
    for (const timerName of currentRunningTimers) {
      const todayEl = perTimerStats.querySelector(`.per-timer-today[data-timer="${timerName}"]`);
      if (todayEl) {
        const baseElapsed = parseInt(todayEl.dataset.baseElapsed, 10) || 0;
        todayEl.textContent = formatDuration(baseElapsed + elapsed);
      }
    }
  }

  // Also update the total time in metrics
  updateTotalTimeDisplay(elapsed);
}

function updateTotalTimeDisplay(additionalElapsed) {
  const totalTimeEl = document.getElementById('total-time');
  if (totalTimeEl && totalTimeEl.dataset.baseTotal !== undefined) {
    const baseTotal = parseInt(totalTimeEl.dataset.baseTotal, 10) || 0;
    // Each running timer contributes additionalElapsed to the total
    totalTimeEl.textContent = formatTime(baseTotal + additionalElapsed * currentRunningTimers.length);
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

  // Render per-timer stats
  const perTimerStats = document.getElementById('per-timer-stats');
  if (data.timers) {
    const relevant = data.timers.filter(t => t.elapsedToday > 0 || t.weeklyTotal > 0);
    if (relevant.length > 0) {
      perTimerStats.className = 'per-timer-stats';
      perTimerStats.innerHTML = relevant.map(timer => {
        let trendHtml = '';
        if (timer.weeklyTrend > 0) {
          trendHtml = `<span class="per-timer-trend up">+${timer.weeklyTrend}%</span>`;
        } else if (timer.weeklyTrend < 0) {
          trendHtml = `<span class="per-timer-trend down">${timer.weeklyTrend}%</span>`;
        } else {
          trendHtml = `<span class="per-timer-trend">0%</span>`;
        }
        return `
          <div class="per-timer-row">
            <span class="per-timer-name">${escapeHtml(timer.displayName || timer.name)}</span>
            <span class="per-timer-today" data-timer="${timer.name}" data-base-elapsed="${timer.elapsedToday}">${formatDuration(timer.elapsedToday)}</span>
            <span class="per-timer-weekly">${formatDuration(timer.weeklyTotal)} this wk</span>
            ${trendHtml}
          </div>
        `;
      }).join('');
    } else {
      perTimerStats.className = '';
      perTimerStats.innerHTML = '';
    }
  }
}

// Render timeline bar with color-coded segments
async function renderTimeline() {
  const timelineBar = document.getElementById('timeline-bar');

  const timelineTimes = document.getElementById('timeline-times');

  try {
    const timeline = await window.timerAPI.getTimeline();

    if (!timeline.segments || timeline.segments.length === 0) {
      timelineBar.innerHTML = '';
      if (timelineTimes) timelineTimes.innerHTML = '';
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

    // Render time labels
    if (timelineTimes) {
      timelineTimes.innerHTML = `<span>${formatCompactHour(timeline.dayStart)}</span><span>${formatCompactHour(timeline.dayEnd)}</span>`;
    }
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

      const pauseAllRaw = settings.hotkeys?.pauseAll ?? '';
      document.getElementById('pause-all-hotkey').value = formatHotkey(pauseAllRaw);
      document.getElementById('pause-all-hotkey').dataset.hotkey = pauseAllRaw;

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
          <input type="text" class="hotkey-input timer-hotkey-input" data-timer="${timer.name}" data-hotkey="${escapeHtml(hotkey)}" readonly placeholder="Click to set" value="${escapeHtml(formatHotkey(hotkey))}">
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
      if (input) {
        input.value = '';
        input.dataset.hotkey = '';
      }
      const settings = await window.timerAPI.getSettings();
      const timers = { ...(settings.hotkeys?.timers ?? {}) };
      delete timers[timerName];
      await window.timerAPI.updateSettings({ hotkeys: { ...settings.hotkeys, timers } });
    });
  });
}

// Format hotkey for display (⌘ on macOS, Ctrl+ on others)
function formatHotkey(accelerator) {
  if (!accelerator) return '';
  if (window.timerAPI.platform === 'darwin') {
    return accelerator.replace(/CmdOrCtrl\+/g, '⌘');
  }
  return accelerator.replace(/CmdOrCtrl\+/g, 'Ctrl+');
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
      input.value = formatHotkey(accelerator);
      input.dataset.previousValue = formatHotkey(accelerator);
      input.dataset.hotkey = accelerator;
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
  pauseAllHotkeyInput.dataset.hotkey = '';
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
      renderTimers(state.timers);
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

  renderTimers(data.timers);
  updateMetrics(data);
  renderTimeline();
});

// Initial load
async function init() {
  await initSettings();

  try {
    const state = await window.timerAPI.getState();
    renderTimers(state.timers);
    updateMetrics(state);
    await renderTimeline();
  } catch (err) {
    console.error('Failed to load timers:', err);
  }
}

init();
