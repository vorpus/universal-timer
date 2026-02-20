import type { TimerState, TimelineData } from '../../shared/types';
import { formatTime, formatDuration, formatCompactHour, escapeHtml } from './formatting';

// ========================================
// Timeline Date Navigation State
// ========================================

/** Offset in days from today (0 = today, -1 = yesterday, etc.) */
let timelineDateOffset = 0;

export function getTimelineDateOffset(): number {
  return timelineDateOffset;
}

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
    const timerColors = data.timerColors || {};
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
        const color = timerColors[timer.name] || '#888';
        return `
          <div class="per-timer-row">
            <span class="per-timer-color" style="background: ${color};"></span>
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
// Timeline Tooltip
// ========================================

let tooltipEl: HTMLElement | null = null;
let hideTimeout: ReturnType<typeof setTimeout> | null = null;
let currentTooltipSegment: { timer: string; start: number; end: number } | null = null;

function getTooltip(): HTMLElement {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'timeline-tooltip';
    document.body.appendChild(tooltipEl);

    tooltipEl.addEventListener('mouseenter', () => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
    });
    tooltipEl.addEventListener('mouseleave', () => {
      hideTooltip();
    });
  }
  return tooltipEl;
}

function showTooltip(segment: { timer: string; displayName: string; start: number; end: number }, segmentEl: HTMLElement): void {
  const tip = getTooltip();
  const durationMs = segment.end - segment.start;
  tip.innerHTML = `<strong>${escapeHtml(segment.displayName)}</strong><br>${formatDuration(durationMs)}<span class="tooltip-delete" title="Remove segment">\u00d7</span>`;
  tip.style.display = 'block';
  currentTooltipSegment = { timer: segment.timer, start: segment.start, end: segment.end };

  // Wire up delete button
  const deleteBtn = tip.querySelector('.tooltip-delete') as HTMLElement;
  if (deleteBtn) {
    deleteBtn.onclick = async (e) => {
      e.stopPropagation();
      if (currentTooltipSegment) {
        await window.timerAPI.deleteSegment(currentTooltipSegment.timer, currentTooltipSegment.start, currentTooltipSegment.end);
        hideTooltipImmediate();
        renderTimeline();
      }
    };
  }

  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }

  // Position above the segment at a fixed distance
  const segRect = segmentEl.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  let left = segRect.left + segRect.width / 2 - tipRect.width / 2;
  const top = segRect.top - tipRect.height - 8;

  // Keep within viewport
  if (left < 4) left = 4;
  if (left + tipRect.width > window.innerWidth - 4) left = window.innerWidth - tipRect.width - 4;

  tip.style.left = `${left}px`;
  tip.style.top = `${Math.max(4, top)}px`;
}

function scheduleHide(): void {
  if (hideTimeout) clearTimeout(hideTimeout);
  hideTimeout = setTimeout(() => {
    hideTooltipImmediate();
  }, 150);
}

function hideTooltip(): void {
  hideTooltipImmediate();
}

function hideTooltipImmediate(): void {
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
  if (tooltipEl) {
    tooltipEl.style.display = 'none';
  }
  currentTooltipSegment = null;
}

// ========================================
// Timeline Date Label
// ========================================

function getTimelineLabelText(): string {
  if (timelineDateOffset === 0) {
    return "Today's Timeline";
  }
  const date = new Date();
  date.setDate(date.getDate() + timelineDateOffset);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}/${day} Timeline`;
}

function getDateTimestamp(): number | undefined {
  if (timelineDateOffset === 0) return undefined;
  const date = new Date();
  date.setDate(date.getDate() + timelineDateOffset);
  return date.getTime();
}

// ========================================
// Timeline Rendering
// ========================================

