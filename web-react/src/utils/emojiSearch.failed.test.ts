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

  it('reads the chunk’s address from the error, to ask for it by a new one', async () => {
    const { lostChunk } = await import('./emojiSearch')
    const site = 'https://app.example'
    const chunk = `${site}/assets/emojiData-9f2c.js`
    expect(lostChunk(new TypeError(`Failed to fetch dynamically imported module: ${chunk}`), site)).toBe(chunk)
    expect(lostChunk(new TypeError(`error loading dynamically imported module: ${chunk}`), site)).toBe(chunk)
    // No address in it, somebody else's address, or nowhere to compare it with.
    expect(lostChunk(new TypeError('Importing a module script failed.'), site)).toBeNull()
    expect(lostChunk(new Error('see https://elsewhere.example/docs'), site)).toBeNull()
    expect(lostChunk(new Error(`failed: https://app.example.evil.test/x.js`), site)).toBeNull()
    expect(lostChunk(new TypeError(`Failed to fetch dynamically imported module: ${chunk}`), '')).toBeNull()
    expect(lostChunk('offline', site)).toBeNull()
  })
})
