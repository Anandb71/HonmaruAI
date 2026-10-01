import { describe, it, expect } from 'vitest'
import { fullTime } from './ago'

// Noon on 1 October 2026 where the runner is: a Thursday in every time
// zone — noon UTC is already the 2nd in Auckland.
const noon = new Date(2026, 9, 1, 12).toISOString()

describe('a message’s time in full', () => {
  it('names the weekday, the date with its year, and the time', () => {
    const out = fullTime(noon, 'en-US')
    expect(out).toMatch(/^Thursday, October 1, 2026/)
    expect(out).toMatch(/\d{1,2}:\d{2}/)
  })

  it('is written in the reader’s language', () => {
    expect(fullTime(noon, 'ja-JP')).toMatch(/2026年10月1日木曜日/)
  })

  it('says nothing for a time it cannot read', () => {
    expect(fullTime('')).toBe('')
    expect(fullTime('not a date')).toBe('')
  })
})
