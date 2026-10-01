import { describe, it, expect } from 'vitest'
import { crashVerdict, CRASH_LIMIT, CRASH_WINDOW_MS } from '../src/crashes.js'

describe('a page that crashes', () => {
  it('is reloaded the first times', () => {
    expect(crashVerdict([], 1000)).toEqual({ reload: true, history: [1000] })
    expect(crashVerdict([1000], 2000)).toEqual({ reload: true, history: [1000, 2000] })
  })

  it('is not reloaded again once it has crashed too often in a short time', () => {
    let history = []
    const verdicts = []
    for (let i = 0; i < CRASH_LIMIT; i += 1) {
      const v = crashVerdict(history, 1000 + i * 100)
      history = v.history
      verdicts.push(v.reload)
    }
    expect(verdicts).toEqual([...Array(CRASH_LIMIT - 1).fill(true), false])
  })

  it('forgets crashes older than the window, so an occasional one is always reloaded', () => {
    const old = [1000, 2000]
    expect(crashVerdict(old, 1000 + CRASH_WINDOW_MS)).toEqual({ reload: true, history: [2000, 1000 + CRASH_WINDOW_MS] })
    expect(crashVerdict(old, 3000 + CRASH_WINDOW_MS)).toEqual({ reload: true, history: [3000 + CRASH_WINDOW_MS] })
  })

  it('takes its own limits', () => {
    expect(crashVerdict([0], 10, { limit: 2, windowMs: 100 }).reload).toBe(false)
    expect(crashVerdict([0], 200, { limit: 2, windowMs: 100 }).reload).toBe(true)
  })
})
