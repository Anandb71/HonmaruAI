import { describe, it, expect, vi } from 'vitest'

// The list's chunk not arriving: offline, or a deploy replaced it.
describe('the emoji list, when it does not load', () => {
  it('says so, and is fetched again the next time it is asked for', async () => {
    vi.doMock('./emojiData', () => { throw new Error('offline') })
    const { loadEmojiData, emojiDataState } = await import('./emojiSearch')
    expect(emojiDataState()).toBe('loading')
    expect(await loadEmojiData()).toBeNull()
    expect(emojiDataState()).toBe('failed')

    vi.doUnmock('./emojiData')
    const again = loadEmojiData()
    expect(emojiDataState()).toBe('loading')
    expect((await again)!.length).toBeGreaterThan(380)
    expect(emojiDataState()).toBe('ready')
  })
})
