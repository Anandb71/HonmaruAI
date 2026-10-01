import { describe, it, expect } from 'vitest'
import { visibleOrder, step, foldedHome } from './sidebarOrder'

const row = (key: string, unread = false) => ({ key, unread })
const keys = (list: Array<{ key: string }>) => list.map((x) => x.key)

// The sidebar as drawn: Starred, one of your sections, Channels in your
// order, DMs, Apps.
const groups = [
  { id: 'starred', items: [row('b:design')] },
  { id: 'sec:ops', items: [row('b:ops'), row('dm:kenji', true)] },
  { id: 'channels', items: [row('b:general'), row('b:hotel', true)] },
  { id: 'people', items: [row('dm:aya')] },
  { id: 'apps', items: [row('app:ai')] },
]

describe('the sidebar as the eye reads it', () => {
  it('keeps the groups in the order drawn', () => {
    expect(keys(visibleOrder(groups, {}))).toEqual(['b:design', 'b:ops', 'dm:kenji', 'b:general', 'b:hotel', 'dm:aya', 'app:ai'])
  })
  it('leaves out what a folded group hides', () => {
    expect(keys(visibleOrder(groups, { channels: true, starred: true }))).toEqual(['b:ops', 'dm:kenji', 'dm:aya', 'app:ai'])
    expect(keys(visibleOrder(groups, { channels: false }))).toContain('b:hotel')
  })
  it('counts a conversation kept in two groups once, where it first appears', () => {
    const twice = [{ id: 'sec:a', items: [row('b:x'), row('b:y')] }, { id: 'sec:b', items: [row('b:y'), row('b:z')] }]
    expect(keys(visibleOrder(twice, {}))).toEqual(['b:x', 'b:y', 'b:z'])
    // Folded where it first appears, it is still there where it appears next.
    expect(keys(visibleOrder(twice, { 'sec:a': true }))).toEqual(['b:y', 'b:z'])
  })
  it('is empty with nothing to show', () => {
    expect(visibleOrder([], {})).toEqual([])
    expect(visibleOrder(groups, { starred: true, 'sec:ops': true, channels: true, people: true, apps: true })).toEqual([])
  })
})

describe('the folded group a conversation hides in', () => {
  it('is the group that holds it, when that one is folded', () => {
    expect(foldedHome(groups, { channels: true }, 'b:hotel')).toBe('channels')
  })
  it('is none when its group is open', () => {
    expect(foldedHome(groups, {}, 'b:hotel')).toBeNull()
    expect(foldedHome(groups, { people: true }, 'b:hotel')).toBeNull()
    expect(foldedHome(groups, { channels: false }, 'b:hotel')).toBeNull()
  })
  it('is none when it shows in another group that is open', () => {
    const twice = [{ id: 'sec:a', items: [row('b:x'), row('b:y')] }, { id: 'sec:b', items: [row('b:y'), row('b:z')] }]
    expect(foldedHome(twice, { 'sec:a': true }, 'b:y')).toBeNull()
    expect(foldedHome(twice, { 'sec:b': true }, 'b:y')).toBeNull()
    // Folded in both: the first is the one to open.
    expect(foldedHome(twice, { 'sec:a': true, 'sec:b': true }, 'b:y')).toBe('sec:a')
  })
  it('is none for a conversation no group holds', () => {
    expect(foldedHome(groups, { channels: true }, 'b:gone')).toBeNull()
    expect(foldedHome([], {}, 'b:hotel')).toBeNull()
  })
})

describe('a step through it', () => {
  const list = visibleOrder(groups, {})
  it('goes down and up by one', () => {
    expect(step(list, 'b:ops', 1)?.key).toBe('dm:kenji')
    expect(step(list, 'b:ops', -1)?.key).toBe('b:design')
  })
  it('goes round past either end', () => {
    expect(step(list, 'app:ai', 1)?.key).toBe('b:design')
    expect(step(list, 'b:design', -1)?.key).toBe('app:ai')
  })
  it('starts at the top going down and the bottom going up when nothing here is open', () => {
    expect(step(list, null, 1)?.key).toBe('b:design')
    expect(step(list, undefined, -1)?.key).toBe('app:ai')
    // Open, but in a folded group: the same.
    expect(step(visibleOrder(groups, { channels: true }), 'b:general', 1)?.key).toBe('b:design')
  })
  it('skips to the next one the rule takes, round the end if need be', () => {
    const unread = (x: { unread: boolean }) => x.unread
    expect(step(list, 'b:design', 1, unread)?.key).toBe('dm:kenji')
    expect(step(list, 'dm:kenji', 1, unread)?.key).toBe('b:hotel')
    expect(step(list, 'b:hotel', 1, unread)?.key).toBe('dm:kenji')
    expect(step(list, 'b:design', -1, unread)?.key).toBe('b:hotel')
    expect(step(list, null, -1, unread)?.key).toBe('b:hotel')
  })
  it('comes back to the one open only when nothing else matches', () => {
    const one = [row('a'), row('b', true), row('c')]
    expect(step(one, 'b', 1, (x) => x.unread)?.key).toBe('b')
    expect(step([row('only')], 'only', -1)?.key).toBe('only')
  })
  it('is null when nothing matches, or there is nothing', () => {
    expect(step(list, 'b:ops', 1, () => false)).toBeNull()
    expect(step([], 'b:ops', 1)).toBeNull()
    expect(step([], null, -1)).toBeNull()
  })
})
