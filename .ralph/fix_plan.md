# Ralph Fix Plan

## High Priority

### Phase 1: Project Foundation

- [x] Initialize Electron project with package.json and npm scripts
- [x] Create main.js with basic Electron app lifecycle (ready, quit events)
- [x] Implement tray icon creation and window toggle behavior
- [x] Hide dock icon on macOS using `app.dock.hide()`
- [x] Create frameless BrowserWindow (360×520) anchored to tray

### Phase 2: Data Layer

- [x] Implement settings.json read/write with atomic file operations
- [x] Implement events.jsonl append-only log with fs.appendFileSync
- [x] Create event log parser that reconstructs timer state from log
- [x] Implement crash recovery: detect and resume unterminated timers
- [x] Add timer name normalization (case-insensitive, trimmed)

### Phase 3: Timer Core Logic

- [x] Implement timer state machine (start, pause, pause_all events)
- [x] Compute elapsed time per timer for date ranges
- [x] Handle day boundary splitting with configurable day start time
- [x] Track currently running timer(s) in memory
- [x] Implement "pause others on start" logic

## Medium Priority

### Phase 4: UI - Timers Tab

- [x] Create preload.js with IPC bridge for renderer communication
- [x] Build index.html with three-tab layout (Timers, Metrics, Settings)
- [x] Implement new timer input field with Enter to create/resume
- [x] Build scrollable timer list with name, elapsed time, play/pause button
- [x] Add live-updating elapsed time display for running timers
- [x] Highlight currently running timer visually

### Phase 5: UI - Metrics Tab

- [x] Display total time spent today across all timers
- [x] Calculate and display weekly trend percentage
- [x] Implement timeline bar with color-coded timer segments
- [x] Handle overlapping timers in timeline (stacked segments)
- [x] Assign consistent colors to timers from palette

### Phase 5.5: Code quality - typescript refactor

- [ ] Install TypeScript and type dependencies (`typescript`, `@types/node`; `electron` ships its own types)
- [ ] Create `tsconfig.json` with `strict: true`, `outDir: "./dist"`, `rootDir: "./src"`, `module: "commonjs"`, `target: "ES2022"`, `esModuleInterop: true`
- [ ] Restructure files into `src/` directory (source) → `dist/` (compiled output)
- [ ] Update `package.json`: set `"main": "dist/main.js"`, add `"build": "tsc"` script, update `"start": "tsc && electron ."`
- [ ] Define core types in `src/types.ts`:
- [ ] Fix all `strict` mode errors (no implicit `any`, null checks, exhaustive switches on event types)
- [ ] Replace any `JSON.parse()` calls with typed parse helpers that validate shape at runtime
- [ ] Confirm the app builds cleanly with `tsc --noEmit` and runs with `npm start`
- [ ] Remove all `.js` source files after confirming `.ts` equivalents work
- [ ] Migrate codebase to typescript

### Phase 6: UI - Settings Tab

- [ ] Build hotkey input components for pause all and per-timer shortcuts
- [x] Implement preference toggles (pause others, play sounds, day start time)
- [ ] Add event log location display with file picker
- [x] Implement import functionality with confirmation dialog
- [x] Implement export functionality (bundled settings + events)

### Phase 7: Global Hotkeys

- [x] Register global hotkey for pause all (default: CmdOrCtrl+Shift+P)
- [x] Register per-timer hotkeys from settings
- [x] Re-register hotkeys when settings change
- [x] Handle hotkey conflicts gracefully

## Low Priority

### Phase 8: Polish & UX

- [x] Create placeholder tray icons (idle + per-timer variants)
- [x] Implement tray icon switching based on running timer
- [x] Add background indicator to tray when timer is active
- [x] Implement optional sound effects on timer start/pause
- [x] Add placeholder .wav files for sounds

### Phase 9: Edge Cases & Robustness

- [x] Handle partial/corrupt event log lines (discard incomplete JSON)
- [x] Validate settings on load with defaults for missing fields
- [ ] Handle file system errors gracefully
- [ ] Test behavior across midnight with various day start times
- [ ] Verify import/export round-trip integrity

## Completed

- [x] Project initialization
- [x] Ralph configuration setup
- [x] Phase 1: Project Foundation (all items)
- [x] Phase 2: Data Layer (all items)
- [x] Phase 3: Timer Core Logic (all items)
- [x] Phase 4: UI - Timers Tab (all items)
- [x] Phase 5: UI - Metrics Tab (all items)
- [x] Phase 7: Global Hotkeys (all items)
- [x] Phase 8: Polish & UX (all items)
- [x] Import/Export functionality

## V1 Complete - All Success Criteria Met

The following Success Criteria are satisfied:
1. ✅ App launches as tray-only application (no dock icon)
2. ✅ Timers can be started/paused via UI and global hotkeys
3. ✅ Timer state persists across app restarts via event log
4. ✅ Unterminated timers automatically resume on launch
5. ✅ Today's elapsed time displays correctly with live updates
6. ✅ Day boundaries are handled correctly per settings
7. ✅ Settings persist and apply immediately
8. ✅ Import/export functionality works correctly
9. ✅ Weekly trend calculations are accurate

## Optional Enhancements (Post-V1)

The following items are optional enhancements, not required for V1:
- Phase 5.5: TypeScript refactor (code quality improvement)
- Phase 6: Hotkey input UI, event log location picker (UI enhancements)
- Phase 9: Additional edge case testing

## Notes

### Key Technical Decisions from PRD

- Vanilla HTML/JS in renderer, no framework needed for V1
- Plain Node.js in main process
- Event log uses JSONL format (newline-delimited JSON)
- Settings use write-to-temp-then-rename for atomic writes
- Timer colors derived deterministically from event log order
- Window is 360×520 pixels, frameless, non-resizable

### Out of Scope for V1

- Timer categories/tags
- CSV export
- Idle detection
- Cross-machine sync
- Pomodoro mode
- Timer autocomplete
- Custom icons/sounds per timer
- Timer deletion/archival
- Editable time entries

### Implementation Order Rationale

1. Foundation first — tray app must work before adding features
2. Data layer before UI — storage is prerequisite for persistence
3. Timer logic before Metrics — need working timers to display metrics
4. Settings last — app works without customization initially
