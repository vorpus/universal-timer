# Agent Build Instructions

## Project Setup

```bash
# Initialize project (if not already done)
npm init -y

# Install Electron as dev dependency
npm install electron --save-dev

# Verify package.json has correct structure
```

**package.json requirements**:
```json
{
  "name": "time-tracker",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "test": "npm run test:unit",
    "test:unit": "node --test test/*.test.js"
  },
  "devDependencies": {
    "electron": "^28.0.0"
  }
}
```

## Running the App

```bash
# Start the Electron app
npm start

# Or run directly
npx electron .
```

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
node --test test/timer-logic.test.js
```

## Project Structure

```
time-tracker/
├── package.json         # Project config and scripts
├── main.js              # Electron main process
├── preload.js           # IPC bridge (contextBridge)
├── index.html           # Renderer UI
├── renderer.js          # Renderer logic
├── assets/              # Icons and sounds
│   ├── tray-idle.png
│   ├── tray-task1.png
│   ├── tray-task2.png
│   ├── sound-start.wav
│   └── sound-pause.wav
├── test/                # Test files
│   ├── timer-logic.test.js
│   ├── event-log.test.js
│   └── settings.test.js
└── .ralph/              # Ralph config
    ├── PROMPT.md
    ├── AGENT.md
    ├── fix_plan.md
    └── specs/
        └── requirements.md
```

## Data File Locations

During development, data files are stored in Electron's userData path:
- **macOS**: `~/Library/Application Support/time-tracker/`
- **Windows**: `%APPDATA%/time-tracker/`
- **Linux**: `~/.config/time-tracker/`

Files:
- `events.jsonl` — Append-only event log
- `settings.json` — User settings

## Key Development Notes

### Electron Main Process (main.js)
- Handles tray icon and menu bar behavior
- Registers global hotkeys via `globalShortcut`
- Manages BrowserWindow lifecycle
- Performs all file I/O operations
- Implements timer logic

### Preload Script (preload.js)
- Uses `contextBridge.exposeInMainWorld()` to expose IPC methods
- Renderer communicates with main via exposed API

### Renderer Process (renderer.js)
- Vanilla JavaScript (no framework)
- Uses exposed API from preload for IPC
- Handles UI state and DOM updates

### Tray App Pattern
```javascript
// Hide dock icon on macOS
if (process.platform === 'darwin') {
  app.dock.hide();
}

// Create frameless window
const win = new BrowserWindow({
  width: 360,
  height: 520,
  show: false,
  frame: false,
  resizable: false,
  webPreferences: {
    preload: path.join(__dirname, 'preload.js')
  }
});

// Toggle window on tray click
tray.on('click', () => {
  win.isVisible() ? win.hide() : win.show();
});
```

## Key Learnings

### Electron Tips
- Use `app.dock.hide()` on macOS to hide dock icon
- Position window relative to tray bounds with `tray.getBounds()`
- Global shortcuts work even when app is not focused
- Use `contextBridge` for secure IPC between processes

### File I/O Tips
- Use `fs.appendFileSync()` for event log — atomic enough
- Use write-to-temp-then-rename for settings (prevents corruption)
- Parse JSONL line-by-line, discard incomplete lines

### Timer Logic Tips
- Track running state as `{ timerName: startTimestamp }`
- Day boundaries split at configured time, not midnight
- Resume unterminated timers on startup (crash recovery)

## Feature Development Quality Standards

**CRITICAL**: All new features MUST meet the following requirements:

### Testing Requirements
- Minimum 85% code coverage for new code
- All tests must pass (100% pass rate)
- Unit tests for timer logic and file operations
- Integration tests for IPC communication

### Git Workflow
- Commit with conventional commit messages: `feat:`, `fix:`, `test:`, etc.
- Push regularly to remote
- Update `.ralph/fix_plan.md` when tasks complete

### Documentation
- Keep this AGENT.md updated with new patterns
- Document any Electron-specific gotchas
- Update inline comments when implementation changes

### Feature Completion Checklist
- [ ] All tests pass
- [ ] Code coverage meets threshold
- [ ] Changes committed with clear messages
- [ ] .ralph/fix_plan.md task marked complete
- [ ] Documentation updated if needed
