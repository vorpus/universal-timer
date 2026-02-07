import type { TimerEvent } from '../shared/types'
import { settings } from './storage'

// ========================================
// Event Interval Building (previously duplicated 4x)
// ========================================

export interface TimerInterval {
  start: number
  end: number
}

export interface ProcessedEvents {
  /** Completed intervals per timer (start/end pairs). */
  intervals: Map<string, TimerInterval[]>
  /** Timers that are still running (timer -> start timestamp). */
  activeTimers: Map<string, number>
}

/**
 * Process an event log into completed intervals and currently-active timers.
 * This logic was previously duplicated in calculateTotalForDay,
 * calculatePerTimerTotalsForDay, computeTimerState, and getTodayTimeline.
 */
export function buildTimerIntervals(events: TimerEvent[]): ProcessedEvents {
  const intervals = new Map<string, TimerInterval[]>()
  const activeTimers = new Map<string, number>()

  for (const event of events) {
    const ts = event.ts

    if (event.event === 'start') {
      activeTimers.set(event.timer, ts)
    } else if (event.event === 'pause') {
      if (activeTimers.has(event.timer)) {
        const startTs = activeTimers.get(event.timer)!
        pushInterval(intervals, event.timer, startTs, ts)
        activeTimers.delete(event.timer)
      }
    } else if (event.event === 'pause_all') {
      for (const [timer, startTs] of activeTimers) {
        pushInterval(intervals, timer, startTs, ts)
      }
      activeTimers.clear()
    }
  }

  return { intervals, activeTimers }
}

function pushInterval(map: Map<string, TimerInterval[]>, timer: string, start: number, end: number): void {
  if (!map.has(timer)) {
    map.set(timer, [])
  }
  map.get(timer)!.push({ start, end })
}

// ========================================
// Overlap Calculation (previously duplicated ~8x)
// ========================================

/** Calculate the overlapping duration between an interval and a range. */
export function calculateOverlap(start: number, end: number, rangeStart: number, rangeEnd: number): number {
  const overlapStart = Math.max(start, rangeStart)
  const overlapEnd = Math.min(end, rangeEnd)
  return overlapStart < overlapEnd ? overlapEnd - overlapStart : 0
}

// ========================================
// Day Boundary Calculations
// ========================================

export function getDayStart(date: Date = new Date()): Date {
  const dayStart = new Date(date)
  dayStart.setHours(settings.dayStartHour, settings.dayStartMinute, 0, 0)

  // If current time is before day start, go back to previous day's start
  if (date < dayStart) {
    dayStart.setDate(dayStart.getDate() - 1)
  }

  return dayStart
}

export function getDayEnd(dayStart: Date): Date {
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)
  return dayEnd
}

/** Days elapsed since Monday (0 on Monday, 6 on Sunday). */
export function getDaysFromMonday(date: Date = new Date()): number {
  const dayOfWeek = date.getDay()
  return dayOfWeek === 0 ? 6 : dayOfWeek - 1
}

// ========================================
// Per-timer Day Totals (single source of truth)
// ========================================

/**
 * Sum time per timer within a day range. Active timers contribute up to `now`.
 * Previously there were two nearly-identical functions: calculateTotalForDay
 * (aggregate) and calculatePerTimerTotalsForDay (per-timer). Now
 * calculateTotalForDay is just a sum over this result.
 */
export function sumIntervalsPerTimerForDay(
  processed: ProcessedEvents,
  dayStart: number,
  dayEnd: number,
  includeActive: boolean,
  now: number
): Map<string, number> {
  const perTimer = new Map<string, number>()

  for (const [timer, ivs] of processed.intervals) {
    let total = 0
    for (const iv of ivs) {
      total += calculateOverlap(iv.start, iv.end, dayStart, dayEnd)
    }
    if (total > 0) {
      perTimer.set(timer, total)
    }
  }

  if (includeActive) {
    for (const [timer, startTs] of processed.activeTimers) {
      const overlap = calculateOverlap(startTs, now, dayStart, dayEnd)
      if (overlap > 0) {
        perTimer.set(timer, (perTimer.get(timer) || 0) + overlap)
      }
    }
  }

  return perTimer
}

/** Aggregate total time across all timers for a day range. */
export function sumTotalForDay(
  processed: ProcessedEvents,
  dayStart: number,
  dayEnd: number,
  includeActive: boolean,
  now: number
): number {
  const perTimer = sumIntervalsPerTimerForDay(processed, dayStart, dayEnd, includeActive, now)
  let total = 0
  for (const ms of perTimer.values()) {
    total += ms
  }
  return total
}

// ========================================
// Weekly Trend Calculation (previously duplicated)
// ========================================

/** Compute trend percentage: today vs average of previous days this week. */
export function computeTrend(todayValue: number, previousDayValues: number[], daysFromMonday: number): number {
  if (daysFromMonday === 0) return 0
  if (previousDayValues.length === 0) return todayValue > 0 ? 100 : 0

  const prevAvg = previousDayValues.reduce((s, v) => s + v, 0) / daysFromMonday
  if (prevAvg === 0) return todayValue > 0 ? 100 : 0

  return Math.round(((todayValue - prevAvg) / prevAvg) * 100)
}
