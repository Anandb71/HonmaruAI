import { t } from './i18n'
import { getLocale, primary } from './locale'
import { isQuiet } from './quiet'

// The tab's own notifications, for while the app is open but not in front:
// a decision for you, a direct message, an @mention. Web Push (utils/push.ts)
// is the channel that works with the tab closed; these are the ones that
// arrive the moment the socket hears them, a push's delay sooner.
//
// They are shown through the service worker, not `new Notification()`:
// Chrome on Android throws on the constructor, and a notification the worker
// shows gets the worker's click handling (sw.js) — the right workspace, the
// right conversation, the tab brought forward. They carry the same tag as
// the Worker's push for the same thing (`<cardId>`, `<orgId>|<view>`), so the
// push that follows replaces this one quietly instead of ringing twice
// (sw.js checks the id before it rings again).
//
// All no-ops where unsupported or not permitted.

/// The same words, written by the Worker in the reader's language — which
/// this page's own tables have only for the five languages its screens are
/// in. Taken from GET /me.
type NotificationCopy = { locale: string; newDecision: string; from: string }
let serverCopy: NotificationCopy | null = null

export function setNotificationCopy(copy: NotificationCopy | null | undefined): void {
  if (copy && typeof copy.newDecision === 'string' && typeof copy.from === 'string') serverCopy = copy
}

function words(from: string): { heading: string; byline: string } {
  // Only while it is still the language being read: a language changed since
  // /me was read goes back to the page's own table until it is read again.
  if (serverCopy && serverCopy.locale === primary(getLocale())) {
    return { heading: serverCopy.newDecision, byline: serverCopy.from.replace('{name}', from) }
  }
  return { heading: t('New decision for you'), byline: t('From {name}', { name: from }) }
}

const ICON = '/icon-192.png'
const BADGE = '/badge-96.png'

function permitted(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted'
}

/// The person is looking at this tab, in a window that has focus.
export function lookingHere(): boolean {
  if (typeof document === 'undefined') return false
  if (document.visibilityState !== 'visible') return false
  return typeof document.hasFocus === 'function' ? document.hasFocus() : true
}

interface Shown { tag: string; body: string; data: Record<string, unknown>; renotify?: boolean }

/// Show one, through the service worker when there is one, else directly —
/// with a click that brings this tab forward.
function show(title: string, { tag, body, data, renotify = false }: Shown): void {
  const options = { body, tag, data, icon: ICON, badge: BADGE, renotify, timestamp: Date.now() } as NotificationOptions
  const direct = () => {
    try {
      const n = new Notification(title, options)
      n.onclick = () => {
        try { window.focus() } catch { /* not ours to focus */ }
        n.close()
        const hash = typeof data.hash === 'string' ? data.hash : ''
        if (hash && typeof location !== 'undefined') location.hash = hash
      }
    } catch {
      // Chrome on Android throws: a phone without the worker gets the push.
    }
  }
  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined
  if (!sw) { direct(); return }
  sw.getRegistration('/')
    .then((reg) => (reg ? reg.showNotification(title, options) : direct()))
    .catch(direct)
}

/// A decision now waiting on you. `cardId` makes it the same notification
/// as the Worker's push for this card.
export function notifyNewDecision(title: string, from: string, cardId?: string): void {
  if (!permitted() || lookingHere() || isQuiet()) return
  const { heading, byline } = words(from)
  show(heading, {
    tag: cardId || 'honmaru-decision',
    body: `${title}\n${byline}`,
    data: { cardId: cardId || null, kind: 'created', hash: cardId ? `#/feed/${encodeURIComponent(cardId)}` : '' },
  })
}

