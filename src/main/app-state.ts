import type { BrowserWindow, Tray } from 'electron'

// Shared mutable references, kept in a leaf module to avoid circular dependencies.

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

export function getMainWindow(): BrowserWindow | null { return mainWindow }
export function setMainWindow(w: BrowserWindow | null): void { mainWindow = w }

export function getTray(): Tray | null { return tray }
export function setTray(t: Tray | null): void { tray = t }

let pinned = false
export function isPinned(): boolean { return pinned }
export function setPinned(v: boolean): void { pinned = v }
