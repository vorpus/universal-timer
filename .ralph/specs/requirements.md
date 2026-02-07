# Time Tracker — Technical Specifications

## Overview

A lightweight menu bar time tracker for macOS (cross-platform via Electron). Users start named timers with global hotkeys and view elapsed time sliced by day, week, and month. Timer data is stored locally in an append-only event log. The app restores all state on launch.

---

## System Architecture

### Platform: Electron

- **Main Process**: Node.js handling tray, global hotkeys, file I/O, timer logic
- **Renderer Process**: Vanilla HTML/JS for UI
- **Preload Script**: IPC bridge between main and renderer
- **No Framework**: Plain JavaScript for V1

### Process Communication

```
┌─────────────────┐     IPC      ┌─────────────────┐
│  Main Process   │◄────────────►│ Renderer Process│
│                 │              │                 │
│ - Tray          │  contextBridge│ - UI Tabs      │
│ - Global Hotkeys│              │ - Timer List    │
│ - File I/O      │              │ - Metrics       │
│ - Timer Logic   │              │ - Settings Form │
└─────────────────┘              └─────────────────┘
```

---

## File Structure

```
time-tracker/
├── package.json
├── main.js              # Electron main process
├── preload.js           # IPC bridge
├── index.html           # Renderer UI
├── renderer.js          # Renderer logic
├── assets/
│   ├── tray-idle.png    # Tray icon: no timer running (16x16 or 22x22)
│   ├── tray-task1.png   # Tray icon: timer 1 placeholder
│   ├── tray-task2.png   # Tray icon: timer 2 placeholder
│   ├── sound-start.wav  # Sound: timer start/swap
│   └── sound-pause.wav  # Sound: timer pause
└── data/                # Default location: app.getPath('userData')
    ├── events.jsonl     # Append-only event log
    └── settings.json    # User settings
```

---

## Data Models

### Event Log (events.jsonl)

Append-only JSONL file storing all timer state changes.

**Location**: `app.getPath('userData')/events.jsonl` (configurable)

**Event Schema**:

| Field   | Type    | Required | Description                            |
|---------|---------|----------|----------------------------------------|
| `ts`    | integer | Yes      | Unix timestamp in milliseconds         |
| `event` | string  | Yes      | One of: `start`, `pause`, `pause_all`  |
| `timer` | string  | Conditional | Timer name (required for start/pause, omitted for pause_all) |

**Examples**:
```jsonl
{"ts": 1738800000000, "event": "start", "timer": "deep-work"}
{"ts": 1738800300000, "event": "pause", "timer": "deep-work"}
{"ts": 1738800300000, "event": "start", "timer": "meetings"}
{"ts": 1738801200000, "event": "pause_all"}
```

**Write Strategy**: `fs.appendFileSync()` — atomic enough for single-user local app

**Read Strategy**: Parse line-by-line, discard incomplete JSON lines (crash recovery)

### Settings File (settings.json)

**Location**: `app.getPath('userData')/settings.json`

**Schema**:
```json
{
  "version": 1,
  "pauseOthersOnStart": true,
  "playSounds": false,
  "dayStartHour": 0,
  "dayStartMinute": 0,
  "eventLogPath": null,
  "hotkeys": {
    "pauseAll": "CmdOrCtrl+Shift+P",
    "timers": {
      "deep-work": "CmdOrCtrl+Shift+1",
      "meetings": "CmdOrCtrl+Shift+2"
    }
  },
  "timerIcons": {
    "deep-work": "tray-task1.png",
    "meetings": "tray-task2.png"
  }
}
```

**Write Strategy**: Write to temp file, then rename (atomic operation)

**Default Values**:
- `pauseOthersOnStart`: `true`
- `playSounds`: `false`
- `dayStartHour`: `0`
- `dayStartMinute`: `0`
- `eventLogPath`: `null` (use default userData path)
- `hotkeys.pauseAll`: `"CmdOrCtrl+Shift+P"`
- `hotkeys.timers`: `{}`
- `timerIcons`: `{}`

### Import/Export Format

Single JSON file bundling settings and events:

```json
{
  "version": 1,
  "exportedAt": 1738800000000,
  "settings": { /* settings.json contents */ },
  "events": [
    {"ts": 1738800000000, "event": "start", "timer": "deep-work"},
    /* ... all events ... */
  ]
}
```

---

## Timer System

### State Machine

```
        start           pause / pause_all
PAUSED ──────► RUNNING ──────────────────► PAUSED
  ▲                                          │
  └──────────────────────────────────────────┘
```

- Default state: PAUSED
- Only `start` event transitions to RUNNING
- `pause` or `pause_all` transitions to PAUSED

### Timer Name Normalization

- **Normalization**: lowercase, trimmed
- **Storage**: Store normalized form in event log
- **Display**: Show original casing from first occurrence
- **Comparison**: Case-insensitive matching

Example: `"Deep Work"`, `"deep work"`, `" Deep Work "` → all normalize to `"deep-work"` in storage

### Elapsed Time Computation

**Algorithm**:
1. Parse event log chronologically
2. Track running state per timer: `{ timerName: startTimestamp | null }`
3. On `start`: record `timers[name] = timestamp`
4. On `pause`: compute interval `timestamp - timers[name]`, reset to null
5. On `pause_all`: compute intervals for all running timers, reset all to null
6. For currently running timers: add `now - startTimestamp` to total

