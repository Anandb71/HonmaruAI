import { describe, it, expect } from 'vitest'
import { foldedRows, sectionBadge } from './sidebarSections'

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
  const app = row('app:gmail', { unread: 1 })
  const all = [quiet, cards, fresh, named, muted, mutedNamed, app]
  const mentions = { 'b:named': 1, 'b:muted-named': 2 }
  const prefs = { 'b:muted': 'mute', 'b:muted-named': 'mute' } as const

  it('shows the rows with cards, something new or a mention, in their order', () => {
    expect(foldedRows(all, { mentions, prefs }).map((th) => th.key))
      .toEqual(['channel:cards', 'channel:fresh', 'channel:named', 'channel:muted-named', 'app:gmail'])
  })

  it('shows a muted conversation only when it names you', () => {
    const shown = foldedRows([muted, mutedNamed], { mentions, prefs })
    expect(shown).toEqual([mutedNamed])
    expect(foldedRows([muted], { mentions: {}, prefs })).toEqual([])
  })

  it('always shows the one open now, however quiet or muted', () => {
    expect(foldedRows([quiet, muted], { mentions: {}, prefs, currentKey: 'channel:quiet' })).toEqual([quiet])
    expect(foldedRows([quiet, muted], { mentions: {}, prefs, currentKey: 'channel:muted' })).toEqual([muted])
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

  it('is quiet over quiet rows', () => {
    expect(sectionBadge([row('a', { view: 'b:a' })], {})).toEqual({ cards: 0, mentions: 0, fresh: false })
    expect(sectionBadge([], {})).toEqual({ cards: 0, mentions: 0, fresh: false })
  })
})
