import { describe, it, expect, afterEach, vi } from 'vitest'
import { desktop } from './desktop'
import { pushSupport } from './push'
import { notifyMessage } from './notifications'
import { setQuietState } from './quiet'

// The page inside the desktop app (apps/desktop): what its preload exposes,
// and what the page does differently there.
describe('the desktop app, as the page sees it', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is not there in a browser, or when the object is not the preload\'s', () => {
    expect(desktop()).toBeNull()
    vi.stubGlobal('window', {})
    expect(desktop()).toBeNull()
    vi.stubGlobal('window', { honmaruDesktop: { isDesktop: true } })
    expect(desktop()).toBeNull()
    vi.stubGlobal('window', { honmaruDesktop: { isDesktop: 'yes', show: () => {} } })
    expect(desktop()).toBeNull()
  })

  it('is the bridge when the preload put it there', () => {
    const show = vi.fn()
    vi.stubGlobal('window', { honmaruDesktop: { isDesktop: true, platform: 'win32', show } })
    expect(desktop()?.platform).toBe('win32')
    desktop()!.show()
    expect(show).toHaveBeenCalled()
  })

  it('has no Web Push to turn on, so the bell is not offered', () => {
    vi.stubGlobal('window', { honmaruDesktop: { isDesktop: true, platform: 'win32', show: () => {} }, PushManager: function PushManager() {}, Notification: function Notification() {}, matchMedia: () => ({ matches: false }) })
    vi.stubGlobal('navigator', { userAgent: 'Electron', serviceWorker: {} })
    expect(pushSupport()).toBe('unsupported')
  })

  it('shows the page\'s own notification, not the service worker\'s, and a click asks the app for its window', () => {
    const show = vi.fn()
    const focus = vi.fn()
    const made: Array<{ onclick: (() => void) | null; close: () => void }> = []
    class FakeNotification {
      static permission = 'granted'
      onclick: (() => void) | null = null
      constructor() { made.push(this) }
      close() {}
    }
    const getRegistration = vi.fn(async () => ({ showNotification: vi.fn() }))
    vi.stubGlobal('Notification', FakeNotification)
    vi.stubGlobal('document', { visibilityState: 'hidden', documentElement: {}, title: '' })
    vi.stubGlobal('window', { honmaruDesktop: { isDesktop: true, platform: 'win32', show }, focus })
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration } })
    vi.stubGlobal('location', { hash: '' })
    setQuietState({ pausedUntil: null, schedule: null })

    notifyMessage({ id: 'm1', orgId: 'org1', channel: 'dm:mika', author: 'Mika', body: 'hi' })
    expect(made).toHaveLength(1)
    expect(getRegistration).not.toHaveBeenCalled()
    made[0].onclick!()
    expect(show).toHaveBeenCalled()
    expect(focus).not.toHaveBeenCalled()
    expect((location as unknown as { hash: string }).hash).toBe('#/m/m1/org1')
  })
})
