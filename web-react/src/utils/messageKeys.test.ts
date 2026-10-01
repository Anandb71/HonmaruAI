import { describe, it, expect } from 'vitest'
import { messageKeyAction, messageIdOf, othersReplied, deleteWarning, skipsDeleteConfirm, previewText } from './messageKeys'
import type { KeyLike, KeyedMessage } from './messageKeys'

const mine: KeyedMessage = { kind: 'message', mine: true }
const theirs: KeyedMessage = { kind: 'message', mine: false }
const key = (k: string, extra: Partial<KeyLike> = {}): KeyLike => ({ key: k, ...extra })

describe('keys on a message', () => {
  it('moves between messages with the arrows, and Escape goes back to the composer', () => {
    expect(messageKeyAction(key('ArrowUp'), theirs)).toBe('prev')
    expect(messageKeyAction(key('ArrowDown'), theirs)).toBe('next')
    expect(messageKeyAction(key('Escape'), theirs)).toBe('composer')
  })

  it('moves past a row that is not a message, and does nothing else to it', () => {
    expect(messageKeyAction(key('ArrowUp'), null)).toBe('prev')
    expect(messageKeyAction(key('Escape'), null)).toBe('composer')
    for (const k of ['e', 't', 'p', '+', 'Backspace', 'Delete']) expect(messageKeyAction(key(k), null)).toBeNull()
  })

  it('edits only your own message, and not what the AI or an agent said', () => {
    expect(messageKeyAction(key('e'), mine)).toBe('edit')
    expect(messageKeyAction(key('E'), mine)).toBe('edit')
    expect(messageKeyAction(key('e'), theirs)).toBeNull()
    expect(messageKeyAction(key('e'), { kind: 'ai', mine: true })).toBeNull()
    expect(messageKeyAction(key('e'), { kind: 'agent', mine: true })).toBeNull()
  })

  it('deletes only your own message, with either delete key', () => {
    expect(messageKeyAction(key('Backspace'), mine)).toBe('delete')
    expect(messageKeyAction(key('Delete'), mine)).toBe('delete')
    expect(messageKeyAction(key('Backspace', { shiftKey: true }), mine)).toBe('delete')
    expect(messageKeyAction(key('Backspace'), theirs)).toBeNull()
    expect(messageKeyAction(key('Delete'), { kind: 'ai', mine: false })).toBeNull()
  })

  it('opens a thread, pins and reacts on anyone’s message', () => {
    expect(messageKeyAction(key('t'), theirs)).toBe('thread')
    expect(messageKeyAction(key('p'), theirs)).toBe('pin')
    expect(messageKeyAction(key('+'), theirs)).toBe('react')
    expect(messageKeyAction(key('+', { shiftKey: true }), { kind: 'ai', mine: false })).toBe('react')
  })

  it('has no thread to open and nothing to pin inside a thread', () => {
    const reply = { ...mine, parentId: 'p1' }
    expect(messageKeyAction(key('t'), reply)).toBeNull()
    expect(messageKeyAction(key('p'), reply)).toBeNull()
    expect(messageKeyAction(key('t'), theirs, true)).toBeNull()
    expect(messageKeyAction(key('p'), theirs, true)).toBeNull()
    // The rest still works there.
    expect(messageKeyAction(key('e'), reply)).toBe('edit')
    expect(messageKeyAction(key('+'), theirs, true)).toBe('react')
    expect(messageKeyAction(key('Backspace'), reply, true)).toBe('delete')
  })

  it('leaves an unsent message alone except to move past it', () => {
    const gone = { ...mine, deleted: true }
    for (const k of ['e', 't', 'p', '+', 'Backspace']) expect(messageKeyAction(key(k), gone)).toBeNull()
    expect(messageKeyAction(key('ArrowDown'), gone)).toBe('next')
  })

  it('answers nothing held with Ctrl, ⌘ or ⌥, or typed through an IME', () => {
    for (const held of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true }, { keyCode: 229 }]) {
      for (const k of ['ArrowUp', 'ArrowDown', 'Escape', 'e', 't', 'p', '+', 'Backspace']) {
        expect(messageKeyAction(key(k, held), mine)).toBeNull()
      }
    }
  })

  it('leaves ⇧ with an arrow to select text, and ⇧Esc to mark everything read', () => {
    expect(messageKeyAction(key('ArrowUp', { shiftKey: true }), mine)).toBeNull()
    expect(messageKeyAction(key('ArrowDown', { shiftKey: true }), mine)).toBeNull()
    expect(messageKeyAction(key('Escape', { shiftKey: true }), mine)).toBeNull()
  })

  it('does a thing once for a key held down, and keeps walking with the arrows', () => {
    for (const k of ['Escape', 'e', 't', 'p', '+', 'Backspace', 'Delete']) expect(messageKeyAction(key(k, { repeat: true }), mine)).toBeNull()
    expect(messageKeyAction(key('Backspace', { shiftKey: true, repeat: true }), mine)).toBeNull()
    expect(messageKeyAction(key('ArrowUp', { repeat: true }), mine)).toBe('prev')
    expect(messageKeyAction(key('ArrowDown', { repeat: true }), null)).toBe('next')
  })

  it('ignores every other key', () => {
    for (const k of ['a', 'Enter', ' ', 'Tab', '=', 'x']) expect(messageKeyAction(key(k), mine)).toBeNull()
  })
})

