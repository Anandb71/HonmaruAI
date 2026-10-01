import { describe, it, expect, beforeEach, vi } from 'vitest'
import { foldedRows, sectionBadge, visibleRows, stepRow, readFolds, writeFolds, withSectionFolds, withFold } from './sidebarSections'

const row = (key: string, extra: { view?: string; unread?: number; fresh?: boolean } = {}) => ({ key, view: extra.view, unread: extra.unread || 0, fresh: extra.fresh })

// A folded section keeps in view what still calls for you, as a chat
// client's collapsed category does.
describe('a folded section', () => {
  const quiet = row('channel:quiet', { view: 'b:quiet' })
  const cards = row('channel:cards', { view: 'b:cards', unread: 2 })
  const fresh = row('channel:fresh', { view: 'b:fresh', fresh: true })
  const named = row('channel:named', { view: 'b:named' })
  const muted = row('channel:muted', { view: 'b:muted', unread: 3 })
  const mutedNamed = row('channel:muted-named', { view: 'b:muted-named' })
  const mutedTalk = row('channel:muted-talk', { view: 'b:muted-talk', fresh: true })
  const app = row('app:gmail', { unread: 1 })
  const all = [quiet, cards, fresh, named, muted, mutedNamed, mutedTalk, app]
  const mentions = { 'b:named': 1, 'b:muted-named': 2 }
  const prefs = { 'b:muted': 'mute', 'b:muted-named': 'mute', 'b:muted-talk': 'mute' } as const

  it('shows the rows with cards, something new or a mention, in their order', () => {
    expect(foldedRows(all, { mentions, prefs }).map((th) => th.key))
      .toEqual(['channel:cards', 'channel:fresh', 'channel:named', 'channel:muted', 'channel:muted-named', 'app:gmail'])
  })

  it('shows a muted conversation only when it names you or a card waits on you there', () => {
    expect(foldedRows([muted, mutedNamed, mutedTalk], { mentions, prefs })).toEqual([muted, mutedNamed])
    expect(foldedRows([mutedTalk], { mentions: {}, prefs })).toEqual([])
    expect(foldedRows([{ ...muted, unread: 0 }], { mentions: {}, prefs })).toEqual([])
  })

  it('always shows the one open now, however quiet or muted', () => {
    expect(foldedRows([quiet, mutedTalk], { mentions: {}, prefs, currentKey: 'channel:quiet' })).toEqual([quiet])
    expect(foldedRows([quiet, mutedTalk], { mentions: {}, prefs, currentKey: 'channel:muted-talk' })).toEqual([mutedTalk])
    expect(foldedRows([quiet], { mentions: {}, prefs: {}, currentKey: null })).toEqual([])
  })

  it('shows nothing when nothing calls for you', () => {
    expect(foldedRows([quiet, row('person:a', { view: 'dm:a' })], { mentions: { 'b:elsewhere': 4 }, prefs: {} })).toEqual([])
  })
})

describe('a folded section’s header', () => {
  it('counts cards and mentions apart, and says whether anything is new', () => {
    const rows = [row('a', { view: 'b:a', unread: 2 }), row('b', { view: 'b:b', fresh: true }), row('c', { view: 'dm:c', unread: 1 }), row('app:ai', { unread: 4 })]
    expect(sectionBadge(rows, { 'b:b': 2, 'dm:c': 1, 'b:gone': 9 })).toEqual({ cards: 7, mentions: 3, fresh: true })
  })

  it('has no new-message dot for the one open now, as its row has none', () => {
    const open = row('b', { view: 'b:b', fresh: true, unread: 1 })
    expect(sectionBadge([open], { 'b:b': 1 }, 'b')).toEqual({ cards: 1, mentions: 1, fresh: false })
    expect(sectionBadge([open, row('c', { view: 'b:c', fresh: true })], {}, 'b').fresh).toBe(true)
  })

  it('is quiet over quiet rows', () => {
    expect(sectionBadge([row('a', { view: 'b:a' })], {})).toEqual({ cards: 0, mentions: 0, fresh: false })
    expect(sectionBadge([], {})).toEqual({ cards: 0, mentions: 0, fresh: false })
  })
})

