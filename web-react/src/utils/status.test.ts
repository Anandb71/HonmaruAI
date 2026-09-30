import { describe, it, expect } from 'vitest'
import {
  CLEAR_AFTER, STATUS_PRESETS, EMOJI_MAX, TEXT_MAX,
  applyPreset, awayUntilTime, clearAfterTime, dayOf, draftFromMine, liveDraft, popoverKey, statusPayload, statusProblem, whenLabel,
} from './status'
import type { StatusDraft } from './status'

// Built from the calendar in this machine's time, so the tests hold in any zone.
const wednesday = new Date(2026, 8, 30, 10, 15) // Wednesday 30 September, 10:15
const iso = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m, d, h, min).toISOString()
const draft = (over: Partial<StatusDraft> = {}): StatusDraft => ({
  emoji: '', text: '', clear: 'today', keepUntil: null, away: false, awayDate: '', delegateRef: '', ...over,
})

describe('clear after', () => {
  it('counts minutes from now, and never is never', () => {
    expect(clearAfterTime('never', wednesday)).toBeNull()
    expect(clearAfterTime('30m', wednesday)).toBe(new Date(wednesday.getTime() + 30 * 60000).toISOString())
    expect(clearAfterTime('1h', wednesday)).toBe(new Date(wednesday.getTime() + 3600000).toISOString())
    expect(clearAfterTime('2h', wednesday)).toBe(new Date(wednesday.getTime() + 2 * 3600000).toISOString())
    expect(clearAfterTime('4h', wednesday)).toBe(new Date(wednesday.getTime() + 4 * 3600000).toISOString())
  })

  it('ends today at midnight, and this week at the end of Sunday', () => {
    expect(clearAfterTime('today', wednesday)).toBe(iso(2026, 9, 1))
    expect(clearAfterTime('week', wednesday)).toBe(iso(2026, 9, 5))
    const sunday = new Date(2026, 9, 4, 22, 0)
    expect(clearAfterTime('week', sunday)).toBe(iso(2026, 9, 5))
    const monday = new Date(2026, 9, 5, 0, 30)
    expect(clearAfterTime('week', monday)).toBe(iso(2026, 9, 12))
  })

  it('offers every duration a preset uses, in the menu’s order', () => {
    expect(CLEAR_AFTER.map((c) => c.label)).toEqual(['Don’t clear', '30 minutes', '1 hour', '2 hours', '4 hours', 'Today', 'This week'])
    for (const p of STATUS_PRESETS) expect(CLEAR_AFTER.some((c) => c.id === p.clear)).toBe(true)
  })
})

describe('away until', () => {
  it('runs through the end of the day picked', () => {
    expect(awayUntilTime('2026-10-03')).toBe(iso(2026, 9, 3, 23, 59))
    expect(dayOf(new Date(awayUntilTime('2026-10-03')!))).toBe('2026-10-03')
  })

  it('is nothing without a day', () => {
    expect(awayUntilTime('')).toBeNull()
    expect(awayUntilTime('next week')).toBeNull()
  })
})

describe('the draft', () => {
  it('starts empty, clearing tonight, when nothing is set', () => {
    expect(draftFromMine(null)).toEqual(draft())
    expect(draftFromMine({ status: null, awayUntil: null, delegateRef: 'r1' })).toEqual(draft())
  })

  it('keeps the time a status already clears at, and the day you are back', () => {
    const until = iso(2026, 8, 30, 15, 0)
    const awayUntil = iso(2026, 9, 3, 23, 59)
    expect(draftFromMine({ status: { emoji: '📅', text: 'Standup', until }, awayUntil, delegateRef: 'r2' })).toEqual(draft({
      emoji: '📅', text: 'Standup', clear: 'keep', keepUntil: until, away: true, awayDate: '2026-10-03', delegateRef: 'r2',
    }))
    expect(draftFromMine({ status: { emoji: null, text: 'Heads down', until: null }, awayUntil: null, delegateRef: null }).clear).toBe('never')
  })

  it('takes a preset in the reader’s words, and leaves being away alone', () => {
    const away = draft({ away: true, awayDate: '2026-10-03', delegateRef: 'r2', clear: 'keep', keepUntil: iso(2026, 8, 30, 15, 0) })
    const words: Record<string, string> = { Focusing: '集中作業中' }
    expect(applyPreset(away, STATUS_PRESETS[1], (k) => words[k] || k)).toEqual({
      ...away, emoji: '🎧', text: '集中作業中', clear: '2h', keepUntil: null,
    })
  })
})

