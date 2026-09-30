// A teammate as the chat shows them: what they say they are up to while it
// lasts, whether they are here, their clock, and where the card with all of
// that opens beside their name.

export interface PersonStatus { emoji?: string | null; text?: string | null; until?: string | null }

/// A status while it lasts: null once its `until` has passed, and null for
/// one that says nothing. The server leaves an expired status out when it
/// lists the team, but a list read at lunch still holds "In a meeting · until
/// 13:00" at five — and nothing reads the list again just because a clock
/// moved.
export function statusShown<S extends PersonStatus>(status: S | null | undefined, now: number): S | null {
  if (!status || (!status.emoji && !status.text)) return null
  const until = status.until ? Date.parse(status.until) : NaN
  return Number.isFinite(until) && until <= now ? null : status
}

/// "Away until Friday", while it is not Friday yet — the same rule for the
/// same reason.
export function awayShown(awayUntil: string | null | undefined, now: number): string | null {
  const until = awayUntil ? Date.parse(awayUntil) : NaN
  return Number.isFinite(until) && until > now ? awayUntil! : null
}

/// Here right now. The relay names people by login and the member list never
/// hands a browser one: both meet at the hash of the login the list carries.
export function isOnline(member: { loginHash?: string | null } | null | undefined, onlineKeys: ReadonlySet<string>): boolean {
  return Boolean(member?.loginHash && onlineKeys.has(member.loginHash))
}

/// The time where they are, as the reader writes times — or nothing, for a
/// zone this browser does not know or a person who never said.
export function localTime(zone: string | null | undefined, now: number, locale: string): string {
  if (!zone) return ''
  try { return new Date(now).toLocaleTimeString(locale, { timeZone: zone, hour: 'numeric', minute: '2-digit' }) } catch { return '' }
}

export interface Rect { left: number; top: number; right: number; bottom: number }
export interface Placement { left: number; top: number; side: 'right' | 'left' | 'below'; up: boolean }

/// Clear of every edge of the window.
const GUTTER = 16
/// Between the card and what it opened from.
const GAP = 8

/// Where a card opens beside what was clicked — a face or a name — as a chat
/// client's profile popout does: to its right, its top level with it; to its
/// left when the right has no room; under it (or over it) when neither side
/// does, as on a phone. It moves up rather than run off the bottom, and
/// never comes closer than 16px to any edge.
export function placeCard(anchor: Rect, viewport: { width: number; height: number }, size: { width: number; height: number }): Placement {
  const maxLeft = viewport.width - GUTTER - size.width
  const maxTop = viewport.height - GUTTER - size.height
  const clamp = (v: number, hi: number) => Math.max(GUTTER, Math.min(v, hi))
  const right = anchor.right + GAP
  const left = anchor.left - GAP - size.width
  if (right <= maxLeft || left >= GUTTER) {
    const up = anchor.top > maxTop
    return { left: right <= maxLeft ? right : left, top: clamp(up ? anchor.bottom - size.height : anchor.top, maxTop), side: right <= maxLeft ? 'right' : 'left', up }
  }
  const up = anchor.bottom + GAP > maxTop && anchor.top - GAP - size.height >= GUTTER
  return { left: clamp(anchor.left, maxLeft), top: clamp(up ? anchor.top - GAP - size.height : anchor.bottom + GAP, maxTop), side: 'below', up }
}
