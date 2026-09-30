import { describe, it, expect } from 'vitest'
import { fullTime } from './ago'

describe('a message’s time in full', () => {
  it('names the weekday, the date with its year, and the time', () => {
    // Midday UTC: the same date in any time zone a runner is in.
    const out = fullTime('2026-10-01T12:00:00Z', 'en-US')
    expect(out).toMatch(/^Thursday, October 1, 2026/)
    expect(out).toMatch(/\d{1,2}:\d{2}/)
  })

  it('is written in the reader’s language', () => {
    expect(fullTime('2026-10-01T12:00:00Z', 'ja-JP')).toMatch(/2026年10月1日木曜日/)
  })

  it('says nothing for a time it cannot read', () => {
    expect(fullTime('')).toBe('')
    expect(fullTime('not a date')).toBe('')
  })
})
