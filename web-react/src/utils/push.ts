// Web Push, from the browser's side.
//
// A subscription is a URL at a push service plus two keys, minted by this
// browser and handed to the Worker, which encrypts every notification to them.
// Nothing here works without a service worker, and on iOS nothing here works
// until the site has been added to the home screen — `pushSupport()` tells
// the UI which of those it is looking at.
//
// Firefox and Safari only show a permission prompt while the click that asked
// for it is still "the user's": any network wait before the prompt can spend
// that, and the prompt is then swallowed (Firefox shows a crossed-out bell in
// the address bar instead). So the prompt comes first, and the Worker's key is
// fetched ahead of time or alongside it — never before it.

import { getLocale } from './locale'

export type PushSupport = 'ready' | 'needs-install' | 'unsupported' | 'denied'
/// `dismissed`: the prompt was closed without an answer — ask again later.
/// `denied`: blocked for this site; only the browser's settings undo it.
export type EnableResult = 'on' | 'denied' | 'dismissed' | 'unavailable'

function isIOS(): boolean {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document)
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true
}

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    // Safari on iOS only exposes PushManager to an installed web app.
    return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported'
  }
  if (Notification.permission === 'denied') return 'denied'
  return 'ready'
}

export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
  return out
}

/// Was this subscription made with this key? A browser that does not say
/// (`options` missing) is taken at its word that it was.
export function sameServerKey(subscription: PushSubscription, publicKey: string): boolean {
  const had = subscription.options?.applicationServerKey
  if (!had) return true
  const a = new Uint8Array(had)
  const b = urlBase64ToUint8Array(publicKey)
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false
  return true
}

// ---- The Worker's public key, fetched before anyone clicks ----

const vapidKeys = new Map<string, Promise<string | null>>()

/// Fetch (once) the key pushes are signed with. Call it when the bell or the
/// settings screen appears, so the click has nothing to wait for. A failure
/// is not remembered: the next call tries again.
export function prefetchVapidKey(httpBase: string): Promise<string | null> {
  const cached = vapidKeys.get(httpBase)
  if (cached) return cached
  const request = fetch(`${httpBase}/push/vapid`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => (data && typeof data.publicKey === 'string' && data.publicKey ? data.publicKey : null))
    .catch(() => null)
  vapidKeys.set(httpBase, request)
  void request.then((key) => { if (!key && vapidKeys.get(httpBase) === request) vapidKeys.delete(httpBase) })
  return request
}

// ---- Permission ----

/// The prompt, in both of its shapes: a promise everywhere current, a
/// callback in older Safari. Never throws; a browser that refuses to ask
/// answers with what it already has.
export function askPermission(): Promise<NotificationPermission> {
  return new Promise((resolve) => {
    try {
      const maybe = Notification.requestPermission((answer) => resolve(answer))
      if (maybe && typeof maybe.then === 'function') maybe.then(resolve, () => resolve(Notification.permission))
    } catch {
      resolve(Notification.permission)
    }
  })
}

// ---- The service worker ----

const READY_TIMEOUT_MS = 10_000

/// The registration once its worker is active: `subscribe()` rejects on a
/// registration whose worker is still installing, which is exactly the state
/// of the first visit.
async function activeRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/')
  if (!existing) await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('service worker did not start')), READY_TIMEOUT_MS) }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/// Is this browser already subscribed on this account? Cheap, no prompt.
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'ready') return null
  try {
    const reg = await navigator.serviceWorker.getRegistration('/')
    return reg ? await reg.pushManager.getSubscription() : null
  } catch {
    return null
  }
}

async function forget(httpBase: string, sessionToken: string, endpoint: string): Promise<void> {
  await fetch(`${httpBase}/push/subscriptions`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', 'x-session-token': sessionToken },
    body: JSON.stringify({ endpoint }),
  }).catch(() => {})
}

