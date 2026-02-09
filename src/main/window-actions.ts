import { app, Menu } from 'electron'

import { getTray, getMainWindow, isPinned, setPinned } from './app-state'

const DRAG_BAR_HEIGHT = 14
let contextMenu: Menu | null = null

export function adjustWindowForPin(pinned: boolean): void {
  const win = getMainWindow()
  if (!win || win.isDestroyed()) return
  const bounds = win.getBounds()
  if (pinned) {
    win.setBounds({
      x: bounds.x,
      y: bounds.y - DRAG_BAR_HEIGHT,
      width: bounds.width,
      height: bounds.height + DRAG_BAR_HEIGHT
    })
  } else {
    win.setBounds({
      x: bounds.x,
      y: bounds.y + DRAG_BAR_HEIGHT,
      width: bounds.width,
      height: bounds.height - DRAG_BAR_HEIGHT
    })
  }
}

export function rebuildContextMenu(): void {
  const pinned = isPinned()
  contextMenu = Menu.buildFromTemplate([
    {
      label: pinned ? 'Unpin Window' : 'Pin Window',
      click: () => {
        setPinned(!isPinned())
        adjustWindowForPin(isPinned())
        rebuildContextMenu()
        notifyPinState()
      }
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])
}

export function popUpContextMenu(): void {
  const tray = getTray()
  if (tray && contextMenu) {
    tray.popUpContextMenu(contextMenu)
  }
}

export function notifyPinState(): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send('window:pinUpdated', isPinned())
  }
}
