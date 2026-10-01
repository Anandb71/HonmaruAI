import { describe, it, expect } from 'vitest'
import { tabWithin, TAB_STOPS } from './focusTrap'

describe('Tab inside a dialog', () => {
  const stops = ['close', 'first', 'last']
  it('goes to the next stop, and the one before with Shift', () => {
    expect(tabWithin(stops, 'close', false)).toBe('first')
    expect(tabWithin(stops, 'last', true)).toBe('first')
  })
  it('goes round past either end, never out', () => {
    expect(tabWithin(stops, 'last', false)).toBe('close')
    expect(tabWithin(stops, 'close', true)).toBe('last')
  })
  it('starts at the first, or the last with Shift, from the dialog itself or from outside it', () => {
    expect(tabWithin(stops, null, false)).toBe('close')
    expect(tabWithin(stops, undefined, true)).toBe('last')
    expect(tabWithin(stops, 'the composer behind', false)).toBe('close')
    expect(tabWithin(stops, 'the composer behind', true)).toBe('last')
  })
  it('stays on the only stop there is', () => {
    expect(tabWithin(['close'], 'close', false)).toBe('close')
    expect(tabWithin(['close'], 'close', true)).toBe('close')
  })
  it('has nowhere to go in a dialog with no stops', () => {
    expect(tabWithin([], null, false)).toBeNull()
    expect(tabWithin([], 'the composer behind', true)).toBeNull()
  })
  it('does not count what Tab skips', () => {
    expect(TAB_STOPS).toContain('button:not([disabled])')
    expect(TAB_STOPS).toContain('[tabindex]:not([tabindex="-1"])')
  })
})