**Day Boundary Handling**:
- "Day" starts at `dayStartHour:dayStartMinute` and ends 24 hours later
- If interval crosses boundary, split into two intervals
- Attribute each portion to the correct day

**Example**: With `dayStartHour: 2`:
- Monday runs from Mon 2:00 AM to Tue 2:00 AM
- Interval from Mon 1:00 AM to Mon 3:00 AM splits as:
  - 1 hour → Sunday
  - 1 hour → Monday

### Crash Recovery

On startup:
1. Read event log
2. Find last event per timer
3. If last event is `start` with no subsequent `pause`:
   - Timer is considered still running
   - Resume with full elapsed time since `start` event
4. No user prompt — user can manually pause if time is incorrect

---

## User Interface

### Window Specifications

- **Type**: BrowserWindow
- **Size**: 360×520 pixels (fixed)
- **Frame**: `false` (frameless)
- **Resizable**: `false`
- **Initial State**: Hidden (`show: false`)
- **Position**: Anchored below tray icon

### Tray Behavior

- **Icon Size**: 16×16 or 22×22 pixels
- **Click Action**: Toggle window visibility
- **Dock**: Hidden on macOS via `app.dock.hide()`

**Icon States**:
| State | Icon | Background |
|-------|------|------------|
| No timer running | `tray-idle.png` | Normal/transparent |
| Timer running | Timer-specific icon | Highlighted (colored dot/filled circle) |

### Tab 1: Timers

**Layout** (top to bottom):

1. **New Timer Input**
   - Text field with placeholder "New timer..."
   - Enter key: creates new timer or resumes existing by name

2. **Timer List** (scrollable)
   - Each row displays:
     - Timer name
     - Today's elapsed time (`2h 14m` format)
     - Play/Pause button (▶/⏸)
   - Running timer: visually highlighted (accent color, bold)
   - Live-updating elapsed time for running timers

**Interactions**:
- Click ▶ on paused timer:
  - If `pauseOthersOnStart`: pause current running timer first
  - Start/resume clicked timer
- Click ⏸ on running timer: pause only that timer
- Type existing name in input: resume timer (no reset)
- Type new name in input: create and start new timer

### Tab 2: Metrics

**Layout** (top to bottom):

1. **Time Spent Today**
   - Prominent display: `6h 32m`
   - Sum across all timers

2. **Weekly Trend**
   - Format: `+12% vs weekly avg` or `-8% vs weekly avg`
   - Calculation:
     - Denominator: Average daily total for completed days in current week (Mon-Sun), excluding today
     - If < 1 week of data: use all available completed days
     - If no historical data: show `—` or "No comparison data yet"

3. **Timeline Bar**
   - Horizontal bar representing current day
   - Left edge: day start time
   - Right edge: day start + 24 hours
   - Current time marker
   - Color-coded segments per timer
   - Overlapping timers: stack vertically
   - Gaps: empty/gray

**Timer Colors**:
- Fixed palette of 8-12 colors
- Assigned in order of first appearance in event log
- Wraps if more timers than colors
- Computed on startup (not persisted)

### Tab 3: Settings

**Global Hotkeys Section**:
- Pause All Timers: hotkey input (default: `CmdOrCtrl+Shift+P`)
- Start Specific Timer: list of timer → hotkey mappings

**Preferences Section**:
- Pause other timers when starting: checkbox (default: on)
- Play sounds on actions: checkbox (default: off)
- New day start time: time picker (default: 12:00 AM)

**Data Section**:
- Event log location: file path display + browse button
- Import button: file picker for `.json`, confirmation dialog
- Export button: save dialog for `.json`

---

## Global Hotkeys

Registered via `globalShortcut.register()` in main process.

**Pause All** (default: `CmdOrCtrl+Shift+P`):
1. Log `pause_all` event
2. Stop all running timers
3. Update UI
4. Set tray icon to idle (no background)
5. Play `sound-pause.wav` if enabled

**Start Specific Timer** (user-configured):
1. If `pauseOthersOnStart` and another timer running: log `pause` for it
2. Log `start` for target timer
3. Update UI
4. Set tray icon to timer's icon with background
5. Play `sound-start.wav` if enabled

**Re-registration**:
- Unregister all hotkeys when settings change
- Re-register with new values

---

## Startup Sequence

1. Load `settings.json` (use defaults if missing/corrupt)
2. Load `events.jsonl` and parse all events
3. Build timer list from unique timer names in log
4. Detect unterminated `start` events → resume running
5. Register global hotkeys per settings
6. Compute today's elapsed time per timer
7. Create tray icon and hidden window
8. Ready for user interaction

---

## Performance Considerations

- Event log size: ~50-100 events/day, ~36K events/year
- Full log parsing: milliseconds for typical usage
- No need for indexing or database
- Settings file: small, infrequent writes

---

## Error Handling

### File Operations
- Event log: ignore incomplete last line (partial write from crash)
- Settings: use defaults for missing fields, reject invalid values
- Both: handle permission errors gracefully (show user message)

### Hotkey Conflicts
- If hotkey already registered by another app: log warning, skip
- Show user feedback for failed registrations

---

## Security Considerations

- All data stored locally in user's app data directory
- No network requests
- No sensitive data handling
- File paths validated before use