// ⌥↑/⌥↓ go through the rows on screen, never one a fold hides.
describe('the rows the sidebar shows', () => {
  const starred = [row('channel:s', { view: 'b:s' })]
  const channels = [row('channel:a', { view: 'b:a' }), row('channel:b', { view: 'b:b', fresh: true }), row('channel:c', { view: 'b:c' })]
  const people = [row('person:p', { view: 'dm:p' })]
  const sections = [{ id: 'starred', threads: starred }, { id: 'channels', threads: channels }, { id: 'people', threads: people }]

  it('are every row, in order, when nothing is folded', () => {
    expect(visibleRows(sections, {}, { mentions: {}, prefs: {} }).map((th) => th.key))
      .toEqual(['channel:s', 'channel:a', 'channel:b', 'channel:c', 'person:p'])
  })

  it('skip what a folded section hides, keeping the open one', () => {
    const context = { mentions: {}, prefs: {}, currentKey: 'channel:c' }
    expect(visibleRows(sections, { channels: true }, context).map((th) => th.key))
      .toEqual(['channel:s', 'channel:b', 'channel:c', 'person:p'])
    expect(visibleRows(sections, { starred: true, people: true, channels: false }, context).map((th) => th.key))
      .toEqual(['channel:a', 'channel:b', 'channel:c'])
  })
})

describe('⌥↑/⌥↓', () => {
  const rows = [row('a'), row('b'), row('c')]

  it('go to the row after or before the one open, round the ends', () => {
    expect(stepRow(rows, 'a', true)?.key).toBe('b')
    expect(stepRow(rows, 'c', true)?.key).toBe('a')
    expect(stepRow(rows, 'b', false)?.key).toBe('a')
    expect(stepRow(rows, 'a', false)?.key).toBe('c')
  })

  it('start at the top, or the bottom, when the one open is not shown', () => {
    // Activity is up and the open row's section is folded: it is not listed.
    expect(stepRow(rows, 'hidden', true)?.key).toBe('a')
    expect(stepRow(rows, 'hidden', false)?.key).toBe('c')
    expect(stepRow(rows, null, false)?.key).toBe('c')
    expect(stepRow(rows, undefined, true)?.key).toBe('a')
  })

  it('go nowhere in an empty sidebar', () => {
    expect(stepRow([], 'a', true)).toBeUndefined()
    expect(stepRow([], null, false)).toBeUndefined()
  })
})

// Which sections you folded outlives a reload: per workspace in this
// browser, and your own sections on the server as well.
describe('folds', () => {
  let store: Map<string, string>
  beforeEach(() => {
    store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
    })
  })

  it('are remembered per workspace, only the folded ones', () => {
    writeFolds('org-a', { channels: true, people: false, 'sec:s1': true })
    expect(store.get('sidebar.folded:org-a')).toBe('["channels","sec:s1"]')
    expect(readFolds('org-a')).toEqual({ channels: true, 'sec:s1': true })
    expect(readFolds('org-b')).toEqual({})
    writeFolds('org-a', { channels: false })
    expect(store.has('sidebar.folded:org-a')).toBe(false)
  })

  it('read as none when what is kept is not a list of ids', () => {
    for (const bad of ['{"channels":true}', 'not json', '"channels"']) {
      store.set('sidebar.folded:org-a', bad)
      expect(readFolds('org-a')).toEqual({})
    }
    store.set('sidebar.folded:org-a', '[1,null,"apps"]')
    expect(readFolds('org-a')).toEqual({ apps: true })
  })

  it('are open, not an error, where the browser keeps nothing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => { throw new Error('blocked') },
    })
    expect(readFolds('org-a')).toEqual({})
    expect(() => writeFolds('org-a', { channels: true })).not.toThrow()
  })

  it('change one section’s flag and leave the rest of it, and the others, alone', () => {
    const clients = { id: 's1', name: 'Clients', views: ['b:cafe'], collapsed: false }
    const later = { id: 's2', name: 'Later', views: ['dm:mika'] }
    const next = withFold([clients, later], 's1', true)
    expect(next).toEqual([{ ...clients, collapsed: true }, later])
    expect(next[1]).toBe(later)
    expect(withFold(next, 's1', false)[0]).toEqual(clients)
    // A section this window does not have: nothing changes.
    expect(withFold([clients, later], 'gone', true)).toEqual([clients, later])
  })

  it('take your own sections from the server and forget the ones gone', () => {
    const here = { channels: true, apps: false, 'sec:s1': true, 'sec:gone': true }
    expect(withSectionFolds(here, [{ id: 's1', collapsed: false }, { id: 's2', collapsed: true }, { id: 's3' }]))
      .toEqual({ channels: true, 'sec:s2': true })
  })
})
