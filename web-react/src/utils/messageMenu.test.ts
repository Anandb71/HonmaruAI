import { describe, it, expect, vi, afterEach } from 'vitest'
import type { MenuEntry } from '../components/RowMenu'
import { messageMenuEntries, messageContextEntries, type MessageMenuActions } from './messageMenu'

// English, as the keys are; the words filled in as `t` would.
const t = (english: string, vars?: Record<string, string | number>) => english.replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? ''))
const noop = () => {}

/// Everything a reader may do to a teammate's message in a channel, as the
/// conversation hands it over.
const teammates: MessageMenuActions = {
  onReply: noop, onPin: noop, onDecide: noop, onLater: noop, onClip: noop, onUnread: noop, onForward: noop, onCopyLink: noop,
}
const shape = (list: MenuEntry[]) => list.map((e) => (e.kind === 'item' ? e.data : e.kind === 'sep' ? '—' : e.kind))
const item = (list: MenuEntry[], data: string) => list.find((e): e is Extract<MenuEntry, { kind: 'item' }> => e.kind === 'item' && e.data === data)

describe('what can be done to a message', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('offers a teammate’s message everything but editing and deleting it, in groups', () => {
    const list = messageMenuEntries({ body: 'hi', pinned: false }, { ...teammates, t })
    expect(shape(list)).toEqual([
      'reply', 'decide', 'pin', 'clip', 'unread', 'forward', 'link', '—',
      'later', 'remind-hour', 'remind-tomorrow', '—',
      'copy',
    ])
  })

  it('puts editing your own first and deleting it last, apart and in red', () => {
    const list = messageMenuEntries({ body: 'mine', pinned: false }, { ...teammates, onUnread: undefined, onEdit: noop, onDelete: noop, t })
    expect(shape(list)[0]).toBe('edit')
    expect(shape(list).slice(-2)).toEqual(['—', 'delete'])
    expect(item(list, 'delete')).toMatchObject({ label: 'Delete message', danger: true, icon: 'trash' })
    expect(item(list, 'unread')).toBeUndefined()
  })

  it('has no thread to reply in and nothing to pin inside a thread', () => {
    const list = messageMenuEntries({ body: 'a reply', pinned: false }, { ...teammates, inThread: true, t })
    expect(item(list, 'reply')).toBeUndefined()
    expect(item(list, 'pin')).toBeUndefined()
    expect(item(list, 'forward')).toBeDefined()
  })

  it('says what a second press would do: unpin a pinned one, take a clipped one out', () => {
    const list = messageMenuEntries({ body: 'x', pinned: true }, { ...teammates, clipped: true, t })
    expect(item(list, 'pin')?.label).toBe('Unpin')
    expect(item(list, 'clip')?.label).toBe('Remove from clip')
    const fresh = messageMenuEntries({ body: 'x', pinned: false }, { ...teammates, t })
    expect(item(fresh, 'pin')?.label).toBe('Pin to channel')
    expect(item(fresh, 'clip')?.label).toBe('Add to clip')
  })

  it('leaves no line at either end, nor two together, when a group is empty', () => {
    // A file with no words, yours, with nothing to save it for.
    const list = messageMenuEntries({ body: '', pinned: false }, { onEdit: noop, onDelete: noop, t })
    expect(shape(list)).toEqual(['edit', '—', 'delete'])
    expect(messageMenuEntries({ body: '', pinned: false }, { t })).toEqual([])
  })

  it('has an icon for every item, which is all a phone’s sheet draws beside it', () => {
    const list = messageMenuEntries({ body: 'x', pinned: false }, { ...teammates, onEdit: noop, onDelete: noop, t })
    for (const e of list) if (e.kind === 'item') expect(e.icon, e.data).toBeTruthy()
  })

  it('does what it says when picked, taking the time for a reminder when it is picked', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 30, 14, 0, 0))
    const later = vi.fn()
    const reply = vi.fn()
    const list = messageMenuEntries({ body: 'x', pinned: false }, { ...teammates, onReply: reply, onLater: later, t })
    item(list, 'reply')?.onSelect?.()
    expect(reply).toHaveBeenCalledOnce()
    item(list, 'later')?.onSelect?.()
    expect(later).toHaveBeenLastCalledWith(null)
    vi.setSystemTime(new Date(2026, 8, 30, 15, 0, 0))
    item(list, 'remind-hour')?.onSelect?.()
    expect(later).toHaveBeenLastCalledWith(new Date(2026, 8, 30, 16, 0, 0).toISOString())
    item(list, 'remind-tomorrow')?.onSelect?.()
    expect(later).toHaveBeenLastCalledWith(new Date(2026, 9, 1, 9, 0, 0).toISOString())
  })

  it('copies the message’s own words', () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    item(messageMenuEntries({ body: 'the words', pinned: false }, { t }), 'copy')?.onSelect?.()
    expect(writeText).toHaveBeenCalledWith('the words')
  })
})

describe('a right-click on a message', () => {
  it('has the quick reactions in a row along the top, the picker last, then the same list as ⋯', () => {
    const onReact = vi.fn()
    const more = vi.fn()
    const list = messageContextEntries({ body: 'hi', pinned: false }, { ...teammates, t, reactions: ['✅', '👀', '🙌'], onReact, onMoreReactions: more })
    const [strip, line, ...rest] = list
    expect(line).toEqual({ kind: 'sep' })
    expect(shape(rest)).toEqual(shape(messageMenuEntries({ body: 'hi', pinned: false }, { ...teammates, t })))
    if (strip.kind !== 'strip') throw new Error('no strip first')
    expect(strip.label).toBe('Add reaction')
    expect(strip.items.map((i) => i.text ?? i.icon)).toEqual(['✅', '👀', '🙌', 'smile'])
    expect(strip.items[1].label).toBe('React with 👀')
    strip.items[1].onSelect()
    expect(onReact).toHaveBeenCalledWith('👀')
    strip.items[3].onSelect()
    expect(more).toHaveBeenCalledOnce()
  })

  it('is just the reactions when there is nothing else to offer', () => {
    const list = messageContextEntries({ body: '', pinned: false }, { t, reactions: ['✅'], onReact: noop })
    expect(shape(list)).toEqual(['strip'])
  })
})
