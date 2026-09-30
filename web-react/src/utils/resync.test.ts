import { describe, it, expect } from 'vitest'
import { reconnectWatch, wakeWatch } from './resync'

describe('back online', () => {
  it('is not the first connect', () => {
    const back = reconnectWatch()
    expect(back(true)).toBe(false)
  })

  it('is a connect after a drop, once', () => {
    const back = reconnectWatch()
    back(true)
    expect(back(false)).toBe(false)
    // Retries that fail say "not connected" again; still nothing to read.
    expect(back(false)).toBe(false)
    expect(back(true)).toBe(true)
    expect(back(true)).toBe(false)
  })
})

describe('back after a while away', () => {
  it('is a tab visible again after more than a minute hidden', () => {
    const woke = wakeWatch()
    expect(woke(false, 0)).toBe(false)
    expect(woke(true, 61_000)).toBe(true)
  })

  it('is not a glance at another tab', () => {
    const woke = wakeWatch()
    woke(false, 0)
    expect(woke(true, 20_000)).toBe(false)
  })

  it('times the absence from when it first went hidden', () => {
    const woke = wakeWatch()
    woke(false, 0)
    woke(false, 50_000)
    expect(woke(true, 70_000)).toBe(true)
  })

  it('is nothing when it was never hidden', () => {
    const woke = wakeWatch(1_000)
    expect(woke(true, 5_000)).toBe(false)
    woke(false, 6_000)
    expect(woke(true, 8_000)).toBe(true)
    expect(woke(true, 20_000)).toBe(false)
  })
})
