import { describe, it, expect } from 'vitest'
import { EMOJI } from '../utils/emojiData'
import { emojiChoices, emojiInsert } from './MentionMenu'

// The ':' menu: the workspace's own emoji first, then Unicode ones once the
// list is here.
describe('the emoji a colon offers', () => {
  const custom = [{ name: 'thumbsup_shogun', url: 'u1', by: null, createdAt: '' }]

  it('offers the workspace’s own first, and the Unicode ones after', () => {
    const list = emojiChoices(custom, EMOJI, 'thumbsup')
    expect(list[0]).toEqual({ kind: 'custom', name: 'thumbsup_shogun', url: 'u1' })
    expect(list[1]).toEqual({ kind: 'unicode', name: 'thumbsup', e: '👍' })
  })

  it('offers only the workspace’s own until the list has loaded', () => {
    expect(emojiChoices(custom, null, 'thumbsup').map((c) => c.kind)).toEqual(['custom'])
    expect(emojiChoices([], null, 'thumbsup')).toEqual([])
  })

  it('shows the name that matched, and stops at ten', () => {
    expect(emojiChoices([], EMOJI, 'lol')[0]).toEqual({ kind: 'unicode', name: 'lol', e: '😂' })
    expect(emojiChoices([], EMOJI, 'heart').length).toBe(10)
  })

  it('writes the character for a Unicode emoji, and the :name: for the workspace’s own', () => {
    expect(emojiInsert({ kind: 'unicode', name: 'tada', e: '🎉' })).toBe('🎉')
    expect(emojiInsert({ kind: 'custom', name: 'shogun_party', url: 'u' })).toBe(':shogun_party:')
  })
})