describe('a time already set, once it has passed', () => {
  const keepUntil = iso(2026, 8, 30, 9, 0)
  it('is no longer offered, and a status kept to it clears tonight', () => {
    expect(liveDraft(draft({ text: 'Standup', clear: 'keep', keepUntil }), wednesday)).toEqual(draft({ text: 'Standup', clear: 'today', keepUntil: null }))
  })

  it('leaves another choice as it is', () => {
    expect(liveDraft(draft({ text: 'Standup', clear: '1h', keepUntil }), wednesday)).toEqual(draft({ text: 'Standup', clear: '1h', keepUntil: null }))
  })

  it('keeps a time still to come', () => {
    const later = draft({ text: 'Standup', clear: 'keep', keepUntil: iso(2026, 8, 30, 15, 0) })
    expect(liveDraft(later, wednesday)).toBe(later)
  })
})

describe('what is sent', () => {
  it('trims what was typed, and gives a clearing time only to something said', () => {
    expect(statusPayload('org', draft({ emoji: ' 📅 ', text: ' In a meeting ', clear: '1h' }), wednesday)).toEqual({
      orgId: 'org', emoji: '📅', text: 'In a meeting', until: new Date(wednesday.getTime() + 3600000).toISOString(), awayUntil: null, delegateRef: null,
    })
    expect(statusPayload('org', draft({ emoji: '  ', text: '', clear: '1h' }), wednesday)).toEqual({
      orgId: 'org', emoji: null, text: null, until: null, awayUntil: null, delegateRef: null,
    })
    const keepUntil = iso(2026, 8, 30, 15, 0)
    expect(statusPayload('org', draft({ text: 'Standup', clear: 'keep', keepUntil }), wednesday).until).toBe(keepUntil)
  })

  it('sends the away settings with every save, since the server replaces them all', () => {
    const away = draft({ away: true, awayDate: '2026-10-03', delegateRef: 'r2' })
    expect(statusPayload('org', { ...away, emoji: '🌴', text: 'On vacation', clear: 'never' }, wednesday)).toEqual({
      orgId: 'org', emoji: '🌴', text: 'On vacation', until: null, awayUntil: iso(2026, 9, 3, 23, 59), delegateRef: 'r2',
    })
    // Clearing the status is the same save with the words out: still away.
    expect(statusPayload('org', { ...away, emoji: '', text: '' }, wednesday)).toMatchObject({ emoji: null, text: null, until: null, awayUntil: iso(2026, 9, 3, 23, 59), delegateRef: 'r2' })
  })

  it('names nobody to decide when you are not away', () => {
    expect(statusPayload('org', draft({ away: false, awayDate: '2026-10-03', delegateRef: 'r2' }), wednesday)).toMatchObject({ awayUntil: null, delegateRef: null })
    expect(statusPayload('org', draft({ away: true, awayDate: '2026-10-03', delegateRef: '' }), wednesday).delegateRef).toBeNull()
  })
})