/// What a message says, as a notification can show it: one line, marks
/// taken off, and a ||spoiler|| never given away.
export function notificationText(body: string, max = 180): string {
  const flat = String(body || '')
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*\n?/g, '').trim())
    .replace(/\|\|[^|\n]+\|\|/g, '▇▇▇')
    .replace(/^(?:#{1,3}|-#)\s+/gm, '')
    .replace(/^\s*(?:>|&gt;)\s?/gm, '')
    .replace(/(\*\*|__|~~)(.+?)\1/g, '$2')
    .replace(/(^|[\s(])([*_~])([^*_~\n]+)\2(?=$|[\s.,!?)])/g, '$1$3')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

// Mentions and direct messages that came in while the tab was not in front:
// they count in the title and on the icon until the tab is looked at again.
let away = 0
let pending = 0

/// A direct message or an @mention, while the tab is not in front. The
/// caller has decided it deserves one (utils/sound.ts soundForMessage says
/// "mention" — not muted, not yours, not a quiet channel message).
export function notifyMessage(m: { id: string; orgId: string; channel: string; author: string; where?: string | null; body: string; hasFiles?: boolean }): void {
  if (!permitted() || lookingHere() || isQuiet()) return
  away += 1
  paintBadge()
  show(m.where ? `${m.author} · ${m.where}` : m.author, {
    tag: `${m.orgId}|${m.channel}`,
    body: notificationText(m.body) || (m.hasFiles ? '📎' : ''),
    // A new message in the same conversation replaces the last one and must
    // still be heard, as the Worker's pushes are.
    renotify: true,
    data: { messageId: m.id, orgId: m.orgId, channel: m.channel, kind: 'message', hash: `#/m/${encodeURIComponent(m.id)}/${encodeURIComponent(m.orgId)}` },
  })
}

/// Cards that stopped waiting on you (decided here or anywhere): their
/// notifications are no longer true, so they come off the screen.
export function closeCardNotifications(cardIds: string[]): void {
  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined
  if (!sw || !cardIds.length) return
  sw.getRegistration('/')
    .then((reg) => Promise.all(cardIds.map((tag) => reg?.getNotifications({ tag }))))
    .then((lists) => { for (const n of lists.flat()) if (n) n.close() })
    .catch(() => { /* nothing shown, nothing to take down */ })
}

// ---- The count: in the tab's title, on its icon, on the app's icon ----

const BASE_TITLE = 'Honmaru AI'

/// Decisions waiting on you. The title reads "(3) Honmaru AI"; the tab's
/// icon and an installed app's icon carry the same number.
export function setTabBadge(count: number): void {
  pending = Math.max(0, count | 0)
  paintBadge()
}

/// The tab is being looked at: what came in while it was away is seen.
export function markSeen(): void {
  if (!away) return
  away = 0
  paintBadge()
}

export function badgeCount(): number { return pending + away }

function paintBadge(): void {
  const count = badgeCount()
  if (typeof document !== 'undefined') document.title = count > 0 ? `(${count}) ${BASE_TITLE}` : BASE_TITLE
  paintFavicon(count)
  // An installed app's icon (Chrome, Edge, Safari); a no-op in a plain tab.
  const nav = typeof navigator !== 'undefined' ? navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> } : null
  if (nav?.setAppBadge && nav.clearAppBadge) void (count > 0 ? nav.setAppBadge(count) : nav.clearAppBadge()).catch(() => {})
}

/// "9+" past nine, as every chat app's badge does.
export function badgeLabel(count: number): string {
  return count > 9 ? '9+' : String(count)
}

let faviconImage: HTMLImageElement | null = null
let faviconPainted = -1

function paintFavicon(count: number): void {
  if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return
  if (count === faviconPainted) return
  const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]'))
  if (!links.length) return
  for (const link of links) if (!link.dataset.plain) link.dataset.plain = link.href
  faviconPainted = count
  if (count <= 0) {
    for (const link of links) if (link.dataset.plain) link.href = link.dataset.plain
    return
  }
  const draw = () => {
    if (faviconPainted !== count || !faviconImage) return
    const canvas = document.createElement('canvas')
    canvas.width = 64; canvas.height = 64
    const g = canvas.getContext('2d')
    if (!g) return
    g.drawImage(faviconImage, 0, 0, 64, 64)
    const label = badgeLabel(count)
    const r = label.length > 1 ? 20 : 17
    g.beginPath()
    g.arc(64 - r, r, r, 0, Math.PI * 2)
    g.fillStyle = '#e5484d'
    g.fill()
    g.lineWidth = 4
    g.strokeStyle = '#ffffff'
    g.stroke()
    g.fillStyle = '#ffffff'
    g.font = `bold ${label.length > 1 ? 22 : 26}px system-ui, -apple-system, Segoe UI, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(label, 64 - r, r + 1)
    let url = ''
    try { url = canvas.toDataURL('image/png') } catch { return }
    for (const link of links) link.href = url
  }
  if (faviconImage?.complete) { draw(); return }
  if (!faviconImage) {
    faviconImage = new Image()
    faviconImage.src = ICON
  }
  faviconImage.addEventListener('load', draw, { once: true })
}
