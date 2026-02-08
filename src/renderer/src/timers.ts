import type { TimerInfo } from '../../shared/types';
import { formatTime, formatDuration, escapeHtml } from './formatting';
import { updateMetrics, updateTotalTimeDisplay } from './metrics';
import { updateTimerHotkeysIfNeeded } from './settings';

// ========================================
// Shared Renderer State
// ========================================

let currentTimers: TimerInfo[] = [];
let currentRunningTimers: string[] = [];

export function getCurrentTimers(): TimerInfo[] { return currentTimers; }
export function getCurrentRunningTimers(): string[] { return currentRunningTimers; }

// ========================================
// Timer Input Handling
// ========================================

const timerInput = document.getElementById('timer-input') as HTMLInputElement;
const timerList = document.getElementById('timer-list') as HTMLDivElement;
const addTimerBtn = document.getElementById('add-timer-btn') as HTMLButtonElement;
const addTimerWrapper = document.getElementById('add-timer-wrapper') as HTMLElement;

function expandAddTimer(): void {
  addTimerWrapper.classList.add('expanded');
  addTimerBtn.style.display = 'none';
  timerInput.focus();
}

function collapseAddTimer(): void {
  addTimerWrapper.classList.remove('expanded');
  addTimerBtn.style.display = 'flex';
  timerInput.value = '';
}

addTimerBtn.addEventListener('click', expandAddTimer);