describe('the message an article is', () => {
  it('reads the id in the log and in a thread’s pane', () => {
    expect(messageIdOf('msg-abc-123')).toBe('abc-123')
    expect(messageIdOf('msg-thread-abc-123')).toBe('abc-123')
    expect(messageIdOf('card-1')).toBeNull()
    expect(messageIdOf('')).toBeNull()
  })
})

describe('what deleting a message asks', () => {
  it('warns plainly about a lone message, and about its thread when it has one', () => {
    expect(deleteWarning({}, 'me')).toBe('Delete this message? This cannot be undone.')
    expect(deleteWarning({ replyCount: 2, replyRefs: ['me'] }, 'me')).toBe('Delete this message and its thread? This cannot be undone.')
  })

  it('says so when others replied, and a reply of your own is not "others"', () => {
    expect(othersReplied({ replyCount: 2, replyRefs: ['me', 'ken'] }, 'me')).toBe(true)
    expect(othersReplied({ replyCount: 1, replyRefs: ['me'] }, 'me')).toBe(false)
    // A reply's own thread is its parent's: deleting it takes nobody else's words.
    expect(othersReplied({ parentId: 'p', replyRefs: ['ken'] }, 'me')).toBe(false)
    expect(deleteWarning({ replyCount: 2, replyRefs: ['ken'] }, 'me')).toMatch(/Replies from others/)
  })

  it('lets ⇧ skip the question, but never the one about others’ replies', () => {
    expect(skipsDeleteConfirm(true, {}, 'me')).toBe(true)
    expect(skipsDeleteConfirm(true, { replyCount: 1, replyRefs: ['me'] }, 'me')).toBe(true)
    expect(skipsDeleteConfirm(false, {}, 'me')).toBe(false)
    expect(skipsDeleteConfirm(true, { replyCount: 1, replyRefs: ['ken'] }, 'me')).toBe(false)
    // Who you are not known yet: every reply is somebody else's.
    expect(skipsDeleteConfirm(true, { replyCount: 1, replyRefs: ['me'] }, undefined)).toBe(false)
  })
})

describe('the preview in the delete question', () => {
  it('keeps a short message whole and cuts a long one with an ellipsis', () => {
    expect(previewText('  hello  ')).toBe('hello')
    expect(previewText('a'.repeat(200))).toBe('a'.repeat(200))
    expect(previewText('a'.repeat(201))).toBe(`${'a'.repeat(200)}…`)
    expect(previewText('one two three', 7)).toBe('one two…')
  })

  it('never cuts an emoji in half, even one made of several', () => {
    expect(previewText('😀😀😀', 2)).toBe('😀😀…')
    expect(previewText('👨‍👩‍👧👨‍👩‍👧', 1)).toBe('👨‍👩‍👧…')
  })
})
