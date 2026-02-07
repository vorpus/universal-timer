# Time Tracker — Product Requirements Document

## Overview

A lightweight menu bar time tracker for macOS (cross-platform via Electron). The user starts named timers with global hotkeys, and views elapsed time sliced by day, week, and month. Timer data is stored locally in an append-only event log. The app restores all state on launch — timers, settings, and running state persist across restarts.

## Goals

- Minimal friction: global hotkeys to start/pause timers without switching windows
- Robust time accounting: accurate to the second, handles day boundaries, crash recovery
- Configurable day boundaries: "new day" can start at 2 AM instead of midnight
- Simple reporting: view time per timer with weekly trend comparison
- Stays out of the way: lives in the macOS menu bar, no dock icon

---

## Architecture

### Platform: Electron

Electron provides global hotkey registration (`globalShortcut`), tray/menu bar integration, and cross-platform support with minimal setup. No framework needed initially — vanilla HTML/JS in the renderer, plain Node.js in the main process.

### Project Structure

```
time-tracker/
├── package.json
├── main.js              # Electron main process (tray, global hotkeys, timer logic)
├── preload.js           # Bridge between main and renderer
├── index.html           # Renderer (UI — tabs: Timers, Metrics, Settings)
├── renderer.js          # Renderer logic
├── assets/
│   ├── tray-idle.png    # Tray icon: no timer running
│   ├── tray-task1.png   # Tray icon: placeholder per-timer icons
│   ├── tray-task2.png
│   ├── sound-start.wav  # Placeholder sound: timer start/swap
│   └── sound-pause.wav  # Placeholder sound: timer pause
└── data/
    ├── events.jsonl     # Append-only event log
    └── settings.json    # User settings
```

### Setup

```bash
mkdir time-tracker && cd time-tracker
npm init -y
npm install electron --save-dev
```

`package.json` scripts:
```json
{
  "main": "main.js",
  "scripts": {
    "start": "electron ."
  }
}
```

---

## Menu Bar App Pattern

The app runs as a tray icon with no dock presence. Clicking the tray icon toggles a small window anchored to it.

**Main process setup:**
- Create `BrowserWindow` with `show: false`, `frame: false`, `resizable: false`, fixed small size (e.g. 360×520)
- Create `Tray` with a 16×16 or 22×22 icon
- On tray click: toggle window visibility, position window below tray icon
- Call `app.dock.hide()` on macOS to remove dock icon
- Alternatively, set `LSUIElement` to `true` in `Info.plist` via Electron's build config

### Tray Icon Behavior

The tray icon changes dynamically based on timer state:

- **No timer running:** `tray-idle.png` — default/dim appearance
- **Timer running:** icon swaps to a timer-specific icon (e.g. `tray-task1.png`). For V1, use numbered placeholder icons. Timer-to-icon mapping is stored in settings.
- **Background indicator:** when any timer is active, the tray icon gets a visible background highlight (colored dot, filled circle, or similar) so the user can tell at a glance whether they're tracking time. When all timers are paused, the background returns to normal/transparent.

---

## App Behavior

### Startup

On launch, the app:

1. Reads `settings.json` and applies all saved settings (hotkeys, preferences, log path, day start time)
2. Reads `events.jsonl` and reconstructs timer state
3. Rebuilds the timer list from all unique timer names seen in the log
4. If the last event is an unterminated `start` (no subsequent `pause`), resumes that timer — it continues running with the full elapsed interval counted. No prompt; the user can manually pause if the time is wrong.
5. Registers global hotkeys per settings
6. Computes today's elapsed time per timer and displays in the UI

The app is fully functional immediately — the user sees their timers, today's totals, and can start/pause without any setup.

---

## Tray Window UI

The tray window has three tabs: **Timers**, **Metrics**, **Settings**.

### Tab 1: Timers

This is the primary view.

**Layout (top to bottom):**

1. **New timer input** — text field at the top. Type a name and press Enter to start a new timer (or resume an existing one by name).

2. **Timer list** — scrollable list of all timers. Each row shows:
   - Timer name
   - Today's elapsed time (e.g. `2h 14m`) — ticking live if the timer is running
   - A **pause/play button**:
     - ▶ (play) if the timer is paused → clicking starts/resumes it
     - ⏸ (pause) if the timer is running → clicking pauses it

   The list is scrollable if there are more timers than fit in the viewport. The currently running timer should be visually distinct (highlighted row, bold text, or accent color).

**Timer interaction behavior:**

