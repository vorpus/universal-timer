import type { TimerState, TimerInfo, TimelineSegment, TimelineData } from '../shared/types'
import { settings, getDisplayName } from './storage'
import { getProcessedEvents, getColorOrder } from './event-cache'
import {
  calculateOverlap,
  getDayStart,
  getDayEnd,
  getDaysFromMonday,
  sumIntervalsPerTimerForDay,
  computeTrend
} from './event-processing'
import type { ProcessedEvents } from './event-processing'

// ========================================
// Color Palette
// ========================================

const TIMER_COLORS: string[] = [
  '#4a9eff', // blue
  '#4ade80', // green
  '#f472b6', // pink
  '#fbbf24', // amber
  '#a78bfa', // purple
  '#22d3d3', // cyan
  '#fb923c', // orange
  '#f87171', // red
]

function getTimerColor(timerName: string, timerOrder: string[]): string {
  const index = timerOrder.indexOf(timerName)
  if (index === -1) return TIMER_COLORS[0]
  return TIMER_COLORS[index % TIMER_COLORS.length]
}

// ========================================
// Per-Timer Weekly Stats
// ========================================

function calculatePerTimerWeeklyStats(now: number, processed: ProcessedEvents): { weeklyTotals: Map<string, number>; weeklyTrends: Map<string, number> } {
  const today = getDayStart()
  const todayEnd = getDayEnd(today)
  const daysFromMonday = getDaysFromMonday(today)

  const todayTotals = sumIntervalsPerTimerForDay(processed, today.getTime(), todayEnd.getTime(), true, now)

  // Sum per-timer totals for Mon through today
  const weeklyTotals = new Map<string, number>()
  const previousDayTotals = new Map<string, number[]>()

  for (const [timer, ms] of todayTotals) {
    weeklyTotals.set(timer, ms)
  }

  for (let i = 1; i <= daysFromMonday; i++) {
    const dayStart = new Date(today)
    dayStart.setDate(dayStart.getDate() - i)
    const dayEnd = getDayEnd(dayStart)

    const dayTotals = sumIntervalsPerTimerForDay(processed, dayStart.getTime(), dayEnd.getTime(), false, now)
    for (const [timer, ms] of dayTotals) {
      weeklyTotals.set(timer, (weeklyTotals.get(timer) || 0) + ms)
      if (!previousDayTotals.has(timer)) {
        previousDayTotals.set(timer, [])
      }
      previousDayTotals.get(timer)!.push(ms)
    }
  }

  // Per-timer weekly trends
  const weeklyTrends = new Map<string, number>()
  for (const timer of new Set([...todayTotals.keys(), ...previousDayTotals.keys()])) {
    const todayMs = todayTotals.get(timer) || 0
    const prevDays = previousDayTotals.get(timer) || []
    weeklyTrends.set(timer, computeTrend(todayMs, prevDays, daysFromMonday))
  }

  return { weeklyTotals, weeklyTrends }
}

// ========================================
// Overall Weekly Trend
// ========================================

function calculateWeeklyTrend(totalToday: number, now: number, processed: ProcessedEvents): number {
  const today = getDayStart()
  const daysFromMonday = getDaysFromMonday(today)

  if (daysFromMonday === 0) return 0

  const previousDayTotals: number[] = []
  for (let i = 1; i <= daysFromMonday; i++) {
    const dayStart = new Date(today)
    dayStart.setDate(dayStart.getDate() - i)
    const dayEnd = getDayEnd(dayStart)

    let dayTotal = 0
    const perTimer = sumIntervalsPerTimerForDay(processed, dayStart.getTime(), dayEnd.getTime(), false, now)
    for (const ms of perTimer.values()) dayTotal += ms
    previousDayTotals.push(dayTotal)
  }

  return computeTrend(totalToday, previousDayTotals, daysFromMonday)
}

// ========================================
// Timer State Computation
// ========================================

