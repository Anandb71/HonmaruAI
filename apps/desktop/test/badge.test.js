import { describe, it, expect } from 'vitest'
import { countFromTitle, trayTooltip, shouldAttract } from '../src/badge.js'

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
