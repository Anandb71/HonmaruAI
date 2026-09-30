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
/// tab, copy its address), a box being typed in, a picture or a player.
export const NATIVE_MENU_SPOT = 'a[href], input, textarea, select, img, video, audio, iframe, canvas, [contenteditable]:not([contenteditable="false"])'

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

/// A laptop's ways into a message's menu, for its element — what longPress
/// is on a phone. A right-click opens it where the pointer is; the menu key
/// or Shift+F10, on the message or anything in it with the focus, under
/// its first line. `open` is handed the place and the element's id.
export function messageMenuTriggers(open: ((at: { x: number; y: number }, anchor: string) => void) | undefined): HTMLAttributes<HTMLElement> {
  if (!open) return {}
  const ours = (el: HTMLElement, target: EventTarget | null, shiftKey: boolean) => {
    // Only what is inside this message counts, not whatever holds it.
    const spot = (target as Element | null)?.closest?.(NATIVE_MENU_SPOT)
    const sel = window.getSelection()
    return opensMessageMenu({
      shiftKey,
      overNative: Boolean(spot && el.contains(spot)),
      selected: sel && !sel.isCollapsed && sel.containsNode(el, true) ? sel.toString() : '',
    })
  }
  return {
    onContextMenu: (e) => {
      if (!ours(e.currentTarget, e.target, e.shiftKey)) return
      e.preventDefault()
      open({ x: e.clientX, y: e.clientY }, e.currentTarget.id)
    },
    onKeyDown: (e) => {
      if (!isMenuKey(e) || !ours(e.currentTarget, e.target, false)) return
      // Taken here, so the browser's own menu does not follow the key.
      e.preventDefault()
      const box = (e.currentTarget.querySelector('.slk-body') || e.currentTarget).getBoundingClientRect()
      open({ x: box.left, y: Math.min(box.bottom, box.top + 24) }, e.currentTarget.id)
    },
  }
}
