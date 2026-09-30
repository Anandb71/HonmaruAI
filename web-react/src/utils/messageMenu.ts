import type { HTMLAttributes } from 'react'
import type { MenuEntry } from '../components/RowMenu'
import type { ChannelMessage } from '../types/card'
import { tomorrowAt } from './quiet'

// What can be done to one message, written down once. A laptop offers it
// behind the ⋯ over a message and on a right-click; a phone in the sheet a
// long press brings up. All three draw this one list, so none of them can
// offer something the others have lost.

type Translate = (english: string, vars?: Record<string, string | number>) => string
type Item = Extract<MenuEntry, { kind: 'item' }>

/// What this reader may do to the message: a callback for each thing, left
/// out when they may not (only its author edits it, say).
export interface MessageMenuActions {
  /// In a thread, where there is no thread to reply in and nothing to pin.
  inThread?: boolean
  onReply?: () => void
  onPin?: () => void
  onEdit?: () => void
  onDelete?: () => void
  onDecide?: () => void
  /// Save for later; with a time, come back as a card then.
  onLater?: (remindAt: string | null) => void
  /// Add to the clip being gathered for one decision.
  onClip?: () => void
  clipped?: boolean
  onUnread?: () => void
  onForward?: () => void
  onCopyLink?: () => void
}

export interface MessageMenuContext extends MessageMenuActions {
  t: Translate
}

/// The list, in groups with a line between them: what to do with it, when
/// to come back to it, copying its words, and, apart at the bottom, taking
/// it back. A group with nothing in it leaves no line behind.
export function messageMenuEntries(message: Pick<ChannelMessage, 'body' | 'pinned'>, c: MessageMenuContext): MenuEntry[] {
  const { t } = c
  const item = (label: string, icon: Item['icon'], data: string, onSelect: () => void, more: Partial<Item> = {}): Item => ({ kind: 'item', label, icon, data, onSelect, ...more })
  const doing: Item[] = []
  if (c.onEdit) doing.push(item(t('Edit message'), 'edit', 'edit', c.onEdit, { hint: 'E' }))
  if (c.onReply && !c.inThread) doing.push(item(t('Reply in thread'), 'message', 'reply', c.onReply, { hint: 'T' }))
  if (c.onDecide) doing.push(item(t('Make it a decision'), 'sparkle', 'decide', c.onDecide))
  if (c.onPin && !c.inThread) doing.push(item(message.pinned ? t('Unpin') : t('Pin to channel'), 'pin', 'pin', c.onPin, { hint: 'P' }))
  if (c.onClip) doing.push(item(c.clipped ? t('Remove from clip') : t('Add to clip'), 'paperclip', 'clip', c.onClip))
  if (c.onUnread) doing.push(item(t('Mark unread'), 'bell', 'unread', c.onUnread))
  if (c.onForward) doing.push(item(t('Forward'), 'send', 'forward', c.onForward))
  if (c.onCopyLink) doing.push(item(t('Copy link'), 'link', 'link', c.onCopyLink))
  const later = c.onLater
  const coming: Item[] = later ? [
    item(t('Save for later'), 'bookmark', 'later', () => later(null)),
    // The time is taken when it is picked, not when the menu was drawn.
    item(t('Remind me in 1 hour'), 'clock', 'remind-hour', () => later(new Date(Date.now() + 3600000).toISOString())),
    item(t('Remind me tomorrow at 9:00'), 'calendar', 'remind-tomorrow', () => later(tomorrowAt(9))),
  ] : []
  const copying: Item[] = message.body ? [item(t('Copy text'), 'copy', 'copy', () => { void navigator.clipboard?.writeText(message.body) })] : []
  const undoing: Item[] = c.onDelete ? [item(t('Delete message'), 'trash', 'delete', c.onDelete, { danger: true, hint: '⌫' })] : []
  const out: MenuEntry[] = []
  for (const group of [doing, coming, copying, undoing]) {
    if (!group.length) continue
    if (out.length) out.push({ kind: 'sep' })
    out.push(...group)
  }
  return out
}

/// A right-click on a message, as Discord has it: the quick reactions in a
/// row along the top, the whole picker behind the last of them, and under
/// them everything ⋯ offers.
export function messageContextEntries(
  message: Pick<ChannelMessage, 'body' | 'pinned'>,
  c: MessageMenuContext & { reactions: string[]; onReact: (emoji: string) => void; onMoreReactions?: () => void },
): MenuEntry[] {
  const more = c.onMoreReactions
  const strip: MenuEntry = { kind: 'strip', label: c.t('Add reaction'), items: [
    ...c.reactions.map((emoji) => ({ label: c.t('React with {emoji}', { emoji }), text: emoji, onSelect: () => c.onReact(emoji), data: `react:${emoji}` })),
    ...(more ? [{ label: c.t('Add reaction'), icon: 'smile' as const, onSelect: more, data: 'react-more' }] : []),
  ] }
  const rest = messageMenuEntries(message, c)
  return rest.length ? [strip, { kind: 'sep' }, ...rest] : [strip]
}