timerInput.addEventListener('keydown', async (e: KeyboardEvent) => {
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

document.addEventListener('click', (e: MouseEvent) => {
  if (addTimerWrapper.classList.contains('expanded')) {
    const addTimerSection = document.querySelector('.add-timer-section');
    const isClickInsideSection = addTimerSection && addTimerSection.contains(e.target as Node);
    if (!isClickInsideSection) {
      collapseAddTimer();
    }
  }
});

// ========================================
// Context Menu
// ========================================

let contextMenuTimer: string | null = null;

function showContextMenu(x: number, y: number, timerName: string): void {
  const menu = document.getElementById('context-menu') as HTMLElement;
  contextMenuTimer = timerName;

  menu.style.display = 'block';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  const menuRect = menu.getBoundingClientRect();
  if (menuRect.right > window.innerWidth) {
    menu.style.left = `${window.innerWidth - menuRect.width - 4}px`;
  }
  if (menuRect.bottom > window.innerHeight) {
    menu.style.top = `${window.innerHeight - menuRect.height - 4}px`;
  }
}

function hideContextMenu(): void {
  const menu = document.getElementById('context-menu') as HTMLElement;
  menu.style.display = 'none';
  contextMenuTimer = null;
}

document.addEventListener('click', () => {
  hideContextMenu();
});

document.getElementById('context-menu-rename')!.addEventListener('click', () => {
  if (!contextMenuTimer) return;
  const timerName = contextMenuTimer;
  hideContextMenu();
  startInlineRename(timerName);
});

document.getElementById('context-menu-delete')!.addEventListener('click', async () => {
  if (!contextMenuTimer) return;
  const timerName = contextMenuTimer;
  hideContextMenu();
  try {
    await window.timerAPI.deleteTimer(timerName);
  } catch (err) {
    console.error('Failed to delete timer:', err);
  }
});

// ========================================
// Inline Rename
// ========================================

function startInlineRename(timerName: string): void {
  const timerItem = timerList.querySelector(`.timer-item[data-timer="${timerName}"]`) as HTMLElement | null;
  if (!timerItem) return;

  const nameEl = timerItem.querySelector('.timer-name') as HTMLElement;
  const orderBadge = nameEl.querySelector('.timer-order') as HTMLElement | null;
  const currentText = nameEl.textContent!.replace(orderBadge?.textContent || '', '').trim();

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

  function restoreName(): void {
    nameEl.classList.remove('renaming');
    nameEl.textContent = '';
    if (orderBadge) nameEl.appendChild(orderBadge);
    nameEl.appendChild(document.createTextNode(currentText));
  }

  let committed = false;
  async function commitRename(): Promise<void> {
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

  input.addEventListener('keydown', (e: KeyboardEvent) => {
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

// ========================================
// Drag and Drop
// ========================================

let draggedElement: HTMLElement | null = null;

function handleDragStart(e: DragEvent): void {
  draggedElement = (e.target as HTMLElement).closest('.timer-item') as HTMLElement;
  draggedElement.classList.add('dragging');
  e.dataTransfer!.effectAllowed = 'move';
  e.dataTransfer!.setData('text/plain', draggedElement.dataset.timer!);
}

function handleDragEnd(_e: DragEvent): void {
  if (draggedElement) {
    draggedElement.classList.remove('dragging');
  }
  timerList.querySelectorAll<HTMLElement>('.timer-item').forEach(item => {
    item.classList.remove('drag-over');
  });
  draggedElement = null;
}

function handleDragOver(e: DragEvent): void {
  e.preventDefault();
  e.dataTransfer!.dropEffect = 'move';
  const targetItem = (e.target as HTMLElement).closest('.timer-item') as HTMLElement | null;
  if (targetItem && targetItem !== draggedElement) {
    timerList.querySelectorAll<HTMLElement>('.timer-item').forEach(item => {
      item.classList.remove('drag-over');
    });
    targetItem.classList.add('drag-over');
  }
}

function handleDragLeave(e: DragEvent): void {
  const targetItem = (e.target as HTMLElement).closest('.timer-item') as HTMLElement | null;
  if (targetItem) {
    targetItem.classList.remove('drag-over');
  }
}

async function handleDrop(e: DragEvent): Promise<void> {
  e.preventDefault();
  const targetItem = (e.target as HTMLElement).closest('.timer-item') as HTMLElement | null;

  if (targetItem && draggedElement && targetItem !== draggedElement) {
    const items = [...timerList.querySelectorAll<HTMLElement>('.timer-item')];
    const draggedIndex = items.indexOf(draggedElement);
    const targetIndex = items.indexOf(targetItem);

    if (draggedIndex < targetIndex) {
      targetItem.parentNode!.insertBefore(draggedElement, targetItem.nextSibling);
    } else {
      targetItem.parentNode!.insertBefore(draggedElement, targetItem);
    }

    const newOrder = [...timerList.querySelectorAll<HTMLElement>('.timer-item')].map(item => item.dataset.timer!);
    try {
      await window.timerAPI.updateTimerOrder(newOrder);
    } catch (err) {
      console.error('Failed to save timer order:', err);
    }
  }

  timerList.querySelectorAll<HTMLElement>('.timer-item').forEach(item => {
    item.classList.remove('drag-over');
  });
}

// ========================================
// Live Update
// ========================================

let liveUpdateInterval: ReturnType<typeof setInterval> | null = null;
let liveUpdateStartTime: number | null = null;

function startLiveUpdate(): void {
  if (liveUpdateInterval) return;

  liveUpdateStartTime = Date.now();
  liveUpdateInterval = setInterval(() => {
    updateRunningTimerDisplay();
  }, 1000);
}

export function stopLiveUpdate(): void {
  if (liveUpdateInterval) {
    clearInterval(liveUpdateInterval);
    liveUpdateInterval = null;
    liveUpdateStartTime = null;
  }
}

function updateRunningTimerDisplay(): void {
  if (currentRunningTimers.length === 0 || !liveUpdateStartTime) return;

  const elapsed = Date.now() - liveUpdateStartTime;

  for (const timerName of currentRunningTimers) {
    const timerItem = timerList.querySelector(`.timer-item[data-timer="${timerName}"]`) as HTMLElement | null;
    if (timerItem) {
      const timeEl = timerItem.querySelector('.timer-time') as HTMLElement | null;
      if (timeEl) {
        const baseElapsed = parseInt(timeEl.dataset.baseElapsed!, 10) || 0;
        timeEl.textContent = formatTime(baseElapsed + elapsed);
      }
    }
  }

  // Update per-timer stats in metrics tab
  const perTimerStats = document.getElementById('per-timer-stats');
  if (perTimerStats) {
    for (const timerName of currentRunningTimers) {
      const todayEl = perTimerStats.querySelector(`.per-timer-today[data-timer="${timerName}"]`) as HTMLElement | null;
      if (todayEl) {
        const baseElapsed = parseInt(todayEl.dataset.baseElapsed!, 10) || 0;
        todayEl.textContent = formatDuration(baseElapsed + elapsed);
      }
    }
  }

  updateTotalTimeDisplay(elapsed, currentRunningTimers.length);
}

// ========================================
// Render Timer List
// ========================================

export function renderTimers(timers: TimerInfo[]): void {
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
        <span class="drag-handle">${escapeHtml('\u22EE\u22EE')}</span>
        <div class="timer-info">
          <div class="timer-name"><span class="timer-order">${orderNumber}</span>${escapeHtml(timer.displayName || timer.name)}</div>
          <div class="timer-time" data-base-elapsed="${timer.elapsedToday}">${formatTime(timer.elapsedToday)}</div>
        </div>
        <button class="timer-btn ${isRunning ? 'pause' : 'play'}" data-action="${isRunning ? 'pause' : 'play'}">
          ${isRunning ? '\u23F8' : '\u25B6'}
        </button>
      </div>
    `;
  }).join('');

  // Play/pause button handlers
  timerList.querySelectorAll<HTMLButtonElement>('.timer-btn').forEach(btn => {
    btn.addEventListener('click', async (e: MouseEvent) => {
      const timerItem = (e.target as HTMLElement).closest('.timer-item') as HTMLElement;
      const timerName = timerItem.dataset.timer!;
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

  // Drag-and-drop + context menu
  timerList.querySelectorAll<HTMLElement>('.timer-item').forEach(item => {
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragend', handleDragEnd);
    item.addEventListener('dragover', handleDragOver);
    item.addEventListener('dragleave', handleDragLeave);
    item.addEventListener('drop', handleDrop);
    item.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, item.dataset.timer!);
    });
  });

  if (currentRunningTimers.length > 0) {
    startLiveUpdate();
  } else {
    stopLiveUpdate();
  }

  updateTimerHotkeysIfNeeded();
}
