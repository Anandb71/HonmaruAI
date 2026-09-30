import { describe, it, expect } from 'vitest'
import {
  heard, said, expire, nextExpiry, typistsIn, typingLine, typedIn, stoppedIn, announce,
  TYPING_TTL_MS, TYPING_EVERY_MS, ANNOUNCE_GAP_MS,
} from './typing'
import type { Typist, TypingEvent } from './typing'

// "Aki is typing…": who is typing where, as this browser hears it, and what
// it tells the relay about its own person.

const aki = { ref: 'r-aki', name: 'Aki' }
const ben = { ref: 'r-ben', name: 'Ben' }
const cy = { ref: 'r-cy', name: 'Cy' }
const inGeneral = (who: TypingEvent['who'], extra: Partial<TypingEvent> = {}): TypingEvent => ({ channel: 'b:general', parentId: null, who, ...extra })
const here = { channel: 'b:general', parentId: null }

describe('who is typing', () => {
  it('adds someone, and keeps them in their place while they go on', () => {
    let list: Typist[] = []
    list = heard(list, inGeneral(aki), 0)
    list = heard(list, inGeneral(ben), 100)
    list = heard(list, inGeneral(aki), 2000)
    expect(list.map((x) => [x.name, x.until])).toEqual([['Aki', 2000 + TYPING_TTL_MS], ['Ben', 100 + TYPING_TTL_MS]])
  })

  it('keeps a thread apart from its conversation', () => {
    const list = heard(heard([], inGeneral(aki), 0), inGeneral(ben, { parentId: 'm-1' }), 0)
    expect(typistsIn(list, here, 1).map((x) => x.name)).toEqual(['Aki'])
    expect(typistsIn(list, { channel: 'b:general', parentId: 'm-1' }, 1).map((x) => x.name)).toEqual(['Ben'])
    expect(typistsIn(list, { channel: 'b:ops', parentId: null }, 1)).toEqual([])
  })

  it('takes someone off when they stop, or when their message arrives there', () => {
    const list = heard(heard([], inGeneral(aki), 0), inGeneral(ben), 0)
    expect(heard(list, inGeneral(aki, { stop: true }), 1).map((x) => x.name)).toEqual(['Ben'])
    expect(said(list, { channel: 'b:general', parentId: null, authorRef: 'r-ben' }).map((x) => x.name)).toEqual(['Aki'])
    // A reply in a thread ends the thread's line, not the conversation's.
    expect(said(list, { channel: 'b:general', parentId: 'm-1', authorRef: 'r-aki' })).toBe(list)
  })

  it('lets a line nobody refreshed run out', () => {
    const list = heard(heard([], inGeneral(aki), 0), inGeneral(ben), 3000)
    expect(nextExpiry(list)).toBe(TYPING_TTL_MS)
    expect(expire(list, TYPING_TTL_MS - 1)).toBe(list)
    expect(expire(list, TYPING_TTL_MS).map((x) => x.name)).toEqual(['Ben'])
    expect(typistsIn(list, here, TYPING_TTL_MS).map((x) => x.name)).toEqual(['Ben'])
    expect(nextExpiry([])).toBe(null)
  })

  it('never shows whoever is reading, and ignores what names nobody', () => {
    const list = heard(heard([], inGeneral(aki), 0), inGeneral(ben), 0)
    expect(typistsIn(list, here, 1, 'r-aki').map((x) => x.name)).toEqual(['Ben'])
    expect(heard(list, null, 0)).toBe(list)
    expect(heard(list, inGeneral({ ref: null, name: 'Nobody' }), 0)).toBe(list)
    expect(heard(list, inGeneral({ ref: 'r-x', name: '' }), 0)).toBe(list)
    expect(said(list, { channel: 'b:general', authorRef: null })).toBe(list)
  })

  it('says it the way Discord does', () => {
    expect(typingLine([])).toBe('')
    expect(typingLine(['Aki'])).toBe('Aki is typing…')
    expect(typingLine(['Aki', 'Ben'])).toBe('Aki and Ben are typing…')
    expect(typingLine([aki.name, ben.name, cy.name])).toBe('Several people are typing…')
  })
})

describe('telling the relay', () => {
  it('says so when typing starts, then at most every few seconds', () => {
    const first = typedIn(null, here, 'h', 0)
    expect(first.send).toEqual([{ type: 'typing', place: here }])
    const soon = typedIn(first.next, here, 'he', TYPING_EVERY_MS - 1)
    expect(soon.send).toEqual([])
    expect(soon.next).toBe(first.next)
    const later = typedIn(soon.next, here, 'hel', TYPING_EVERY_MS)
    expect(later.send).toEqual([{ type: 'typing', place: here }])
    expect(later.next?.at).toBe(TYPING_EVERY_MS)
  })

  it('stops when the box empties or becomes a command, and never starts for one', () => {
    const typing = typedIn(null, here, 'hi', 0).next
    expect(typedIn(typing, here, '', 10)).toEqual({ next: null, send: [{ type: 'typing_stop', place: here }] })
    expect(typedIn(typing, here, '/rem', 10)).toEqual({ next: null, send: [{ type: 'typing_stop', place: here }] })
    expect(typedIn(null, here, '/remind me', 10)).toEqual({ next: null, send: [] })
    expect(typedIn(null, here, '   ', 10)).toEqual({ next: null, send: [] })
  })

  it('moves from one box to another with a stop where it was', () => {
    const typing = typedIn(null, here, 'hi', 0).next
    const thread = { channel: 'b:general', parentId: 'm-1' }
    expect(typedIn(typing, thread, 'a', 10).send).toEqual([{ type: 'typing_stop', place: here }, { type: 'typing', place: thread }])
  })

  it('stops, once, only where it started', () => {
    const typing = typedIn(null, here, 'hi', 0).next
    expect(stoppedIn(typing, { channel: 'b:general', parentId: 'm-1' })).toEqual({ next: typing, send: [] })
    const done = stoppedIn(typing, here)
    expect(done).toEqual({ next: null, send: [{ type: 'typing_stop', place: here }] })
    expect(stoppedIn(done.next, here)).toEqual({ next: null, send: [] })
    expect(stoppedIn(typing).send).toEqual([{ type: 'typing_stop', place: here }])
  })
})

describe('what a screen reader hears', () => {
  it('is told a new line at most once every few seconds, and nothing twice', () => {
    const start = { text: '', at: 0 }
    const one = announce(start, 'Aki is typing…', 10_000)
    expect(one).toEqual({ text: 'Aki is typing…', at: 10_000 })
    expect(announce(one, 'Aki is typing…', 20_000)).toBe(one)
    // Too soon for the next: kept as it was, to be told later.
    expect(announce(one, 'Aki and Ben are typing…', 10_000 + ANNOUNCE_GAP_MS - 1)).toBe(one)
    expect(announce(one, 'Aki and Ben are typing…', 10_000 + ANNOUNCE_GAP_MS)).toEqual({ text: 'Aki and Ben are typing…', at: 10_000 + ANNOUNCE_GAP_MS })
  })

  it('goes quiet at once, without restarting the clock', () => {
    const one = { text: 'Aki is typing…', at: 10_000 }
    const quiet = announce(one, '', 11_000)
    expect(quiet).toEqual({ text: '', at: 10_000 })
    // The same line back straight away is not said again yet.
    expect(announce(quiet, 'Aki is typing…', 12_000)).toBe(quiet)
    expect(announce(quiet, 'Aki is typing…', 10_000 + ANNOUNCE_GAP_MS).text).toBe('Aki is typing…')
  })
})