/// Where the browser's own menu is the better one: a link (open it in a new
/// tab, copy its address), a box being typed in, and what was sent to be
/// looked at — a picture attached to the message, a player. Not a picture
/// that only dresses the message (its author's face, the AI's, an emoji
/// drawn as a picture): a right-click there is on the message.
export const NATIVE_MENU_SPOT = 'a[href], input, textarea, select, .att-pic img, video, audio, iframe, canvas, [contenteditable]:not([contenteditable="false"])'

/// Whether a right-click on a message opens the message's own menu rather
/// than the browser's: not with Shift held, which is the way to the
/// browser's menu anywhere; not over a link, a box or a picture; and not
/// while some of its words are selected, which the browser's menu copies.
export function opensMessageMenu(e: { shiftKey: boolean; overNative: boolean; selected: string }): boolean {
  return !e.shiftKey && !e.overNative && !e.selected.trim()
}

/// The keyboard's way to a context menu: the menu key, or Shift+F10. With
/// Shift, the menu key keeps the browser's own, as a right-click does.
export function isMenuKey(e: { key: string; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }): boolean {
  if (e.ctrlKey || e.altKey || e.metaKey) return false
  return e.key === 'ContextMenu' ? !e.shiftKey : e.key === 'F10' && e.shiftKey
}

/// The words of this message that are selected, if any; a selection
/// somewhere else on the page is not this message's.
function selectedIn(el: Element): string {
  const sel = window.getSelection()
  return sel && !sel.isCollapsed && sel.containsNode(el, true) ? sel.toString() : ''
}

/// What was selected as a button went down for a right-click, before the
/// browser had its say. On a Mac, Chrome, Edge and Safari select the word
/// under the pointer on a right-click (or a Ctrl+click) before the menu's
/// event, so by then there always seems to be something selected over
/// words; what was selected a moment before is what the reader chose.
let pressed: { el: Element; selected: string; range: Range | null } | null = null

/// Puts back what was selected before the right-click (mostly nothing but
/// a caret) in place of the word the browser selected on the way to its
/// menu, which is not ours to leave lit.
function putBack(range: Range | null) {
  const sel = window.getSelection()
  if (!sel) return
  sel.removeAllRanges()
  if (range) sel.addRange(range)
}

/// A laptop's ways into a message's menu, for its element — what longPress
/// is on a phone. A right-click opens it where the pointer is; the menu key
/// or Shift+F10, on the message or anything in it with the focus, under
/// its first line. `open` is handed the place and the element's id.
export function messageMenuTriggers(open: ((at: { x: number; y: number }, anchor: string) => void) | undefined): HTMLAttributes<HTMLElement> {
  if (!open) return {}
  const ours = (el: HTMLElement, target: EventTarget | null, shiftKey: boolean, selected: string) => {
    // React hands a message the events of what it draws elsewhere through a
    // portal as well (a picture opened over the whole page), which are not
    // the message's: the browser's menu stays theirs, and a key there is
    // theirs to use.
    if (!el.contains(target as Node | null)) return false
    // Only what is inside this message counts, not whatever holds it.
    const spot = (target as Element | null)?.closest?.(NATIVE_MENU_SPOT)
    return opensMessageMenu({ shiftKey, overNative: Boolean(spot && el.contains(spot)), selected })
  }
  return {
    // Before the browser selects anything for a right-click: the right
    // button, or Ctrl with the main one, which is a Mac's right-click.
    onMouseDownCapture: (e) => {
      if (e.button !== 2 && !(e.button === 0 && e.ctrlKey)) { pressed = null; return }
      const sel = window.getSelection()
      pressed = { el: e.currentTarget, selected: selectedIn(e.currentTarget), range: sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null }
    },
    onContextMenu: (e) => {
      // Decided on what was selected when the button went down on this
      // message, where it did, not on what the browser has chosen since.
      const press = pressed?.el === e.currentTarget ? pressed : null
      pressed = null
      if (!ours(e.currentTarget, e.target, e.shiftKey, press ? press.selected : selectedIn(e.currentTarget))) return
      e.preventDefault()
      if (press) putBack(press.range)
      open({ x: e.clientX, y: e.clientY }, e.currentTarget.id)
    },
    onKeyDown: (e) => {
      if (!isMenuKey(e) || !ours(e.currentTarget, e.target, false, selectedIn(e.currentTarget))) return
      // Taken here, so the browser's own menu does not follow the key.
      e.preventDefault()
      const box = (e.currentTarget.querySelector('.slk-body') || e.currentTarget).getBoundingClientRect()
      open({ x: box.left, y: Math.min(box.bottom, box.top + 24) }, e.currentTarget.id)
    },
  }
}
