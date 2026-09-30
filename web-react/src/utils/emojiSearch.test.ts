import { describe, it, expect, vi, afterEach } from 'vitest'
import { EMOJI } from './emojiData'
import type { EmojiEntry } from './emojiData'
import { searchEmoji, bestName, pushRecent, readRecent, rememberEmoji, quickReactions, isEmojiOnly, gridStep, canReact, loadEmojiData, QUICK_REACTIONS } from './emojiSearch'

const entry = (e: string, ...n: string[]): EmojiEntry => ({ e, n, g: 'Symbols' })

describe('searching emoji by name', () => {
  const data = [entry('💔', 'broken_heart'), entry('😍', 'heart_eyes'), entry('❤️', 'heart', 'love'), entry('💓', 'heartbeat')]

  it('puts the name itself first, then names that start with it, then names that hold it', () => {
    expect(searchEmoji(data, 'heart').map((x) => x.e)).toEqual(['❤️', '😍', '💓', '💔'])
    expect(searchEmoji(data, 'heart', 2).map((x) => x.e)).toEqual(['❤️', '😍'])
  })

  it('reads a query as a shortcode: colons, case and spaces do not matter', () => {
    expect(searchEmoji(data, ':Heart Eyes:').map((x) => x.e)).toEqual(['😍'])
    expect(searchEmoji(data, '  ')).toEqual([])
    expect(searchEmoji(data, 'nothing')).toEqual([])
  })

  it('finds a character pasted in', () => {
    expect(searchEmoji(data, '💓').map((x) => x.e)).toEqual(['💓'])
  })

  it('names what answered the query best', () => {
    expect(bestName(data[2], 'lov')).toBe('love')
    expect(bestName(data[2], 'hea')).toBe('heart')
    expect(bestName(data[2], '')).toBe('heart')
  })

  it('answers the everyday words from the real list', () => {
    expect(searchEmoji(EMOJI, 'thumbsup')[0].e).toBe('👍')
    expect(searchEmoji(EMOJI, '+1')[0].e).toBe('👍')
    expect(searchEmoji(EMOJI, 'tada')[0].e).toBe('🎉')
    expect(searchEmoji(EMOJI, 'fire')[0].e).toBe('🔥')
  })

  it('loads the list once, from its own chunk', async () => {
    const a = await loadEmojiData()
    expect(a).toBe(EMOJI)
    expect(await loadEmojiData()).toBe(a)
  })
})

describe('recently used', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('puts the newest first, once, and keeps the list short', () => {
    expect(pushRecent(['👍', '🎉'], '🎉')).toEqual(['🎉', '👍'])
    expect(pushRecent(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b'])
    const long = Array.from({ length: 30 }, (_, i) => `:e${i}:`)
    expect(pushRecent(long, '🔥')).toHaveLength(24)
  })

  it('is kept in this browser, and survives storage that is broken or tampered with', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) } })
    rememberEmoji('👀')
    rememberEmoji(':shogun_party:')
    rememberEmoji('not an emoji')
    expect(JSON.parse(store.get('emoji.recent')!)).toEqual([':shogun_party:', '👀'])
    store.set('emoji.recent', JSON.stringify(['🎉', 42, '<b>', '🎉', ':ok:']))
    expect(readRecent()).toEqual(['🎉', ':ok:'])
    store.set('emoji.recent', '{nope')
    expect(readRecent()).toEqual([])
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } })
    expect(readRecent()).toEqual([])
    expect(() => rememberEmoji('🔥')).not.toThrow()
  })

  it('fills the hover bar with the last three used, then the usual ones', () => {
    const all = () => true
    expect(quickReactions([], all)).toEqual(QUICK_REACTIONS)
    expect(quickReactions(['🔥'], all)).toEqual(['🔥', '✅', '👀'])
    expect(quickReactions(['👀', '🔥'], all)).toEqual(['👀', '🔥', '✅'])
    expect(quickReactions(['🔥', '🎉', '💯', '🙏'], all)).toEqual(['🔥', '🎉', '💯'])
    // A workspace's emoji this workspace does not have is left out.
    expect(quickReactions([':elsewhere:', '🔥'], (e) => !e.startsWith(':'))).toEqual(['🔥', '✅', '👀'])
  })

  it('takes only what the Worker takes as a reaction', () => {
    expect(canReact('👍🏽')).toBe(true)
    expect(canReact('👨‍💻')).toBe(true)
    expect(canReact(':ok:')).toBe(true)
    expect(canReact('🇯🇵')).toBe(false)
    expect(canReact('1️⃣')).toBe(false)
    expect(canReact('ok')).toBe(false)
    expect(canReact('👍'.repeat(9))).toBe(false)
  })
})

