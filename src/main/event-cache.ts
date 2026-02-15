import type { TimerEvent, TimerState } from '../shared/types'
import type { ProcessedEvents, TimerInterval } from './event-processing'
import { buildTimerIntervals, getDayStart } from './event-processing'
import { computeTimerState, getTrayIconIndex } from './timer-state'
import { loadEvents } from './storage'

// ========================================
// Tier 1 — In-memory event log
// ========================================

let cachedEvents: TimerEvent[] | null = null

export function getEvents(): TimerEvent[] {
  if (cachedEvents === null) {
    cachedEvents = loadEvents()
  }
  return cachedEvents
}

export function appendEventToCache(event: TimerEvent): void {
  const events = getEvents()
  events.push(event)
  incrementalIntervalUpdate(event)
  incrementalColorUpdate(event)
  cachedTimerState = null
  cachedTraySnapshot = null
}

export function replaceAllEvents(events: TimerEvent[]): void {
  cachedEvents = events
  cachedProcessed = null
  cachedColorOrder = null
  cachedTimerState = null
  cachedTraySnapshot = null
}

export function invalidateAll(): void {
  cachedEvents = null
  cachedProcessed = null
  cachedColorOrder = null
  cachedTimerState = null
  cachedTraySnapshot = null
}

export function invalidateDerived(): void {
  cachedTimerState = null
  cachedTraySnapshot = null
}

// ========================================
// Tier 2 — Cached intervals (incremental)
// ========================================

let cachedProcessed: ProcessedEvents | null = null

function ensureProcessed(): ProcessedEvents {
  if (cachedProcessed === null) {
    // Full rebuild from events (startup or after bulk op)
    cachedProcessed = buildTimerIntervals(getEvents())
  }
  return cachedProcessed
}

function pushInterval(map: Map<string, TimerInterval[]>, timer: string, start: number, end: number): void {
  if (!map.has(timer)) {
    map.set(timer, [])
  }
  map.get(timer)!.push({ start, end })
}

function incrementalIntervalUpdate(event: TimerEvent): void {
  if (cachedProcessed === null) return // will be built on next access

  const { intervals, activeTimers } = cachedProcessed

  if (event.event === 'start') {
    activeTimers.set(event.timer, event.ts)
  } else if (event.event === 'pause') {
    if (activeTimers.has(event.timer)) {
      const startTs = activeTimers.get(event.timer)!
      pushInterval(intervals, event.timer, startTs, event.ts)
      activeTimers.delete(event.timer)
    }
  } else if (event.event === 'pause_all') {
    for (const [timer, startTs] of activeTimers) {
      pushInterval(intervals, timer, startTs, event.ts)
    }
    activeTimers.clear()
  }
}

export function getProcessedEvents(): ProcessedEvents {
  return ensureProcessed()
}

// ========================================
// Tier 2 — Cached color order
// ========================================

let cachedColorOrder: string[] | null = null

function ensureColorOrder(): string[] {
  if (cachedColorOrder === null) {
    cachedColorOrder = []
    for (const event of getEvents()) {
      if (event.event === 'start' && !cachedColorOrder.includes(event.timer)) {
        cachedColorOrder.push(event.timer)
      }
    }
  }
  return cachedColorOrder
}

function incrementalColorUpdate(event: TimerEvent): void {
  if (cachedColorOrder === null) return // will be built on next access
  if (event.event === 'start' && !cachedColorOrder.includes(event.timer)) {
    cachedColorOrder.push(event.timer)
  }
}

export function getColorOrder(): string[] {
  return ensureColorOrder()
}

// ========================================
// Tier 2 — Cached TimerState
// ========================================

let cachedTimerState: TimerState | null = null
let cachedTimerStateTime: number = 0

export function getTimerState(): TimerState {
  if (cachedTimerState !== null) {
    // Check day-boundary staleness: if the cached state was computed in a
    // different "logical day" than now, invalidate it.
    const currentDayStart = getDayStart().getTime()
    const cachedDayStart = getDayStart(new Date(cachedTimerStateTime)).getTime()
    if (currentDayStart !== cachedDayStart) {
      cachedTimerState = null
    }
  }

  if (cachedTimerState === null) {
    cachedTimerState = computeTimerState()
    cachedTimerStateTime = Date.now()
    buildTraySnapshot(cachedTimerState)
  }
  return cachedTimerState
}

// ========================================
// Tier 2 — Lightweight running timers
// ========================================

export function getRunningTimers(): string[] {
  return [...getProcessedEvents().activeTimers.keys()]
}

// ========================================
// Tier 3 — Tray snapshot
// ========================================

export interface TraySnapshot {
  runningTimers: string[]
  primaryDisplayName: string
  primaryElapsedAtSnapshot: number
  snapshotTime: number
  trayIconIndex: number | null
}

let cachedTraySnapshot: TraySnapshot | null = null

function buildTraySnapshot(state: TimerState): void {
  let primaryDisplayName = ''
  let primaryElapsedAtSnapshot = 0

  if (state.runningTimers.length > 0) {
    const primaryTimer = state.runningTimers[0]
    const timerInfo = state.timers.find(t => t.name === primaryTimer)
    primaryDisplayName = timerInfo?.displayName ?? primaryTimer
    primaryElapsedAtSnapshot = timerInfo?.elapsedToday ?? 0
  }

  cachedTraySnapshot = {
    runningTimers: [...state.runningTimers],
    primaryDisplayName,
    primaryElapsedAtSnapshot,
    snapshotTime: Date.now(),
    trayIconIndex: getTrayIconIndex(state),
  }
}

export function getTraySnapshot(): TraySnapshot {
  if (cachedTraySnapshot === null) {
    getTimerState() // builds snapshot as side effect
  }
  return cachedTraySnapshot!
}
