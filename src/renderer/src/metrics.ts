import type { TimerState, TimelineData } from '../../shared/types';
import { formatTime, formatDuration, formatCompactHour, escapeHtml } from './formatting';

// ========================================
// Metrics Display
// ========================================

export function updateMetrics(data: TimerState): void {
  const totalTimeEl = document.getElementById('total-time') as HTMLElement;
  const weeklyTrendEl = document.getElementById('weekly-trend') as HTMLElement;

  if (data.totalToday !== undefined) {
    totalTimeEl.textContent = formatTime(data.totalToday);
    totalTimeEl.dataset.baseTotal = String(data.totalToday);
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

  // Per-timer stats
  const perTimerStats = document.getElementById('per-timer-stats') as HTMLElement;
  if (data.timers) {
    const relevant = data.timers.filter(t => t.elapsedToday > 0 || (t.weeklyTotal && t.weeklyTotal > 0));
    if (relevant.length > 0) {
      perTimerStats.className = 'per-timer-stats';
      perTimerStats.innerHTML = relevant.map(timer => {
        let trendHtml = '';
        if (timer.weeklyTrend && timer.weeklyTrend > 0) {
          trendHtml = `<span class="per-timer-trend up">+${timer.weeklyTrend}%</span>`;
        } else if (timer.weeklyTrend && timer.weeklyTrend < 0) {
          trendHtml = `<span class="per-timer-trend down">${timer.weeklyTrend}%</span>`;
        } else {
          trendHtml = `<span class="per-timer-trend">0%</span>`;
        }
        return `
          <div class="per-timer-row">
            <span class="per-timer-name">${escapeHtml(timer.displayName || timer.name)}</span>
            <span class="per-timer-today" data-timer="${timer.name}" data-base-elapsed="${timer.elapsedToday}">${formatDuration(timer.elapsedToday)}</span>
            <span class="per-timer-weekly">${formatDuration(timer.weeklyTotal || 0)} this wk</span>
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

// ========================================
// Total Time Live Update
// ========================================

export function updateTotalTimeDisplay(additionalElapsed: number, runningCount: number): void {
  const totalTimeEl = document.getElementById('total-time') as HTMLElement | null;
  if (totalTimeEl && totalTimeEl.dataset.baseTotal !== undefined) {
    const baseTotal = parseInt(totalTimeEl.dataset.baseTotal, 10) || 0;
    totalTimeEl.textContent = formatTime(baseTotal + additionalElapsed * runningCount);
  }
}

// ========================================
// Timeline Rendering
// ========================================

export async function renderTimeline(): Promise<void> {
  const timelineBar = document.getElementById('timeline-bar') as HTMLElement;
  const timelineTimes = document.getElementById('timeline-times') as HTMLElement | null;

  try {
    const timeline: TimelineData = await window.timerAPI.getTimeline();

    if (!timeline.segments || timeline.segments.length === 0) {
      timelineBar.innerHTML = '';
      if (timelineTimes) timelineTimes.innerHTML = '';
      return;
    }

    const dayDuration = timeline.dayEnd - timeline.dayStart;
    const now = Date.now();
    const currentDayProgress = Math.min(now - timeline.dayStart, dayDuration);

    const segmentsHtml = timeline.segments.map(segment => {
      const startPercent = ((segment.start - timeline.dayStart) / dayDuration) * 100;
      const widthPercent = ((segment.end - segment.start) / dayDuration) * 100;

      return `<div class="timeline-segment" style="
        position: absolute;
        left: ${startPercent}%;
        width: ${widthPercent}%;
        background: ${segment.color};
      " title="${escapeHtml(segment.displayName)}"></div>`;
    }).join('');

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

    if (timelineTimes) {
      timelineTimes.innerHTML = `<span>${formatCompactHour(timeline.dayStart)}</span><span>${formatCompactHour(timeline.dayEnd)}</span>`;
    }
  } catch (err) {
    console.error('Failed to render timeline:', err);
  }
}
