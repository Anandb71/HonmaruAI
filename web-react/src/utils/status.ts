// Your status, as a chat client sets it: an emoji and a few words until
// when, and "away until" a day with somebody deciding in your place
// meanwhile. PUT /channels/status takes all of it at once
// (worker/src/channelRoutes.js), and people.js `setStatus` holds it to the
// limits mirrored here, so the popover says no before the server does.

/// The most of each the Worker keeps. It cuts anything longer, which can
/// leave half an emoji, so the popover refuses instead.
export const EMOJI_MAX = 16
export const TEXT_MAX = 100
/// Every time the Worker takes is after now and within a year of it.
const YEAR_MS = 366 * 86400000

export type ClearAfter = 'never' | '30m' | '1h' | '2h' | '4h' | 'today' | 'week'

/// "Clear after", in the order the menu offers it. Two hours is there
/// because Focusing lasts that long, and the menu has to be able to say so.
export const CLEAR_AFTER: ReadonlyArray<{ id: ClearAfter; label: string }> = [
  { id: 'never', label: 'Don’t clear' },
  { id: '30m', label: '30 minutes' },
  { id: '1h', label: '1 hour' },
  { id: '2h', label: '2 hours' },
  { id: '4h', label: '4 hours' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
]

export interface StatusPreset { emoji: string; text: string; clear: ClearAfter }

/// The ones most people reach for. `text` is the English key it is
/// translated by; what is saved is the words as the person reads them.
export const STATUS_PRESETS: ReadonlyArray<StatusPreset> = [
  { emoji: '📅', text: 'In a meeting', clear: '1h' },
  { emoji: '🎧', text: 'Focusing', clear: '2h' },
  { emoji: '🤒', text: 'Out sick', clear: 'today' },
  { emoji: '🌴', text: 'On vacation', clear: 'never' },
]

/// Your own settings, as GET /channels gives them under `mine`.
export interface MyStatus {
  status: { emoji: string | null; text: string | null; until: string | null } | null
  awayUntil: string | null
  delegateRef: string | null
}

/// What the popover holds while you edit: the fields as typed.
export interface StatusDraft {
  emoji: string
  text: string
  /// When the status goes: a choice from the menu, or `keep` for the time a
  /// status already set carries (`keepUntil`).
  clear: ClearAfter | 'keep'
  keepUntil: string | null
  away: boolean
  /// The last day away, as a date field writes it: YYYY-MM-DD.
  awayDate: string
  /// Who decides meanwhile, as a member ref; '' for nobody.
  delegateRef: string
}

/// The body PUT /channels/status takes.
export interface StatusPayload {
  orgId: string
  emoji: string | null
  text: string | null
  until: string | null
  awayUntil: string | null
  delegateRef: string | null
}

const pad = (n: number) => String(n).padStart(2, '0')

/// A day as a date field writes it, in this browser's time.
export function dayOf(at: Date): string {
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
}

const MINUTES: Partial<Record<ClearAfter, number>> = { '30m': 30, '1h': 60, '2h': 120, '4h': 240 }

/// When a status set now clears, or null for never. "Today" ends at
/// midnight tonight and "This week" at midnight at the end of Sunday, this
/// browser's time — counted in calendar days, so a clock change on the way
/// does not move it.
export function clearAfterTime(clear: ClearAfter, now: Date): string | null {
  if (clear === 'never') return null
  const minutes = MINUTES[clear]
  if (minutes) return new Date(now.getTime() + minutes * 60000).toISOString()
  const days = clear === 'today' ? 1 : 1 + ((7 - now.getDay()) % 7)
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days).toISOString()
}

/// Away until a day means through the end of it: 23:59 that day, this
/// browser's time, which every screen reads back as that date.
export function awayUntilTime(day: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!m) return null
  const at = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59)
  return Number.isNaN(at.getTime()) ? null : at.toISOString()
}

/// Your settings as the server has them, as a draft to edit. A status that
/// clears at a time keeps that time until you pick another; a new one
/// clears tonight unless you say otherwise.
export function draftFromMine(mine: MyStatus | null | undefined): StatusDraft {
  const s = mine?.status
  const away = mine?.awayUntil ? new Date(mine.awayUntil) : null
  return {
    emoji: s?.emoji || '',
    text: s?.text || '',
    clear: s?.until ? 'keep' : s ? 'never' : 'today',
    keepUntil: s?.until || null,
    away: Boolean(away),
    awayDate: away ? dayOf(away) : '',
    delegateRef: away ? mine?.delegateRef || '' : '',
  }
}

/// A preset, put into the draft: its emoji, its words in the reader's
/// language, and how long it lasts. Being away is left as it was.
export function applyPreset(draft: StatusDraft, preset: StatusPreset, t: (key: string) => string): StatusDraft {
  return { ...draft, emoji: preset.emoji, text: t(preset.text), clear: preset.clear, keepUntil: null }
}

/// The body for PUT /channels/status. The Worker replaces every field at
/// once, so a status goes with the away settings beside it, and clearing
/// the status is this with its emoji and words taken out.
export function statusPayload(orgId: string, draft: StatusDraft, now: Date): StatusPayload {
  const emoji = draft.emoji.trim() || null
  const text = draft.text.trim() || null
  const awayUntil = draft.away ? awayUntilTime(draft.awayDate) : null
  return {
    orgId,
    emoji,
    text,
    until: emoji || text ? (draft.clear === 'keep' ? draft.keepUntil : clearAfterTime(draft.clear, now)) : null,
    awayUntil,
    delegateRef: awayUntil ? draft.delegateRef || null : null,
  }
}

/// Why the Worker would refuse this, as the words to translate — or null
/// when it would take it. The limits are people.js `setStatus`'s, and the
/// route's rule that nobody decides in their own place.
export function statusProblem(draft: StatusDraft, now: Date, myRef: string | null = null): string | null {
  const p = statusPayload('', draft, now)
  if (p.emoji && p.emoji.length > EMOJI_MAX) return 'Use a shorter emoji.'
  if (p.text && p.text.length > TEXT_MAX) return 'Keep it to {n} characters.'
  if (draft.away && !p.awayUntil) return 'Pick a day.'
  for (const at of [p.until, p.awayUntil]) {
    const ms = at ? Date.parse(at) : NaN
    if (at && !(ms > now.getTime() && ms < now.getTime() + YEAR_MS)) return 'Pick a time within the next year.'
  }
  if (p.delegateRef && p.delegateRef === myRef) return 'Pick somebody else in this workspace.'
  return null
}

/// When a status clears, short: the weekday and time within the week
/// ahead, the date and time after that.
export function whenLabel(iso: string, now: Date, locale: string): string {
  const at = new Date(iso)
  const soon = at.getTime() - now.getTime() < 6 * 86400000
  return at.toLocaleString(locale, soon
    ? { weekday: 'short', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
