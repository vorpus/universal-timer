// ========================================
// Timer Events (event-sourced log)
// ========================================

export interface StartEvent {
  event: 'start'
  ts: number
  timer: string
}

export interface PauseEvent {
  event: 'pause'
  ts: number
  timer: string
}

export interface PauseAllEvent {
  event: 'pause_all'
  ts: number
}

export type TimerEvent = StartEvent | PauseEvent | PauseAllEvent

// ========================================
// Settings
// ========================================

export interface HotkeySettings {
  pauseAll: string
  timers: Record<string, string>
}

export interface Settings {
  version: number
  pauseOthersOnStart: boolean
  playSounds: boolean
  dayStartHour: number
  dayStartMinute: number
  eventLogPath: string | null
  hotkeys: HotkeySettings
  timerIcons: Record<string, string>
  useTaskNumberAsTrayIcon: boolean
  showActiveTaskInTray: boolean
  showActiveTimeInTray: boolean
  timerOrder: string[]
  timerFriendlyNames: Record<string, string>
  deletedTimers?: string[]
}

// ========================================
// Timer State
// ========================================

export interface TimerInfo {
  name: string
  displayName: string
  elapsedToday: number
  isRunning: boolean
  weeklyTotal?: number
  weeklyTrend?: number
}

export interface TimerState {
  timers: TimerInfo[]
  runningTimers: string[]
  totalToday: number
  weeklyTrend: number
  timerColors: Record<string, string>
}

// ========================================
// Timeline
// ========================================

export interface TimelineSegment {
  timer: string
  displayName: string
  start: number
  end: number
  color: string
}

export interface TimelineData {
  dayStart: number
  dayEnd: number
  segments: TimelineSegment[]
  timerColors: Record<string, string>
}

// ========================================
// Operation Results
// ========================================

export interface OperationResult {
  success: boolean
  canceled?: boolean
  error?: string
  filePath?: string
  path?: string
  eventsCount?: number
}

export interface ExportData {
  version: number
  exportedAt: string
  settings: Settings
  events: TimerEvent[]
}

// ========================================
// App Error
// ========================================

export interface AppError {
  message: string
  details?: string | null
}

// ========================================
// IPC API (exposed via preload)
// ========================================

export interface TimerAPI {
  // Timer operations
  startTimer: (timerName: string) => Promise<TimerState>
  pauseTimer: (timerName: string) => Promise<TimerState>
  pauseAll: () => Promise<TimerState>
  renameTimer: (name: string, newName: string) => Promise<TimerState>
  deleteTimer: (name: string) => Promise<TimerState>

  // Get timer state
  getTimers: () => Promise<TimerInfo[]>
  getRunningTimer: () => Promise<string | null>
  getState: () => Promise<TimerState>
  getTimeline: (dateTs?: number) => Promise<TimelineData>

  // Settings
  getSettings: () => Promise<Settings>
  updateSettings: (settings: Partial<Settings>) => Promise<Settings>
  updateTimerOrder: (order: string[]) => Promise<Settings>

  // Data export/import
  exportData: () => Promise<OperationResult>
  importData: () => Promise<OperationResult>
  getEventsPath: () => Promise<string>
  setEventsPath: () => Promise<OperationResult>
  resetEventsPath: () => Promise<OperationResult>

  // Platform info
  platform: string

  // App control
  quitApp: () => Promise<void>

  // Event listeners
  onTimerUpdate: (callback: (data: TimerState) => void) => void
  onSettingsUpdate: (callback: (data: Settings) => void) => void
  onError: (callback: (data: AppError) => void) => void

  // Window pin
  togglePin: () => Promise<boolean>
  getPinned: () => Promise<boolean>
  onPinUpdate: (callback: (pinned: boolean) => void) => void
  removePinListener: () => void

  // Remove listeners
  removeTimerListener: () => void
  removeSettingsListener: () => void
  removeErrorListener: () => void
}

// Augment the Window interface for renderer
declare global {
  interface Window {
    timerAPI: TimerAPI
  }
}