export function computeTimerState(): TimerState {
  const now = Date.now()
  const todayStart = getDayStart().getTime()
  const todayEnd = getDayEnd(getDayStart()).getTime()

  const processed = getProcessedEvents()
  const { intervals: timerIntervals, activeTimers } = processed
  const colorOrder = getColorOrder()

  // Calculate elapsed today for each timer
  const timers: TimerInfo[] = []
  const allTimerNames = new Set([...timerIntervals.keys(), ...activeTimers.keys()])

  for (const timerName of allTimerNames) {
    let elapsedToday = 0
    const intervals = timerIntervals.get(timerName) || []

    for (const interval of intervals) {
      elapsedToday += calculateOverlap(interval.start, interval.end, todayStart, todayEnd)
    }

    if (activeTimers.has(timerName)) {
      elapsedToday += calculateOverlap(activeTimers.get(timerName)!, now, todayStart, todayEnd)
    }

    timers.push({
      name: timerName,
      displayName: getDisplayName(timerName, timerName),
      elapsedToday,
      isRunning: activeTimers.has(timerName)
    })
  }

  // Sort by custom order
  const sortOrder: string[] = settings.timerOrder || []
  timers.sort((a, b) => {
    const aIndex = sortOrder.indexOf(a.name)
    const bIndex = sortOrder.indexOf(b.name)

    if (aIndex === -1 && bIndex === -1) return b.elapsedToday - a.elapsedToday
    if (aIndex === -1) return -1
    if (bIndex === -1) return 1
    return aIndex - bIndex
  })

  const runningTimers = [...activeTimers.keys()]
  const totalToday = timers.reduce((sum, t) => sum + t.elapsedToday, 0)
  const weeklyTrend = calculateWeeklyTrend(totalToday, now, processed)

  // Per-timer weekly stats
  const { weeklyTotals, weeklyTrends } = calculatePerTimerWeeklyStats(now, processed)
  for (const timer of timers) {
    timer.weeklyTotal = weeklyTotals.get(timer.name) || 0
    timer.weeklyTrend = weeklyTrends.get(timer.name) || 0
  }

  const timerColors: Record<string, string> = Object.fromEntries(
    colorOrder.map((t, i) => [t, TIMER_COLORS[i % TIMER_COLORS.length]])
  )

  return { timers, runningTimers, totalToday, weeklyTrend, timerColors }
}

// ========================================
// Timeline Data
// ========================================

export function getTimelineForDate(dateTs?: number): TimelineData {
  const now = Date.now()
  const targetDate = dateTs != null ? new Date(dateTs) : new Date()
  const dayStartDate = getDayStart(targetDate)
  const todayStart = dayStartDate.getTime()
  const todayEnd = getDayEnd(dayStartDate).getTime()
  const isToday = dateTs == null || (todayStart <= now && now < todayEnd)

  const { intervals: timerIntervals, activeTimers } = getProcessedEvents()
  const timerOrder = getColorOrder()

  // Collect today's segments (clipped to day boundaries)
  const segments: TimelineSegment[] = []

  for (const [timerName, intervals] of timerIntervals) {
    for (const interval of intervals) {
      const overlap = calculateOverlap(interval.start, interval.end, todayStart, todayEnd)
      if (overlap > 0) {
        segments.push({
          timer: timerName,
          displayName: getDisplayName(timerName, timerName),
          start: Math.max(interval.start, todayStart),
          end: Math.min(interval.end, todayEnd),
          color: getTimerColor(timerName, timerOrder)
        })
      }
    }
  }

  // Add active timer segments up to now (only for today)
  if (isToday) {
    for (const [timerName, startTs] of activeTimers) {
      const overlap = calculateOverlap(startTs, now, todayStart, todayEnd)
      if (overlap > 0) {
        segments.push({
          timer: timerName,
          displayName: getDisplayName(timerName, timerName),
          start: Math.max(startTs, todayStart),
          end: Math.min(now, todayEnd),
          color: getTimerColor(timerName, timerOrder)
        })
      }
    }
  }

  segments.sort((a, b) => a.start - b.start)

  // Dynamic timeline boundaries
  let effectiveStart = todayStart
  if (segments.length > 0) {
    // Round down to nearest hour
    const firstStart = new Date(segments[0].start)
    firstStart.setMinutes(0, 0, 0)
    effectiveStart = firstStart.getTime()
  }

  let effectiveEnd = todayEnd
  if (segments.length > 0) {
    if (isToday) {
      const nextHour = new Date(now)
      nextHour.setMinutes(0, 0, 0)
      nextHour.setHours(nextHour.getHours() + 1)
      effectiveEnd = Math.min(nextHour.getTime(), todayEnd)
    } else {
      // For past dates, end at the hour after the last segment
      const lastEnd = segments[segments.length - 1].end
      const nextHour = new Date(lastEnd)
      nextHour.setMinutes(0, 0, 0)
      nextHour.setHours(nextHour.getHours() + 1)
      effectiveEnd = Math.min(nextHour.getTime(), todayEnd)
    }
  }

  if (effectiveEnd <= effectiveStart) {
    effectiveEnd = todayEnd
  }

  return {
    dayStart: effectiveStart,
    dayEnd: effectiveEnd,
    segments,
    timerColors: Object.fromEntries(timerOrder.map((t, i) => [t, TIMER_COLORS[i % TIMER_COLORS.length]]))
  }
}

export function getTodayTimeline(): TimelineData {
  return getTimelineForDate()
}

// ========================================
// Tray Icon Index
// ========================================

export function getTrayIconIndex(state: TimerState): number | null {
  if (state.runningTimers.length === 0) return null
  if (state.runningTimers.length > 1) return 0
  const index = state.timers.findIndex(t => t.name === state.runningTimers[0])
  return index !== -1 ? index + 1 : null
}
