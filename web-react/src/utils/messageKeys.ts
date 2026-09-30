// Keys on a message, as in Discord: with a message picked in the log (the
// row itself focused), ↑ and ↓ move between messages and one key does what
// its ⋯ menu does — the letters the menu already shows beside each item.
// Pure, so what a key may do to which message is tested without a browser;
// ClassicList finds the message and does it.

export type MessageKey = 'prev' | 'next' | 'edit' | 'thread' | 'pin' | 'react' | 'delete' | 'composer'

/// What decides a key press: the key and what was held with it. A
/// KeyboardEvent is one.
export interface KeyLike {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  isComposing?: boolean
  keyCode?: number
}

/// As much of a message as decides what a key may do to it.
export interface KeyedMessage {
  kind: string
  mine: boolean
  deleted?: boolean
  parentId?: string | null
}

/// What a key does to the focused message, or null when it is not ours to
/// answer. `m` is null for a row that is not a message (a decision card):
/// it can still be moved past, and left for the composer.
/// `inThread`: the row is in a thread's pane, where there is no thread to
/// open and nothing to pin — as its ⋯ menu has neither.
export function messageKeyAction(ev: KeyLike, m: KeyedMessage | null, inThread = false): MessageKey | null {
  // ⌘, Ctrl and ⌥ belong to the browser and the app (⌥↑ is the next
  // conversation); a key an IME is still converting is the IME's. Safari
  // reports the key that ends a conversion as 229, not as composing.
  if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing || ev.keyCode === 229) return null
  // ⇧ with an arrow selects text, and ⇧Esc marks everything read.
  if (ev.key === 'ArrowUp') return ev.shiftKey ? null : 'prev'
  if (ev.key === 'ArrowDown') return ev.shiftKey ? null : 'next'
  if (ev.key === 'Escape') return ev.shiftKey ? null : 'composer'
  // An unsent message has nothing left to do to it.
  if (!m || m.deleted) return null
  const threaded = inThread || Boolean(m.parentId)
  // Only your own words are yours to change or take back.
  const own = m.mine && m.kind === 'message'
  switch (ev.key.toLowerCase()) {
    case 'e': return own ? 'edit' : null
    case 't': return threaded ? null : 'thread'
    case 'p': return threaded ? null : 'pin'
    case '+': return 'react'
    case 'backspace':
    case 'delete': return own ? 'delete' : null
    default: return null
  }
}

/// The message an article in the log is: its id is "msg-<id>", and the
/// first message of a thread's pane is "msg-thread-<id>" so the same
/// message in the conversation beside it keeps its own.
export function messageIdOf(elementId: string): string | null {
  const m = /^msg-(?:thread-)?(.+)$/.exec(elementId)
  return m ? m[1] : null
}

/// As much of a message as decides what deleting it asks.
export interface DeletedMessage {
  parentId?: string | null
  replyCount?: number
  replyRefs?: string[]
}

/// Somebody other than you answered in this message's thread: deleting it
/// takes their words too.
export function othersReplied(m: DeletedMessage, myRef: string | undefined): boolean {
  return !m.parentId && (m.replyRefs || []).some((r) => r !== myRef)
}

/// What deleting a message warns, in English (the key for `t`), the more
/// it takes with it the plainer.
export function deleteWarning(m: DeletedMessage, myRef: string | undefined): string {
  if (othersReplied(m, myRef)) return 'Delete this message and its thread? Replies from others will be deleted too. This cannot be undone.'
  if (m.replyCount) return 'Delete this message and its thread? This cannot be undone.'
  return 'Delete this message? This cannot be undone.'
}

/// ⇧ skips the question, as in Discord — except when others replied:
/// their words go only when you say so outright.
export function skipsDeleteConfirm(shift: boolean, m: DeletedMessage, myRef: string | undefined): boolean {
  return shift && !othersReplied(m, myRef)
}

/// The start of a message, for the delete question to show which one it
/// is: whole characters as a reader counts them (an emoji, even one made
/// of several, is not cut in two), and "…" when there was more.
export function previewText(body: string, max = 200): string {
  const text = body.trim()
  const chars = typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (s) => s.segment)
    : Array.from(text)
  return chars.length > max ? `${chars.slice(0, max).join('').trimEnd()}…` : text
}
