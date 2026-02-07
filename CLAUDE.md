# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Universal Timer is a macOS menu bar time-tracking app built with Electron (vanilla JS, no framework). Users start/pause named timers via global hotkeys or the tray window UI. Data is stored locally in an append-only event log.

## Commands

- **Run the app:** `npm start` (launches Electron)
- **Run tests:** `npm test` (uses Node's built-in test runner: `node --test test/*.test.js`)
- No build step, linter, or packaging configured.

## Architecture

**Electron main/renderer split with 4 source files:**

- `main.js` — Main process. Owns all timer state, tray icon, global hotkeys, IPC handlers, and file I/O. This is the source of truth for timer logic.
- `renderer.js` — Renderer process. UI logic for the 3-tab interface (Timers, Metrics, Settings). Communicates with main via IPC only.
- `preload.js` — Context bridge exposing `window.timerAPI` to renderer. All IPC calls go through here.
- `index.html` — Markup and embedded CSS for the tray window UI.

**Data flow:** Renderer calls `timerAPI.*` methods → preload forwards via `ipcRenderer.invoke` → main handles and responds. Main pushes updates to renderer via `webContents.send` events (`timer:updated`, `settings:updated`, `app:error`).

## Data Model

**Event-sourced architecture.** All state is derived from `events.jsonl` (append-only JSONL in `~/Library/Application Support/time-tracker/`). Events are `start`, `pause`, or `pause_all` with timestamps. State is reconstructed from the log on startup for crash recovery.

**Settings** are separate in `settings.json` (same directory). Loaded with deep merge over defaults.

## Key Conventions

- **Timer names are case-insensitive internally.** `normalizeTimerName()` lowercases for storage/lookup; `getDisplayName()` preserves original casing from first occurrence.
- **Multiple timer mode.** When `pauseOthersOnStart` is false, multiple timers can run simultaneously. `computeTimerState()` returns `runningTimers` (array of names) and each timer object has an `isRunning` boolean. The renderer tracks `currentRunningTimers` array and updates all running timers' displays in the live update interval. Tray icon uses generic recording icon when multiple timers are active.
- **Configurable day boundaries.** "Today" starts at `dayStartHour:dayStartMinute` (not necessarily midnight). All elapsed time calculations and timeline rendering respect this.
- **Tray icons** use numbered templates (`1Template.png` through `9Template.png`) in `assets/tray-icons/`. Icons are `Template` images for macOS dark/light mode support. `getTrayIconIndex()` helper determines the icon: `null` = paused, `1-9` = numbered, `0` or `>9` = generic recording.
- **Color palette** for timeline segments: 8 deterministic colors assigned by order of first appearance in the event log, cycling if >8 timers.
- **Per-timer weekly stats.** `computeTimerState()` attaches `weeklyTotal` (ms this week) and `weeklyTrend` (% vs avg of previous days this week) to each timer object. Metrics tab renders per-timer breakdown rows showing today's duration, weekly total, and trend. Live updates keep "today" values current for running timers.
- **Dynamic timeline boundaries.** `getTodayTimeline()` returns `dayStart` = earliest segment start (not day boundary) and `dayEnd` = current time rounded up to next hour (capped at day boundary). Compact time labels (e.g. "8a", "5p") are rendered below the timeline bar.
- **File writes:** `fs.appendFileSync` for events, write-to-temp-then-rename for settings.