/// A subscription made with the Worker's current key: the one the browser
/// has, or a fresh one when the key has changed since (a rotated key makes
/// the push service refuse every send, silently, forever).
async function subscriptionFor(reg: ServiceWorkerRegistration, publicKey: string, httpBase: string, sessionToken: string): Promise<PushSubscription> {
  const existing = await reg.pushManager.getSubscription()
  if (existing && sameServerKey(existing, publicKey)) return existing
  if (existing) {
    await forget(httpBase, sessionToken, existing.endpoint)
    await existing.unsubscribe().catch(() => false)
  }
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) })
}

async function tellWorker(httpBase: string, sessionToken: string, subscription: PushSubscription): Promise<boolean> {
  const res = await fetch(`${httpBase}/push/subscriptions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-session-token': sessionToken },
    body: JSON.stringify(subscription.toJSON()),
  })
  return res.ok
}

/// Ask, subscribe, and tell the Worker. Call from a click: browsers only
/// honour a permission prompt that a person asked for. Never throws.
export async function enableWebPush(httpBase: string, sessionToken: string): Promise<EnableResult> {
  const support = pushSupport()
  if (support === 'denied') return 'denied'
  if (support !== 'ready') return 'unavailable'
  // Started now, awaited after the prompt: the network runs while the
  // person reads the prompt, and never stands between the click and it.
  const key = prefetchVapidKey(httpBase)
  const permission = Notification.permission === 'granted' ? 'granted' : await askPermission()
  if (permission === 'denied') return 'denied'
  if (permission !== 'granted') return 'dismissed'
  try {
    const publicKey = await key
    if (!publicKey) return 'unavailable'
    const reg = await activeRegistration()
    const subscription = await subscriptionFor(reg, publicKey, httpBase, sessionToken)
    return (await tellWorker(httpBase, sessionToken, subscription)) ? 'on' : 'unavailable'
  } catch {
    return 'unavailable'
  }
}

/// On every open: the subscription this browser already has, handed to the
/// Worker again (it keeps one row per endpoint, so this is an upsert), and
/// made again if the key changed or the browser dropped it. Without this, a
/// subscription the Worker lost — pruned, re-bound on a shared computer,
/// replaced by Firefox — stops pushes with nothing on screen to say so.
/// Never prompts, never throws. Returns whether pushes will arrive.
export async function resyncWebPush(httpBase: string, sessionToken: string): Promise<boolean> {
  if (pushSupport() !== 'ready' || Notification.permission !== 'granted') return false
  try {
    const reg = await navigator.serviceWorker.getRegistration('/')
    if (!reg) return false
    const existing = await reg.pushManager.getSubscription()
    if (!existing) return false
    const publicKey = await prefetchVapidKey(httpBase)
    if (!publicKey) return false
    const subscription = sameServerKey(existing, publicKey) ? existing : await subscriptionFor(reg, publicKey, httpBase, sessionToken)
    return await tellWorker(httpBase, sessionToken, subscription)
  } catch {
    return false
  }
}

/// Unsubscribe here and forget it on the Worker, so signing out on a shared
/// machine stops the next person seeing your decisions.
export async function disableWebPush(httpBase: string, sessionToken: string): Promise<void> {
  const subscription = await currentSubscription()
  if (!subscription) return
  try {
    await forget(httpBase, sessionToken, subscription.endpoint)
  } finally {
    await subscription.unsubscribe().catch(() => {})
  }
}

/// Tell the Worker what language this browser reads, so notifications — on
/// any channel, not just this one — arrive in it.
export async function syncLocale(httpBase: string, sessionToken: string, locale?: string): Promise<void> {
  const tag = locale || getLocale()
  if (!tag) return
  try {
    await fetch(`${httpBase}/me`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-session-token': sessionToken },
      body: JSON.stringify({ locale: tag }),
    })
  } catch {
    // Not fatal: the Worker seeded a locale from Accept-Language on sign-in.
  }
}
