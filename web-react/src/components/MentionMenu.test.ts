import { describe, it, expect } from 'vitest'
import { EMOJI } from '../utils/emojiData'
import { emojiChoices, emojiInsert, emojiQuery, closedShortcode, typedColon, completeShortcode } from './MentionMenu'

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

// ":joy:" written out, colon to colon, without taking it from the menu.
describe('a shortcode typed in full', () => {
  const custom = [{ name: 'shogun_party', url: 'u1', by: null, createdAt: '' }]

  it('is found where the menu’s query ends: at the closing colon', () => {
    expect(emojiQuery('so funny :joy', 13)).toEqual({ start: 9, query: 'joy' })
    expect(emojiQuery('so funny :joy:', 14)).toBeNull()
    expect(closedShortcode('so funny :joy:', 14)).toEqual({ start: 9, name: 'joy' })
    expect(closedShortcode(':x:', 3)).toEqual({ start: 0, name: 'x' })
    expect(closedShortcode('so funny :joy', 13)).toBeNull()
    expect(closedShortcode('at 10:30:', 9)).toBeNull()
    expect(closedShortcode(':joy: yes', 9)).toBeNull()
  })

  it('becomes its character, the caret after it and the rest of the line kept', () => {
    expect(completeShortcode(':joy:', 5, [], EMOJI)).toEqual({ text: '😂', caret: 2, e: '😂' })
    expect(completeShortcode('so funny :joy: right', 14, [], EMOJI)).toEqual({ text: 'so funny 😂 right', caret: 11, e: '😂' })
    // Any of its names, in full — not the start of one.
    expect(completeShortcode('(:tada:', 7, [], EMOJI)?.text).toBe('(🎉')
    expect(completeShortcode(':lol:', 5, [], EMOJI)?.e).toBe('😂')
    expect(completeShortcode(':jo:', 4, [], EMOJI)).toBeNull()
  })

  it('stays as written when it is the workspace’s own, no emoji’s name, in code, or the list is not here', () => {
    expect(completeShortcode(':shogun_party:', 14, custom, EMOJI)).toBeNull()
    expect(completeShortcode(':joy:', 5, [{ ...custom[0], name: 'joy' }], EMOJI)).toBeNull()
    expect(completeShortcode(':not_an_emoji:', 14, [], EMOJI)).toBeNull()
    expect(completeShortcode('`a :joy:', 8, [], EMOJI)).toBeNull()
    expect(completeShortcode('`a` :joy:', 9, [], EMOJI)?.text).toBe('`a` 😂')
    expect(completeShortcode(':joy:', 5, [], null)).toBeNull()
  })

  it('is taken as its closing colon is typed, not when the caret is merely put after one', () => {
    expect(typedColon(':joy', ':joy:', 5)).toBe(true)
    expect(typedColon('a :joy b', 'a :joy: b', 7)).toBe(true)
    // The same text again, a paste, a draft put back, a letter after it.
    expect(typedColon(':joy:', ':joy:', 5)).toBe(false)
    expect(typedColon('', ':joy:', 5)).toBe(false)
    expect(typedColon('other', ':joy:', 5)).toBe(false)
    expect(typedColon(':joy:', ':joy:!', 6)).toBe(false)
  })
})
