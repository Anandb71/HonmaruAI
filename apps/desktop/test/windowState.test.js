import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fitBounds, loadWindowState, saveWindowState, DEFAULT_SIZE, MIN_SIZE } from '../src/windowState.js'

describe('where the window opens', () => {
  const screens = [{ x: 0, y: 0, width: 1920, height: 1040 }]

  it('opens where it was, on a screen that is still there', () => {
    expect(fitBounds({ x: 100, y: 80, width: 1200, height: 800 }, screens)).toEqual({ x: 100, y: 80, width: 1200, height: 800 })
  })

  it('opens on the main screen when its screen is gone, keeping its size', () => {
    expect(fitBounds({ x: 2400, y: 80, width: 1200, height: 800 }, screens)).toEqual({ width: 1200, height: 800 })
  })

  it('opens on a second screen, including one left of or above the main one', () => {
    const two = [...screens, { x: -1280, y: -200, width: 1280, height: 1024 }]
    expect(fitBounds({ x: -1000, y: -100, width: 900, height: 700 }, two)).toEqual({ x: -1000, y: -100, width: 900, height: 700 })
    expect(fitBounds({ x: -1000, y: -100, width: 900, height: 700 }, screens)).toEqual({ width: 900, height: 700 })
  })

  it('needs the title bar on a screen with room to grab it, not just a corner', () => {
    // Only the last few pixels of the title bar would show at the right edge.
    expect(fitBounds({ x: 1900, y: 80, width: 800, height: 600 }, screens)).toEqual({ width: 800, height: 600 })
    // The title bar above the top of the screen.
    expect(fitBounds({ x: 100, y: -50, width: 800, height: 600 }, screens)).toEqual({ width: 800, height: 600 })
  })

  it('rounds fractional placements (scaled displays report them)', () => {
    expect(fitBounds({ x: 100.4, y: 80.6, width: 1200.5, height: 799.5 }, screens)).toEqual({ x: 100, y: 81, width: 1201, height: 800 })
  })

  it('keeps a saved size without a position, centered by Electron', () => {
    expect(fitBounds({ width: 1000, height: 700 }, screens)).toEqual({ width: 1000, height: 700 })
  })

  it('never opens smaller than it can be used, and falls back to the default', () => {
    expect(fitBounds({ x: 10, y: 10, width: 50, height: 50 }, screens)).toEqual({ x: 10, y: 10, width: MIN_SIZE.width, height: MIN_SIZE.height })
    expect(fitBounds(null, screens)).toEqual(DEFAULT_SIZE)
    expect(fitBounds({ width: 'big' }, screens)).toEqual(DEFAULT_SIZE)
    expect(fitBounds({ width: Infinity, height: 600 }, screens)).toEqual(DEFAULT_SIZE)
    expect(fitBounds({ x: 10, y: 10, width: 800, height: 600 }, [])).toEqual({ width: 800, height: 600 })
  })
})

describe('what is remembered', () => {
  let dir
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'honmaru-window-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('saves and loads the bounds and whether it was maximized', () => {
    const file = join(dir, 'window-state.json')
    saveWindowState(file, { bounds: { x: 1, y: 2, width: 900, height: 700 }, maximized: true })
    expect(loadWindowState(file)).toEqual({ bounds: { x: 1, y: 2, width: 900, height: 700 }, maximized: true })
  })

  it('creates the folder it saves into', () => {
    const file = join(dir, 'nested', 'deeper', 'window-state.json')
    saveWindowState(file, { bounds: { width: 900, height: 700 }, maximized: false })
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ bounds: { width: 900, height: 700 }, maximized: false })
  })

  it('saves only what it knows, with maximized as a boolean', () => {
    const file = join(dir, 'window-state.json')
    saveWindowState(file, { bounds: { width: 900, height: 700 }, maximized: 'yes', extra: 'x' })
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ bounds: { width: 900, height: 700 }, maximized: true })
  })

  it('starts fresh when there is no file, a broken one, or one of the wrong shape', () => {
    const fresh = { bounds: null, maximized: false }
    expect(loadWindowState(join(dir, 'missing.json'))).toEqual(fresh)
    const broken = join(dir, 'broken.json')
    writeFileSync(broken, '{ not json')
    expect(loadWindowState(broken)).toEqual(fresh)
    const odd = join(dir, 'odd.json')
    writeFileSync(odd, 'null')
    expect(loadWindowState(odd)).toEqual(fresh)
    writeFileSync(odd, JSON.stringify({ maximized: 'true' }))
    expect(loadWindowState(odd)).toEqual(fresh)
  })

  it('does not throw when it cannot save', () => {
    // A folder where the file should be: the write fails, quietly.
    const file = join(dir, 'taken')
    mkdirSync(file)
    expect(() => saveWindowState(file, { bounds: { width: 900, height: 700 }, maximized: false })).not.toThrow()
  })
})
