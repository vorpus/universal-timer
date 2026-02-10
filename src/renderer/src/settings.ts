import type { Settings } from '../../shared/types';
import { escapeHtml } from './formatting';
import { getCurrentTimers, renderTimers } from './timers';
import { updateMetrics, renderTimeline } from './metrics';

// ========================================
// Hotkey Utilities
// ========================================

function formatHotkey(accelerator: string): string {
  if (!accelerator) return '';
  if (window.timerAPI.platform === 'darwin') {
    return accelerator.replace(/CmdOrCtrl\+/g, '\u2318');
  }
  return accelerator.replace(/CmdOrCtrl\+/g, 'Ctrl+');
}

function keyEventToAccelerator(e: KeyboardEvent): string | null {
  const parts: string[] = [];

  if (e.metaKey) parts.push('CmdOrCtrl');
  else if (e.ctrlKey) parts.push('CmdOrCtrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  let key = e.key;

  if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
    return null;
  }

  if (key === ' ') key = 'Space';
  else if (key === 'ArrowUp') key = 'Up';
  else if (key === 'ArrowDown') key = 'Down';
  else if (key === 'ArrowLeft') key = 'Left';
  else if (key === 'ArrowRight') key = 'Right';
  else if (key.length === 1) key = key.toUpperCase();

  parts.push(key);

  if (parts.length < 2) {
    return null;
  }

  return parts.join('+');
}

