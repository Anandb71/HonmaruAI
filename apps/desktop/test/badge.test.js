import { describe, it, expect } from 'vitest'
import { countFromTitle, trayTooltip, shouldAttract } from '../src/badge.js'
import { fitBounds, DEFAULT_SIZE, MIN_SIZE } from '../src/windowState.js'

describe('the count', () => {
  it('is read off the title the web app writes', () => {
    expect(countFromTitle('(3) Honmaru AI')).toBe(3)
    expect(countFromTitle('(120) Honmaru AI')).toBe(120)
    expect(countFromTitle('Honmaru AI')).toBe(0)
    expect(countFromTitle('Report (3) Honmaru AI')).toBe(0)
    expect(countFromTitle(undefined)).toBe(0)
  })

  it('reads in the tray, and draws the eye only when it goes up while the window is elsewhere', () => {
    expect(trayTooltip(0)).toBe('Honmaru AI')
    expect(trayTooltip(1)).toBe('Honmaru AI: 1 waiting')
    expect(trayTooltip(4)).toBe('Honmaru AI: 4 waiting')
    expect(shouldAttract(1, 2, false)).toBe(true)
    expect(shouldAttract(2, 2, false)).toBe(false)
    expect(shouldAttract(2, 1, false)).toBe(false)
    expect(shouldAttract(1, 2, true)).toBe(false)
  })
})

describe('where the window opens', () => {
  const screens = [{ x: 0, y: 0, width: 1920, height: 1040 }]

  it('opens where it was, on a screen that is still there', () => {
    expect(fitBounds({ x: 100, y: 80, width: 1200, height: 800 }, screens)).toEqual({ x: 100, y: 80, width: 1200, height: 800 })
  })

  it('opens on the main screen when its screen is gone, keeping its size', () => {
    expect(fitBounds({ x: 2400, y: 80, width: 1200, height: 800 }, screens)).toEqual({ width: 1200, height: 800 })
  })

  it('never opens smaller than it can be used, and falls back to the default', () => {
    expect(fitBounds({ x: 10, y: 10, width: 50, height: 50 }, screens)).toEqual({ x: 10, y: 10, width: MIN_SIZE.width, height: MIN_SIZE.height })
    expect(fitBounds(null, screens)).toEqual(DEFAULT_SIZE)
    expect(fitBounds({ width: 'big' }, screens)).toEqual(DEFAULT_SIZE)
  })
})