- Clicking ▶ on a paused timer:
  - If "pause others on start" is enabled (default): pauses the currently running timer first, then starts this one
  - If disabled: starts this timer without affecting others (multiple timers can run simultaneously)
- Clicking ⏸ on a running timer: pauses only that timer
- Starting a timer that already exists (by typing its name in the input): resumes it, does not reset today's time
- Creating a timer with a new name: adds it to the list and starts it

### Tab 2: Metrics

**Layout (top to bottom):**

1. **Time spent today** — total across all timers, displayed prominently (e.g. `6h 32m`)

2. **Weekly trend** — percentage above or below the weekly average, displayed as `+12% vs weekly avg` or `-8% vs weekly avg`.
   - "Weekly average" = average daily total across completed days in the current week (Mon–Sun), excluding today
   - If there is less than one full week of data, compute the average from all available completed days (minimum 1 day of historical data required)
   - If there is zero historical data (first day of use), show `—` or "No comparison data yet" instead of a percentage

3. **Timeline bar** — a horizontal bar representing the current day:
   - Left edge = day start time (from settings, e.g. 2:00 AM)
   - Right edge = day start time + 24 hours (i.e. next day's start)
   - Current time is indicated with a marker or the bar only fills up to "now"
   - Color-coded segments show which timer was active during each time slice
   - Each timer gets a consistent color (auto-assigned, wrapping through a palette)
   - If "pause others on start" is disabled and multiple timers overlap, their segments stack vertically so each timer's time is visually distinct (e.g. two thin bars instead of one thick bar during the overlap)
   - Gaps (no timer running) are shown as empty/gray

### Tab 3: Settings

All settings are persisted to `settings.json` and take effect immediately.

**Global Hotkeys section:**

- **Pause all timers** — hotkey input field (default: `CmdOrCtrl+Shift+P`). User clicks the field and presses their desired key combination.
- **Start specific timer** — a list of timer-to-hotkey mappings. Each row: timer name + hotkey input field. The user can assign a direct hotkey to any existing timer (e.g. `CmdOrCtrl+Shift+1` → "deep-work"). Pressing the hotkey starts/resumes that specific timer (pausing others if configured). Not all timers need a hotkey.

**Preferences section:**

- **Pause other timers when starting a new one** — checkbox (default: on). When enabled, starting any timer automatically pauses all other running timers. When disabled, multiple timers can run concurrently.
- **Play sounds on actions** — checkbox (default: off). When enabled, plays an audio cue on timer start/swap and timer pause. Uses placeholder `.wav` files.
- **New day start time** — time picker or hour input (default: `12:00 AM` / midnight). Defines when "today" begins for time accounting purposes. Setting this to `2:00 AM` means work done at 1:00 AM counts toward the previous calendar day. Affects: today's elapsed display, daily slicing in metrics, and the timeline bar range.

**Data section:**

- **Event log location** — file path input showing current path (default: `<userData>/events.jsonl`). User can browse to select a new location. Changing this moves the existing log file to the new location.
- **Import** — button. Opens a file picker for a `.json` file. The import file contains both settings and the event log. On import: settings are applied, and the event log is replaced with the imported log. Confirmation dialog before overwriting.
- **Export** — button. Opens a save dialog. Exports a single `.json` file containing the current `settings.json` and `events.jsonl` bundled together.

**Import/Export format:**
```json
{
  "version": 1,
  "exportedAt": 1738800000000,
  "settings": { ... },
  "events": [
    {"ts": 1738800000000, "event": "start", "timer": "deep-work"},
    ...
  ]
}
```

---

## Core Interactions

### F1: Global Hotkeys

Registered via Electron's `globalShortcut.register()` in the main process. These work regardless of which application is focused. Hotkeys are re-registered whenever settings change.

**Pause all (`CmdOrCtrl+Shift+P` default):**
1. A `pause_all` event is logged
2. All running timers stop; UI updates
3. Tray icon reverts to idle state (no background highlight)
4. If sounds enabled: play `sound-pause.wav`

**Start specific timer (user-configured per timer):**
1. If "pause others on start" is on and a different timer is running: log `pause` for that timer
2. Log `start` for the target timer
3. UI updates: target timer shows as running with today's accumulated time continuing
4. Tray icon swaps to that timer's icon; background highlight activates
5. If sounds enabled: play `sound-start.wav`

### F2: Timer State Machine

Each timer is in one of two states: **running** or **paused**.

```
        start           pause / pause_all
PAUSED ──────► RUNNING ──────────────────► PAUSED
  ▲                                          │
  └──────────────────────────────────────────┘
              (no explicit event needed;
               default state on creation)
```

A timer's "today time" is the sum of all completed intervals within the current day (per day start time setting) plus, if the timer is currently running, the live elapsed time since its last `start` event.

Resuming a timer does not reset its today total — it simply starts a new interval that will be added to the existing total.

---

## Data Model

### Storage: Append-Only Event Log

All timer state changes are recorded as newline-delimited JSON (JSONL) in a single file.

**Default file location:** `app.getPath('userData')/events.jsonl`. Configurable in settings.

**Event schema:**

```jsonl
{"ts": 1738800000000, "event": "start", "timer": "deep-work"}
{"ts": 1738800300000, "event": "pause", "timer": "deep-work"}
{"ts": 1738800300000, "event": "start", "timer": "meetings"}
{"ts": 1738801200000, "event": "pause_all"}
```

| Field | Type | Description |
|-------|------|-------------|
| `ts` | integer | Unix timestamp in milliseconds |
| `event` | string | One of: `start`, `pause`, `pause_all` |
| `timer` | string | Timer name (omitted for `pause_all`) |

### Settings File

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

**Location:** `app.getPath('userData')/settings.json`. Loaded on startup; saved on every change.

### Why an Append-Only Log

- **Simplicity**: No database, no migrations, no schema. Just `fs.appendFileSync()`.
- **Robustness**: Events are immutable. If the app crashes, the last event is still valid — worst case, you lose a few seconds of the current interval. On next launch, the app detects and resumes unterminated timers.
- **Queryability**: To compute elapsed time per timer for any time range, read the log and sum intervals. The log will remain small — even heavy use produces maybe 50–100 events/day, or ~36K events/year. Reading and processing the entire log takes milliseconds.
- **Auditability**: Full history of every state change. Easy to debug, export, or migrate.

### Computing Elapsed Time

To compute total time for a timer within a date range:

1. Parse the event log
2. Track state: which timer(s) are running, and since when
3. For each `start` event: record the timer name and start timestamp
4. For each `pause` or `pause_all` event: compute the interval from the last `start` to now
5. If an interval crosses a day boundary (using configured day start time, not midnight), split it at the boundary and attribute time to each day
6. Sum intervals per timer per day

**Day boundary:** a "day" starts at `dayStartHour:dayStartMinute` and ends 24 hours later. For example, with `dayStartHour: 2`, the day of "Monday" runs from Monday 2:00 AM to Tuesday 2:00 AM. An interval from Monday 1:00 AM to Monday 3:00 AM would split as: 1 hour attributed to Sunday, 1 hour attributed to Monday.

### Crash Recovery

On app launch, if the last event in the log is a `start` with no subsequent `pause`, the app resumes that timer automatically. The elapsed time since the `start` event is counted — the timer appears as if it was running the whole time. The user can manually pause and adjust if needed.

---

## Implementation Notes

### Timer Name Normalization

Timer names are case-insensitive and trimmed. `"Deep Work"` and `"deep work"` and `" Deep Work "` all map to the same timer. Store the normalized form (lowercase, trimmed) in the log but display the original casing from the first occurrence.

### File Writes

Use `fs.appendFileSync()` for event log writes — this is atomic enough for a single-user local app. Each event is one line, so partial writes are detectable (incomplete JSON line at end of file → discard it on read).

Settings are written with `fs.writeFileSync()` using a write-to-temp-then-rename pattern to avoid corruption.

### Timer Colors

For the timeline bar in the Metrics tab, each timer is assigned a color from a fixed palette (8–12 colors). Colors are assigned in order of first appearance in the event log and stored in memory (not persisted — deterministically derived from the log on each launch). If there are more timers than colors, the palette wraps.

### Sounds

Placeholder `.wav` files in `assets/`. Played via the Web Audio API in the renderer process, or via Electron's `shell.beep()` as a fallback. Sound playback respects the "play sounds" setting toggle.

### Future Considerations (Out of Scope for V1)

- Timer categories/tags
- Export to CSV
- Idle detection (pause timer after N minutes of inactivity)
- Syncing across machines
- Pomodoro mode
- Keyboard-driven timer name autocomplete from history
- Custom icons per timer (replace placeholders)
- Custom sounds per action
- Timer deletion / archival
- Editable time entries (correct mistakes by inserting synthetic events)