function setupHotkeyInput(input: HTMLInputElement, onSave: (hotkey: string) => Promise<void>): void {
  input.addEventListener('focus', () => {
    input.classList.add('recording');
    input.value = 'Press keys...';
  });

  input.addEventListener('blur', () => {
    input.classList.remove('recording');
    if (input.value === 'Press keys...') {
      input.value = input.dataset.previousValue || '';
    }
  });

  input.addEventListener('keydown', async (e: KeyboardEvent) => {
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

  input.dataset.previousValue = input.value;
}

// ========================================
// Per-Timer Hotkeys
// ========================================

export function renderTimerHotkeys(timerHotkeys: Record<string, string>): void {
  const container = document.getElementById('timer-hotkeys-container') as HTMLElement;
  const currentTimers = getCurrentTimers();
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

  container.querySelectorAll<HTMLInputElement>('.timer-hotkey-input').forEach(input => {
    setupHotkeyInput(input, async (hotkey: string) => {
      const timerName = input.dataset.timer!;
      const settings = await window.timerAPI.getSettings();
      const timers = { ...(settings.hotkeys?.timers ?? {}), [timerName]: hotkey };
      await window.timerAPI.updateSettings({ hotkeys: { ...settings.hotkeys, timers } });
    });
  });

  container.querySelectorAll<HTMLButtonElement>('.timer-hotkey-clear').forEach(btn => {
    btn.addEventListener('click', async () => {
      const timerName = btn.dataset.timer!;
      const input = container.querySelector(`.timer-hotkey-input[data-timer="${timerName}"]`) as HTMLInputElement | null;
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

export async function updateTimerHotkeysIfNeeded(): Promise<void> {
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

// ========================================
// Settings Initialization
// ========================================

export async function initSettings(): Promise<void> {
  try {
    const settings: Settings = await window.timerAPI.getSettings();
    if (settings) {
      (document.getElementById('pause-others') as HTMLInputElement).checked = settings.pauseOthersOnStart ?? true;
      (document.getElementById('play-sounds') as HTMLInputElement).checked = settings.playSounds ?? false;
      (document.getElementById('use-task-number-tray') as HTMLInputElement).checked = settings.useTaskNumberAsTrayIcon ?? true;
      (document.getElementById('show-active-task-tray') as HTMLInputElement).checked = settings.showActiveTaskInTray ?? false;
      (document.getElementById('show-active-time-tray') as HTMLInputElement).checked = settings.showActiveTimeInTray ?? false;

      const hour = String(settings.dayStartHour ?? 0).padStart(2, '0');
      const minute = String(settings.dayStartMinute ?? 0).padStart(2, '0');
      (document.getElementById('day-start') as HTMLInputElement).value = `${hour}:${minute}`;

      const pauseAllRaw = settings.hotkeys?.pauseAll ?? '';
      const pauseAllInput = document.getElementById('pause-all-hotkey') as HTMLInputElement;
      pauseAllInput.value = formatHotkey(pauseAllRaw);
      pauseAllInput.dataset.hotkey = pauseAllRaw;

      renderTimerHotkeys(settings.hotkeys?.timers ?? {});
    }

    const eventsPath = await window.timerAPI.getEventsPath();
    document.getElementById('events-path')!.textContent = eventsPath;
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

// ========================================
// Settings Event Handlers
// ========================================

export function setupSettingsHandlers(): void {
  // Pause-all hotkey
  const pauseAllHotkeyInput = document.getElementById('pause-all-hotkey') as HTMLInputElement;
  setupHotkeyInput(pauseAllHotkeyInput, async (hotkey: string) => {
    const settings = await window.timerAPI.getSettings();
    await window.timerAPI.updateSettings({
      hotkeys: { ...settings.hotkeys, pauseAll: hotkey }
    });
  });

  document.getElementById('pause-all-clear')!.addEventListener('click', async () => {
    pauseAllHotkeyInput.value = '';
    pauseAllHotkeyInput.dataset.previousValue = '';
    pauseAllHotkeyInput.dataset.hotkey = '';
    const settings = await window.timerAPI.getSettings();
    await window.timerAPI.updateSettings({
      hotkeys: { ...settings.hotkeys, pauseAll: '' }
    });
  });

  // Checkbox settings
  (document.getElementById('pause-others') as HTMLInputElement).addEventListener('change', async (e: Event) => {
    try {
      await window.timerAPI.updateSettings({ pauseOthersOnStart: (e.target as HTMLInputElement).checked });
    } catch (err) {
      console.error('Failed to update setting:', err);
    }
  });

  (document.getElementById('play-sounds') as HTMLInputElement).addEventListener('change', async (e: Event) => {
    try {
      await window.timerAPI.updateSettings({ playSounds: (e.target as HTMLInputElement).checked });
    } catch (err) {
      console.error('Failed to update setting:', err);
    }
  });

  (document.getElementById('use-task-number-tray') as HTMLInputElement).addEventListener('change', async (e: Event) => {
    try {
      await window.timerAPI.updateSettings({ useTaskNumberAsTrayIcon: (e.target as HTMLInputElement).checked });
    } catch (err) {
      console.error('Failed to update setting:', err);
    }
  });

  (document.getElementById('show-active-task-tray') as HTMLInputElement).addEventListener('change', async (e: Event) => {
    try {
      await window.timerAPI.updateSettings({ showActiveTaskInTray: (e.target as HTMLInputElement).checked });
    } catch (err) {
      console.error('Failed to update setting:', err);
    }
  });

  (document.getElementById('show-active-time-tray') as HTMLInputElement).addEventListener('change', async (e: Event) => {
    try {
      await window.timerAPI.updateSettings({ showActiveTimeInTray: (e.target as HTMLInputElement).checked });
    } catch (err) {
      console.error('Failed to update setting:', err);
    }
  });

  (document.getElementById('day-start') as HTMLInputElement).addEventListener('change', async (e: Event) => {
    try {
      const [hour, minute] = (e.target as HTMLInputElement).value.split(':').map(Number);
      await window.timerAPI.updateSettings({ dayStartHour: hour, dayStartMinute: minute });
    } catch (err) {
      console.error('Failed to update setting:', err);
    }
  });

  // Event log path handlers
  document.getElementById('change-path-btn')!.addEventListener('click', async () => {
    try {
      const result = await window.timerAPI.setEventsPath();
      if (result.success) {
        document.getElementById('events-path')!.textContent = result.path!;
      }
    } catch (err) {
      console.error('Failed to change events path:', err);
    }
  });

  document.getElementById('reset-path-btn')!.addEventListener('click', async () => {
    try {
      const result = await window.timerAPI.resetEventsPath();
      if (result.success) {
        document.getElementById('events-path')!.textContent = result.path!;
      }
    } catch (err) {
      console.error('Failed to reset events path:', err);
    }
  });

  // Export/Import handlers
  document.getElementById('export-btn')!.addEventListener('click', async () => {
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

  document.getElementById('import-btn')!.addEventListener('click', async () => {
    try {
      const result = await window.timerAPI.importData();
      if (result.success) {
        console.log('Import successful:', result.eventsCount, 'events imported');
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

  // Exit button
  document.getElementById('exit-btn')!.addEventListener('click', async () => {
    await window.timerAPI.quitApp();
  });
}
