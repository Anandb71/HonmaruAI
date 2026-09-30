// Somebody typing, the way Discord shows it: "Aki is typing…" just above
// the box of the conversation, or the thread, they are typing in.
//
// This browser tells the relay when its person starts typing, again every
// few seconds while they go on, and when they stop: the message sent, the
// box emptied or left. The relay tells whoever can read that conversation.
// A line lasts a few seconds past the last word from its typist, so a stop
// that never comes (a tab closed, a socket gone) cannot leave it for ever,
// and their message arriving ends it at once.

import { t } from './i18n'

/// What the relay says: who is typing where, in this browser's name for
/// the conversation; `stop` when they are done.
export interface TypingEvent {
  channel: string
  parentId?: string | null
  who: { ref: string | null; name: string }
  stop?: boolean
}

/// One person typing in one place, until a moment this browser keeps.
export interface Typist { channel: string; parentId: string | null; ref: string; name: string; until: number }

/// Where this browser's person is typing: a conversation, or a thread in it.
export interface Place { channel: string; parentId: string | null }
/// The last "typing" this browser sent, and when.
export interface Outgoing extends Place { at: number }
export interface Signal { type: 'typing' | 'typing_stop'; place: Place }

/// How often this browser says its person is still typing.
export const TYPING_EVERY_MS = 3000
/// How long a line lasts without hearing from its typist again: twice the
/// interval, so one signal lost on the way does not make it flicker.
export const TYPING_TTL_MS = 6000
/// The least time between two things a screen reader is told.
export const ANNOUNCE_GAP_MS = 5000

const at = (list: Typist[], channel: string, parentId: string | null, ref: string) =>
  list.findIndex((x) => x.channel === channel && x.parentId === parentId && x.ref === ref)

/// Heard from the relay: someone started, kept on, or stopped. A typist
/// keeps their place in the line while they go on.
export function heard(list: Typist[], e: TypingEvent | null | undefined, now: number): Typist[] {
  const ref = e?.who?.ref
  if (!e?.channel || !ref) return list
  const parentId = e.parentId || null
  const i = at(list, e.channel, parentId, ref)
  if (e.stop) return i < 0 ? list : list.filter((_, j) => j !== i)
  if (!e.who.name) return list
  const typist = { channel: e.channel, parentId, ref, name: e.who.name, until: now + TYPING_TTL_MS }
  return i < 0 ? [...list, typist] : list.map((x, j) => (j === i ? typist : x))
}

/// Their message arrived where they were typing: not typing it any more.
export function said(list: Typist[], m: { channel: string; parentId?: string | null; authorRef: string | null }): Typist[] {
  if (!m.authorRef) return list
  return heard(list, { channel: m.channel, parentId: m.parentId, who: { ref: m.authorRef, name: '' }, stop: true }, 0)
}

/// Those not heard from for too long, gone.
export function expire(list: Typist[], now: number): Typist[] {
  const kept = list.filter((x) => x.until > now)
  return kept.length === list.length ? list : kept
}

/// When the next line runs out, or null when there is none.
export function nextExpiry(list: Typist[]): number | null {
  return list.length ? Math.min(...list.map((x) => x.until)) : null
}

/// Who is typing in one place, leaving out whoever is reading it.
export function typistsIn(list: Typist[], place: Place, now: number, me?: string | null): Typist[] {
  return list.filter((x) => x.channel === place.channel && x.parentId === (place.parentId || null) && x.until > now && x.ref !== me)
}

/// The line itself: one name, two, or more than that.
export function typingLine(names: string[]): string {
  if (!names.length) return ''
  if (names.length === 1) return t('{name} is typing…', { name: names[0] })
  if (names.length === 2) return t('{a} and {b} are typing…', { a: names[0], b: names[1] })
  return t('Several people are typing…')
}

const samePlace = (a: Place, b: Place) => a.channel === b.channel && (a.parentId || null) === (b.parentId || null)
const placeOf = (o: Outgoing): Place => ({ channel: o.channel, parentId: o.parentId })

/// What to tell the relay when the box in `place` now holds `text`:
/// "typing" when it starts and again every few seconds while it goes on,
/// and a stop when it empties or turns into a command, which is nobody
/// else's to see. Commands are run from a conversation's box only: in a
/// thread a '/' is sent as it is, so it is typing like anything else.
/// Typing somewhere else first stops it where it was. A conversation with
/// an agent has nobody else in it to tell.
export function typedIn(prev: Outgoing | null, place: Place, text: string, now: number): { next: Outgoing | null; send: Signal[] } {
  const send: Signal[] = []
  const here = prev !== null && samePlace(prev, place)
  if (prev && !here) send.push({ type: 'typing_stop', place: placeOf(prev) })
  const command = !place.parentId && text.trimStart().startsWith('/')
  const quiet = !text.trim() || command || place.channel.startsWith('ag:')
  if (quiet) {
    if (here) send.push({ type: 'typing_stop', place: placeOf(prev!) })
    return { next: null, send }
  }
  if (here && now - prev!.at < TYPING_EVERY_MS) return { next: prev, send }
  send.push({ type: 'typing', place: { channel: place.channel, parentId: place.parentId || null } })
  return { next: { channel: place.channel, parentId: place.parentId || null, at: now }, send }
}

/// Done typing — sent, left the box, closed the conversation: a stop, only
/// where a start was sent. Without a place, wherever that was.
export function stoppedIn(prev: Outgoing | null, place?: Place): { next: Outgoing | null; send: Signal[] } {
  if (!prev || (place && !samePlace(prev, place))) return { next: prev, send: [] }
  return { next: null, send: [{ type: 'typing_stop', place: placeOf(prev) }] }
}

/// What a screen reader was last told, and when.
export interface Announced { text: string; at: number }

/// What a screen reader is told now: the line, when it says something new
/// and the last thing was said long enough ago; otherwise what it was told
/// before. Emptying it tells nobody anything, so it is done at once and
/// does not restart the clock.
export function announce(last: Announced, line: string, now: number): Announced {
  if (line === last.text) return last
  if (!line) return { text: '', at: last.at }
  if (now - last.at < ANNOUNCE_GAP_MS) return last
  return { text: line, at: now }
}

/// Hand a typing signal to the relay, through whoever holds the socket.
export function sendTyping(s: Signal): void {
  window.dispatchEvent(new CustomEvent('honmaru:typing-send', { detail: { channel: s.place.channel, parentId: s.place.parentId, stop: s.type === 'typing_stop' } }))
}