describe('what the server would refuse', () => {
  it('takes a status and an away within the limits', () => {
    expect(statusProblem(draft({ emoji: '📅', text: 'x'.repeat(TEXT_MAX), clear: 'week', away: true, awayDate: '2026-10-03', delegateRef: 'r2' }), wednesday, 'me')).toBeNull()
  })

  it('refuses what the server would cut', () => {
    expect(statusProblem(draft({ emoji: '🎉'.repeat(EMOJI_MAX / 2 + 1) }), wednesday)).toBe('Use a shorter emoji.')
    expect(statusProblem(draft({ text: 'x'.repeat(TEXT_MAX + 1) }), wednesday)).toBe('Keep it to {n} characters.')
  })

  it('asks for a day when you say you are away', () => {
    expect(statusProblem(draft({ away: true, awayDate: '' }), wednesday)).toBe('Pick a day.')
  })

  it('refuses a time already gone, or more than a year out', () => {
    expect(statusProblem(draft({ away: true, awayDate: '2026-09-29' }), wednesday)).toBe('Pick a time within the next year.')
    expect(statusProblem(draft({ away: true, awayDate: '2027-10-01' }), wednesday)).toBe('Pick a time within the next year.')
    expect(statusProblem(draft({ away: true, awayDate: dayOf(wednesday) }), wednesday)).toBeNull()
  })

  it('lets a status whose time has passed be saved, clearing tonight', () => {
    // It was to clear at 9:00; it is 10:15 now. Saving it again is not refused.
    const gone = draft({ text: 'Standup', clear: 'keep', keepUntil: iso(2026, 8, 30, 9, 0) })
    expect(statusProblem(gone, wednesday)).toBeNull()
    expect(statusPayload('org', gone, wednesday).until).toBe(iso(2026, 9, 1))
  })

  it('refuses you deciding in your own place', () => {
    expect(statusProblem(draft({ away: true, awayDate: '2026-10-03', delegateRef: 'me' }), wednesday, 'me')).toBe('Pick somebody else in this workspace.')
  })
})

describe('the keys the popover answers', () => {
  const inside = { inside: true, modal: false }
  it('closes on Escape from inside it or its avatar', () => {
    expect(popoverKey({ key: 'Escape' }, inside)).toBe('close')
  })

  it('leaves Escape to the page when focus is elsewhere', () => {
    expect(popoverKey({ key: 'Escape' }, { inside: false, modal: false })).toBeNull()
  })

  it('leaves Escape to ⌘K or the shortcuts when they are open over it', () => {
    expect(popoverKey({ key: 'Escape' }, { inside: true, modal: true })).toBeNull()
    expect(popoverKey({ key: 'Escape' }, { inside: false, modal: true })).toBeNull()
  })

  it('makes way for ⌘K and ⌘/ pressed from inside it', () => {
    expect(popoverKey({ key: 'k', metaKey: true }, inside)).toBe('make-way')
    expect(popoverKey({ key: 'K', ctrlKey: true }, inside)).toBe('make-way')
    expect(popoverKey({ key: '/', metaKey: true }, inside)).toBe('make-way')
    expect(popoverKey({ key: 'k', metaKey: true }, { inside: false, modal: false })).toBeNull()
  })

  it('leaves Escape to an input method still composing', () => {
    expect(popoverKey({ key: 'Escape', isComposing: true }, inside)).toBeNull()
    // Safari says so by keyCode alone, on the keydown that ends it.
    expect(popoverKey({ key: 'Escape', keyCode: 229 }, inside)).toBeNull()
    expect(popoverKey({ key: 'Escape', keyCode: 27 }, inside)).toBe('close')
  })

  it('ignores the letters typed into it', () => {
    expect(popoverKey({ key: 'k' }, inside)).toBeNull()
    expect(popoverKey({ key: '/' }, inside)).toBeNull()
    expect(popoverKey({ key: 'Enter' }, inside)).toBeNull()
  })
})

describe('when it clears, in words', () => {
  it('says the weekday and time this week, and the date after that', () => {
    const soon = iso(2026, 9, 1, 9, 0)
    expect(whenLabel(soon, wednesday, 'en-US')).toBe(new Date(soon).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }))
    const later = iso(2026, 9, 20, 9, 0)
    expect(whenLabel(later, wednesday, 'en-US')).toBe(new Date(later).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))
  })
})
