// Where the window was, so it opens there again — unless that screen is
// gone (a laptop off its monitor), in which case it opens on the main one.
//
// Pure except for load/save, which take a path (test/windowState.test.js).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export const DEFAULT_SIZE = { width: 1280, height: 820 }
export const MIN_SIZE = { width: 480, height: 400 }

const isNumber = (n) => typeof n === 'number' && Number.isFinite(n)

/// The saved bounds if at least a usable corner of them is on a display
/// that is still there; otherwise the default size, centered by Electron.
export function fitBounds(saved, workAreas) {
  const fallback = { ...DEFAULT_SIZE }
  if (!saved || !isNumber(saved.width) || !isNumber(saved.height)) return fallback
  const width = Math.max(MIN_SIZE.width, Math.round(saved.width))
  const height = Math.max(MIN_SIZE.height, Math.round(saved.height))
  if (!isNumber(saved.x) || !isNumber(saved.y)) return { width, height }
  // The title bar's left end must be on a screen, with room to grab it.
  const grab = { x: saved.x + 40, y: saved.y + 10 }
  const onScreen = (workAreas || []).some((a) => grab.x >= a.x && grab.x <= a.x + a.width - 40 && grab.y >= a.y && grab.y <= a.y + a.height - 40)
  return onScreen ? { x: Math.round(saved.x), y: Math.round(saved.y), width, height } : { width, height }
}

export function loadWindowState(file) {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    return raw && typeof raw === 'object' ? { bounds: raw.bounds || null, maximized: raw.maximized === true } : { bounds: null, maximized: false }
  } catch {
    return { bounds: null, maximized: false }
  }
}

export function saveWindowState(file, state) {
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({ bounds: state.bounds, maximized: Boolean(state.maximized) }))
  } catch {
    // A window that opens at the default size next time is not worth a crash.
  }
}
