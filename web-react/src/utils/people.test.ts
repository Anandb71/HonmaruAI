import { describe, it, expect } from 'vitest'
import { statusShown, awayShown, isOnline, byPresence, localTime, placeCard } from './people'

const at = (iso: string) => Date.parse(iso)

// A status says what somebody is up to until a time, and not after it.
describe('statusShown', () => {
  const now = at('2026-10-01T12:00:00Z')
  it('keeps a status with no end, or an end still to come', () => {
    const lunch = { emoji: '🍜', text: 'Lunch', until: '2026-10-01T13:00:00Z' }
    expect(statusShown(lunch, now)).toBe(lunch)
    expect(statusShown({ emoji: '🌴', text: null, until: null }, now)).toEqual({ emoji: '🌴', text: null, until: null })
  })
  it('drops one whose time is up, to the minute', () => {
    expect(statusShown({ emoji: '📅', text: 'In a meeting', until: '2026-10-01T11:00:00Z' }, now)).toBeNull()
    expect(statusShown({ emoji: '📅', text: 'In a meeting', until: '2026-10-01T12:00:00Z' }, now)).toBeNull()
  })
  it('shows nothing for nothing, and does not trip on an end it cannot read', () => {
    expect(statusShown(null, now)).toBeNull()
    expect(statusShown(undefined, now)).toBeNull()
    expect(statusShown({ emoji: null, text: '', until: null }, now)).toBeNull()
    expect(statusShown({ emoji: '🎧', text: null, until: 'soon' }, now)).not.toBeNull()
  })
})

describe('awayShown', () => {
  const now = at('2026-10-01T12:00:00Z')
  it('is away until the day comes, then not', () => {
    expect(awayShown('2026-10-03T00:00:00Z', now)).toBe('2026-10-03T00:00:00Z')
    expect(awayShown('2026-09-30T00:00:00Z', now)).toBeNull()
    expect(awayShown(null, now)).toBeNull()
  })
})

// The relay names logins; the member list carries their hash.
describe('isOnline', () => {
  const here = new Set(['a1b2c3d4e5f60718'])
  it('matches by the hash of the login', () => {
    expect(isOnline({ loginHash: 'a1b2c3d4e5f60718' }, here)).toBe(true)
    expect(isOnline({ loginHash: 'ffffffffffffffff' }, here)).toBe(false)
  })
  it('is never online without a hash to match', () => {
    expect(isOnline({ loginHash: '' }, here)).toBe(false)
    expect(isOnline(undefined, here)).toBe(false)
    expect(isOnline(null, new Set(['']))).toBe(false)
  })
})

// A channel's members: who is here first, as a chat client lists them.
describe('byPresence', () => {
  const people = [{ ref: 'a' }, { ref: 'b', you: true }, { ref: 'c' }, { ref: 'd' }]
  it('puts who is here first and keeps each group in the order given', () => {
    const { online, offline } = byPresence(people, new Set(['d', 'a']))
    expect(online.map((p) => p.ref)).toEqual(['a', 'b', 'd'])
    expect(offline.map((p) => p.ref)).toEqual(['c'])
  })
  it('counts you as here when the relay has said nothing', () => {
    expect(byPresence(people, new Set()).online.map((p) => p.ref)).toEqual(['b'])
  })
})

describe('localTime', () => {
  const now = at('2026-10-01T12:05:00Z')
  // ICU puts a narrow space before PM; which one is its business.
  const plain = (s: string) => s.replace(/\s/g, ' ')
  it('tells the time where they are', () => {
    expect(plain(localTime('Asia/Tokyo', now, 'en-US'))).toBe('9:05 PM')
    expect(plain(localTime('UTC', now, 'en-US'))).toBe('12:05 PM')
  })
  it('says nothing for a zone nobody gave, or one that does not exist', () => {
    expect(localTime(null, now, 'en-US')).toBe('')
    expect(localTime('Mars/Olympus', now, 'en-US')).toBe('')
  })
})

// The popout opens beside what was clicked and stays 16px inside the window.
describe('placeCard', () => {
  const viewport = { width: 1280, height: 800 }
  const size = { width: 300, height: 360 }
  const box = (left: number, top: number, w = 36, h = 36) => ({ left, top, right: left + w, bottom: top + h })

  it('opens to the right, level with the face', () => {
    expect(placeCard(box(300, 200), viewport, size)).toEqual({ left: 344, top: 200, side: 'right', up: false })
  })
  it('opens to the left when the right has no room', () => {
    expect(placeCard(box(1000, 200), viewport, size)).toEqual({ left: 692, top: 200, side: 'left', up: false })
  })
  it('moves up rather than run off the bottom, ending level with the face', () => {
    expect(placeCard(box(300, 700), viewport, size)).toEqual({ left: 344, top: 376, side: 'right', up: true })
  })
  it('keeps 16px from the top however little room there is', () => {
    const tall = { width: 300, height: 760 }
    expect(placeCard(box(300, 400), viewport, tall).top).toBe(16)
    expect(placeCard(box(300, 4), viewport, size).top).toBe(16)
  })
  it('opens under the face when neither side has room, and over it near the bottom', () => {
    const phone = { width: 375, height: 700 }
    const card = { width: 320, height: 300 }
    expect(placeCard(box(16, 100), phone, card)).toEqual({ left: 16, top: 144, side: 'below', up: false })
    expect(placeCard(box(40, 500), phone, card)).toEqual({ left: 39, top: 192, side: 'below', up: true })
  })
  it('never starts left of the gutter on a window narrower than the card', () => {
    const p = placeCard(box(10, 100), { width: 300, height: 700 }, { width: 320, height: 300 })
    expect(p.left).toBe(16)
  })
})
