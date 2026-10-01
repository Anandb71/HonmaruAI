import { describe, it, expect } from 'vitest'
import { EMOJI, EMOJI_GROUPS } from './emojiData'

// cleanEmoji in worker/src/channels.js, copied: a reaction the Worker takes.
// Kept here as a copy on purpose — if the Worker's rule changes, this fails
// rather than following it.
function workerTakes(raw: string): boolean {
  const text = String(raw || '').trim()
  if (!text || text.length > 16) return false
  if (/^:[a-z0-9_+-]{1,30}:$/.test(text)) return true
  return /^[\p{Extended_Pictographic}\p{Emoji_Component}\u200d\ufe0f]+$/u.test(text) && /\p{Extended_Pictographic}/u.test(text)
}

describe('the emoji list', () => {
  it('is a few hundred, in every group', () => {
    expect(EMOJI.length).toBeGreaterThanOrEqual(380)
    expect(EMOJI.length).toBeLessThanOrEqual(460)
    for (const g of EMOJI_GROUPS) expect(EMOJI.filter((x) => x.g === g).length).toBeGreaterThan(20)
  })

  it('holds only reactions the Worker takes', () => {
    const refused = EMOJI.filter((x) => !workerTakes(x.e)).map((x) => x.e)
    expect(refused).toEqual([])
  })

  it('has no country flags or keycaps, which the Worker refuses', () => {
    expect(EMOJI.filter((x) => /\p{Regional_Indicator}|\u20e3/u.test(x.e))).toEqual([])
  })

  it('names each emoji once, as a shortcode can be typed', () => {
    const chars = EMOJI.map((x) => x.e)
    expect(new Set(chars).size).toBe(chars.length)
    for (const x of EMOJI) {
      expect(x.n.length).toBeGreaterThan(0)
      for (const n of x.n) expect(n).toMatch(/^[a-z0-9_+-]{1,30}$/)
    }
    // A shortcode (the first name) belongs to one emoji.
    const codes = EMOJI.map((x) => x.n[0])
    expect(new Set(codes).size).toBe(codes.length)
  })
})
