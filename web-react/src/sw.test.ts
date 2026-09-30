import { describe, it, expect, beforeEach } from 'vitest'
import source from '../public/sw.js?raw'

// public/sw.js itself, run with just enough of a service worker around it
// (its globals handed in as parameters): what a push shows, and where a
// click goes.

type Handler = (event: Record<string, unknown>) => void
interface Shown { title: string; options: Record<string, unknown> & { data: Record<string, unknown> } }

function worker(opts: { windows?: Array<Record<string, unknown>>; existing?: Array<{ data: Record<string, unknown> }> } = {}) {
  const handlers: Record<string, Handler> = {}
  const shown: Shown[] = []
  const opened: string[] = []
  const posted: Array<{ id: string; message: Record<string, unknown> }> = []
  const focused: string[] = []
  const windows = (opts.windows || []).map((w) => ({
    ...w,
    postMessage: (message: Record<string, unknown>) => posted.push({ id: String(w.id), message }),
    focus: async () => { focused.push(String(w.id)) },
  }))
  const self = {
    location: { origin: 'https://app.example' },
    addEventListener: (name: string, fn: Handler) => { handlers[name] = fn },
    skipWaiting: async () => {},
    registration: {
      scope: 'https://app.example/',
      showNotification: async (title: string, options: Shown['options']) => { shown.push({ title, options }) },
      getNotifications: async () => opts.existing || [],
      pushManager: { subscribe: async () => ({}) },
    },
    clients: {
      matchAll: async () => windows,
      openWindow: async (url: string) => { opened.push(url) },
      claim: async () => {},
    },
  }
  new Function('self', 'caches', 'fetch', 'navigator', source)(self, {}, () => Promise.reject(new Error('offline')), {})
  const fire = async (name: string, event: Record<string, unknown>) => {
    let work: Promise<unknown> = Promise.resolve()
    handlers[name]({ ...event, waitUntil: (p: Promise<unknown>) => { work = p } })
    await work
  }
  const push = (data: Record<string, unknown>) => fire('push', { data: { json: () => data, text: () => JSON.stringify(data) } })
  const click = (data: Record<string, unknown>) => fire('notificationclick', { notification: { data, close: () => {} } })
  return { shown, opened, posted, focused, push, click, fire }
}

describe('a push, shown', () => {
  it('uses raster icons, keeps the workspace, and rings again for a new message in the same conversation', async () => {
    const w = worker()
    await w.push({ title: 'Mika Â· #cafe', body: 'Hi', kind: 'message', tag: 'org1|b:cafe', orgId: 'org1', channel: 'b:cafe', messageId: 'm1' })
    expect(w.shown).toHaveLength(1)
    const { options } = w.shown[0]
    expect(options.icon).toBe('/icon-192.png')
    expect(options.badge).toBe('/badge-96.png')
    expect(options.tag).toBe('org1|b:cafe')
    expect(options.renotify).toBe(true)
    expect(options.data).toMatchObject({ messageId: 'm1', orgId: 'org1', channel: 'b:cafe' })
    expect(typeof options.timestamp).toBe('number')
  })

  it('replaces, without a second sound, a message the open tab already showed', async () => {
    const w = worker({ existing: [{ data: { messageId: 'm1' } }] })
    await w.push({ title: 'Mika', body: 'Hi', kind: 'message', tag: 'org1|dm:mika', orgId: 'org1', messageId: 'm1' })
    expect(w.shown[0].options.renotify).toBe(false)
  })

  it('still rings for the next message in that conversation', async () => {
    const w = worker({ existing: [{ data: { messageId: 'm1' } }] })
    await w.push({ title: 'Mika', body: 'Again', kind: 'message', tag: 'org1|dm:mika', orgId: 'org1', messageId: 'm2' })
    expect(w.shown[0].options.renotify).toBe(true)
  })

  it('does not ring again for a card being updated, and always has a tag', async () => {
    const w = worker()
    await w.push({ title: 'New decision', body: 'Budget', kind: 'created', cardId: 'c1' })
    expect(w.shown[0].options).toMatchObject({ tag: 'c1', renotify: false })
    await w.push({ title: 'Plain' })
    expect(w.shown[1].options.tag).toBe('honmaru')
  })
})

describe('a notification, clicked', () => {
  let w: ReturnType<typeof worker>

  it('opens the message in its own workspace when no window is open', async () => {
    w = worker()
    await w.click({ messageId: 'm1', orgId: 'org 2' })
    expect(w.opened).toEqual(['https://app.example/#/m/m1/org%202'])
  })

  it('opens the card when no window is open', async () => {
    w = worker()
    await w.click({ cardId: 'c1' })
    expect(w.opened).toEqual(['https://app.example/#/feed/c1'])
  })

  describe('with windows open', () => {
    beforeEach(() => {
      w = worker({
        windows: [
          { id: 'privacy', url: 'https://app.example/privacy.html', focused: true, visibilityState: 'visible' },
          { id: 'background', url: 'https://app.example/#/list', focused: false, visibilityState: 'hidden' },
          { id: 'front', url: 'https://app.example/index.html#/feed', focused: false, visibilityState: 'visible' },
        ],
      })
    })

    it('brings forward the app window that can be seen â€” never the privacy page â€” and tells it where to go', async () => {
      await w.click({ messageId: 'm1', orgId: 'org1' })
      expect(w.opened).toEqual([])
      expect(w.focused).toEqual(['front'])
      expect(w.posted).toEqual([{ id: 'front', message: { type: 'open-message', messageId: 'm1', orgId: 'org1', hash: '#/m/m1/org1' } }])
    })

    it('sends a card to the card', async () => {
      await w.click({ cardId: 'c1', orgId: 'org1' })
      expect(w.posted[0].message).toEqual({ type: 'open-card', cardId: 'c1', orgId: 'org1', hash: '#/feed/c1' })
    })
  })
})

describe('a subscription the browser replaced', () => {
  it('asks every open window to hand the new one to the Worker', async () => {
    const w = worker({ windows: [{ id: 'a', url: 'https://app.example/' }] })
    await w.fire('pushsubscriptionchange', { oldSubscription: { options: { applicationServerKey: new ArrayBuffer(65) } }, newSubscription: null })
    expect(w.posted).toEqual([{ id: 'a', message: { type: 'push-resync' } }])
  })
})