describe('a line of nothing but emoji', () => {
  const known = (t: string) => t === ':party:'

  it('is one or more emoji and spaces', () => {
    expect(isEmojiOnly('👍')).toBe(true)
    expect(isEmojiOnly('👍 🎉')).toBe(true)
    expect(isEmojiOnly('  ❤️  ')).toBe(true)
    expect(isEmojiOnly('👨‍💻👍🏽')).toBe(true)
    expect(isEmojiOnly('🇯🇵 1️⃣')).toBe(true)
  })

  it('counts a workspace emoji only when this workspace draws it', () => {
    expect(isEmojiOnly(':party:', known)).toBe(true)
    expect(isEmojiOnly(':party: 🎉', known)).toBe(true)
    expect(isEmojiOnly(':other:', known)).toBe(false)
    expect(isEmojiOnly(':party:')).toBe(false)
  })

  it('is not a line with words, digits or marks in it', () => {
    expect(isEmojiOnly('')).toBe(false)
    expect(isEmojiOnly('   ')).toBe(false)
    expect(isEmojiOnly('ok 👍')).toBe(false)
    expect(isEmojiOnly('1 👍')).toBe(false)
    expect(isEmojiOnly('#')).toBe(false)
    expect(isEmojiOnly('*👍*')).toBe(false)
    expect(isEmojiOnly('👍!')).toBe(false)
    expect(isEmojiOnly('`👍`')).toBe(false)
  })
})

describe('arrow keys in the picker', () => {
  // Two sections: 10 cells (rows of 8 and 2), then 5.
  const sizes = [10, 5]

  it('moves along the list left and right, and stops at its ends', () => {
    expect(gridStep(sizes, 0, 'ArrowRight')).toBe(1)
    expect(gridStep(sizes, 9, 'ArrowRight')).toBe(10)
    expect(gridStep(sizes, 14, 'ArrowRight')).toBe(14)
    expect(gridStep(sizes, 0, 'ArrowLeft')).toBe(0)
    expect(gridStep(sizes, 5, 'Home')).toBe(0)
    expect(gridStep(sizes, 5, 'End')).toBe(14)
  })

  it('moves down a column, into a short row, and on into the next section', () => {
    expect(gridStep(sizes, 1, 'ArrowDown')).toBe(9)
    expect(gridStep(sizes, 5, 'ArrowDown')).toBe(9)
    expect(gridStep(sizes, 9, 'ArrowDown')).toBe(11)
    expect(gridStep(sizes, 8, 'ArrowDown')).toBe(10)
    expect(gridStep(sizes, 12, 'ArrowDown')).toBe(12)
  })

  it('moves up a column, into the section above, and from the top row to the search box', () => {
    expect(gridStep(sizes, 9, 'ArrowUp')).toBe(1)
    expect(gridStep(sizes, 11, 'ArrowUp')).toBe(9)
    expect(gridStep(sizes, 14, 'ArrowUp')).toBe(9)
    expect(gridStep(sizes, 3, 'ArrowUp')).toBe(-1)
    expect(gridStep([0, 4], 2, 'ArrowUp')).toBe(-1)
    expect(gridStep([3, 0, 4], 1, 'ArrowDown')).toBe(4)
    expect(gridStep([], 0, 'ArrowDown')).toBe(-1)
  })
})
