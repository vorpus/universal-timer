import './styles.css'

import type { TimerState, AppError } from '../../shared/types'
import { renderTimers, stopLiveUpdate } from './timers'
import { updateMetrics, renderTimeline } from './metrics'
import { initSettings, setupSettingsHandlers } from './settings'

// ========================================
// Toast Notifications
// ========================================

function showToast(message: string, duration: number = 5000): void {
  const container = document.getElementById('toast-container')!;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

window.timerAPI.onError((data: AppError) => {
  showToast(data.message);
});

// ========================================
// Pin Button
// ========================================

const pinBtn = document.getElementById('pin-btn')!;
const appContainer = document.querySelector('.container')!;

function updatePinButton(pinned: boolean): void {
  pinBtn.classList.toggle('active', pinned);
  appContainer.classList.toggle('pinned', pinned);
  pinBtn.title = pinned ? 'Unpin window' : 'Pin window';
}

pinBtn.addEventListener('click', async () => {
  const pinned = await window.timerAPI.togglePin();
  updatePinButton(pinned);
});

window.timerAPI.onPinUpdate((pinned: boolean) => {
  updatePinButton(pinned);
});

// ========================================
// Tab Switching
// ========================================

const tabs = document.querySelectorAll<HTMLElement>('.tab');
const tabContents = document.querySelectorAll<HTMLElement>('.tab-content');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.dataset.tab;

    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    tabContents.forEach(content => {
      content.classList.remove('active');
      if (content.id === `${targetTab}-tab`) {
        content.classList.add('active');
      }
    });
  });
});

// ========================================
// Main Process Event Listeners
// ========================================

window.timerAPI.onTimerUpdate((data: TimerState) => {
  stopLiveUpdate();
  renderTimers(data.timers);
  updateMetrics(data);
  renderTimeline();
});

// ========================================
// Initialization
// ========================================

setupSettingsHandlers();

async function init(): Promise<void> {
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
