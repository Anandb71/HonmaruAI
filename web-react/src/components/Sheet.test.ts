import { describe, it, expect } from 'vitest'
import { inScroller } from './Sheet'

// An element, as far as the sheet's swipe looks at one.
const el = (scrollHeight: number, clientHeight: number, overflow: string, parent: Element | null = null) =>
  ({ scrollHeight, clientHeight, overflow, parentElement: parent }) as unknown as Element
const overflowOf = (e: Element) => (e as unknown as { overflow: string }).overflow

describe('a swipe down on a sheet', () => {
  const sheet = el(900, 600, 'auto')

  it('is the emoji list’s own when it starts in that list', () => {
    const picker = el(1800, 240, 'auto', sheet)
    const cell = el(36, 36, 'visible', el(1700, 1700, 'visible', picker))
    expect(inScroller(cell, sheet, overflowOf)).toBe(true)
    expect(inScroller(picker, sheet, overflowOf)).toBe(true)
  })

  it('closes the sheet from anywhere else: a row, a list shown whole, a clipped quote', () => {
    expect(inScroller(el(50, 50, 'visible', sheet), sheet, overflowOf)).toBe(false)
    expect(inScroller(el(20, 20, 'visible', el(200, 240, 'auto', sheet)), sheet, overflowOf)).toBe(false)
    expect(inScroller(el(300, 96, 'hidden', sheet), sheet, overflowOf)).toBe(false)
    expect(inScroller(sheet, sheet, overflowOf)).toBe(false)
    expect(inScroller(null, sheet, overflowOf)).toBe(false)
  })
})