export async function renderTimeline(): Promise<void> {
  const timelineBar = document.getElementById('timeline-bar') as HTMLElement;
  const timelineTimes = document.getElementById('timeline-times') as HTMLElement | null;
  const timelineLabel = document.getElementById('timeline-label') as HTMLElement | null;

  // Update label with navigation
  if (timelineLabel) {
    const labelText = getTimelineLabelText();
    const isToday = timelineDateOffset === 0;
    timelineLabel.innerHTML = `<span class="timeline-nav-btn timeline-nav-left" id="timeline-prev">&larr;</span><span class="timeline-label-text">${escapeHtml(labelText)}</span><span class="timeline-nav-btn timeline-nav-right" id="timeline-next"${isToday ? ' style="visibility:hidden"' : ''}>&rarr;</span><span class="timeline-nav-btn timeline-nav-today" id="timeline-today"${isToday ? ' style="visibility:hidden"' : ''}>&rArr;</span>`;

    // Attach click handlers
    const prevBtn = document.getElementById('timeline-prev');
    const nextBtn = document.getElementById('timeline-next');
    const todayBtn = document.getElementById('timeline-today');

    if (prevBtn) {
      prevBtn.onclick = () => {
        timelineDateOffset--;
        renderTimeline();
      };
    }
    if (nextBtn) {
      nextBtn.onclick = () => {
        if (timelineDateOffset < 0) {
          timelineDateOffset++;
          renderTimeline();
        }
      };
    }
    if (todayBtn) {
      todayBtn.onclick = () => {
        timelineDateOffset = 0;
        renderTimeline();
      };
    }
  }

  try {
    const dateTs = getDateTimestamp();
    const timeline: TimelineData = await window.timerAPI.getTimeline(dateTs);

    if (!timeline.segments || timeline.segments.length === 0) {
      timelineBar.innerHTML = '';
      if (timelineTimes) timelineTimes.innerHTML = '';
      const durationsEl = document.getElementById('timeline-durations');
      if (durationsEl) { durationsEl.className = ''; durationsEl.innerHTML = ''; }
      return;
    }

    const dayDuration = timeline.dayEnd - timeline.dayStart;
    const now = Date.now();
    const isToday = timelineDateOffset === 0;

    const segmentsHtml = timeline.segments.map((segment, i) => {
      const startPercent = ((segment.start - timeline.dayStart) / dayDuration) * 100;
      const widthPercent = ((segment.end - segment.start) / dayDuration) * 100;

      return `<div class="timeline-segment" data-segment-index="${i}" style="
        position: absolute;
        left: ${startPercent}%;
        width: ${widthPercent}%;
        background: ${segment.color};
      "></div>`;
    }).join('');

    let nowIndicator = '';
    if (isToday) {
      const currentDayProgress = Math.min(now - timeline.dayStart, dayDuration);
      const nowPercent = (currentDayProgress / dayDuration) * 100;
      nowIndicator = `<div style="
        position: absolute;
        left: ${nowPercent}%;
        width: 2px;
        height: 100%;
        background: rgba(255,255,255,0.5);
      "></div>`;
    }

    timelineBar.style.position = 'relative';
    timelineBar.innerHTML = segmentsHtml + nowIndicator;

    // Attach tooltip handlers to segments
    const segmentEls = timelineBar.querySelectorAll('.timeline-segment');
    segmentEls.forEach((el) => {
      const idx = parseInt((el as HTMLElement).dataset.segmentIndex || '0', 10);
      const segment = timeline.segments[idx];

      el.addEventListener('mouseenter', () => {
        showTooltip(segment, el as HTMLElement);
      });
      el.addEventListener('mouseleave', () => {
        scheduleHide();
      });
    });

    if (timelineTimes) {
      timelineTimes.innerHTML = `<span>${formatCompactHour(timeline.dayStart)}</span><span>${formatCompactHour(timeline.dayEnd)}</span>`;
    }

    // Render per-project durations below the timeline
    const durationsEl = document.getElementById('timeline-durations') as HTMLElement | null;
    if (durationsEl) {
      // Aggregate durations by timer
      const durationMap = new Map<string, { displayName: string; color: string; total: number }>();
      for (const segment of timeline.segments) {
        const existing = durationMap.get(segment.timer);
        const segDuration = segment.end - segment.start;
        if (existing) {
          existing.total += segDuration;
        } else {
          durationMap.set(segment.timer, {
            displayName: segment.displayName,
            color: segment.color,
            total: segDuration,
          });
        }
      }

      // Sort by total duration descending
      const sorted = [...durationMap.values()].sort((a, b) => b.total - a.total);

      durationsEl.className = 'timeline-durations';
      durationsEl.innerHTML = sorted.map(entry => `
        <div class="timeline-duration-row">
          <span class="timeline-duration-color" style="background: ${entry.color};"></span>
          <span class="timeline-duration-name">${escapeHtml(entry.displayName)}</span>
          <span class="timeline-duration-value">${formatDuration(entry.total)}</span>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Failed to render timeline:', err);
  }
}
