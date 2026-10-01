import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  readAppearance, writeAppearance, normalizeTheme, normalizeDensity, applyTheme, themeColorFor,
  colorSchemeFor, applyColorScheme, setAppearance, getAppearance, installAppearance,
  THEME_KEY, DENSITY_KEY, THEME_COLOR,
} from './appearance'
import indexHtml from '../../index.html?raw'

function fakeStorage(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => { m.set(k, String(v)) },
    removeItem: (k) => { m.delete(k) },
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size },
  } as Storage
}

// A browser that refuses: a private window, a site whose data is blocked.
const refusing = {
  getItem: () => { throw new Error('denied') },
  setItem: () => { throw new Error('denied') },
  removeItem: () => { throw new Error('denied') },
}

describe('appearance', () => {
  beforeEach(() => { (globalThis as { localStorage?: Storage }).localStorage = fakeStorage() })

  it('reads only what it draws: anything else is the system and cozy', () => {
    expect(normalizeTheme('dark')).toBe('dark')
    expect(normalizeTheme('light')).toBe('light')
    expect(normalizeTheme('Dark')).toBe('system')
    expect(normalizeTheme(null)).toBe('system')
    expect(normalizeDensity('compact')).toBe('compact')
    expect(normalizeDensity('dense')).toBe('cozy')
    expect(normalizeDensity(undefined)).toBe('cozy')
  })

  it('is the defaults with nothing kept, no storage, or storage that refuses', () => {
    const defaults = { theme: 'system', density: 'cozy' }
    expect(readAppearance(fakeStorage())).toEqual(defaults)
    expect(readAppearance(null)).toEqual(defaults)
    expect(readAppearance(refusing)).toEqual(defaults)
    expect(() => writeAppearance({ theme: 'dark' }, refusing)).not.toThrow()
  })

  it('keeps a choice, and keeps the default as nothing at all', () => {
    const s = fakeStorage()
    writeAppearance({ theme: 'dark', density: 'compact' }, s)
    expect(s.getItem(THEME_KEY)).toBe('dark')
    expect(s.getItem(DENSITY_KEY)).toBe('compact')
    expect(readAppearance(s)).toEqual({ theme: 'dark', density: 'compact' })
    // One at a time leaves the other where it was.
    writeAppearance({ theme: 'system' }, s)
    expect(s.getItem(THEME_KEY)).toBeNull()
    expect(s.getItem(DENSITY_KEY)).toBe('compact')
    writeAppearance({ density: 'cozy' }, s)
    expect(s.length).toBe(0)
  })

  it('puts the theme on the root, and takes it off for the system', () => {
    const root = { dataset: {} as DOMStringMap }
    applyTheme(root, 'light')
    expect(root.dataset.theme).toBe('light')
    applyTheme(root, 'dark')
    expect(root.dataset.theme).toBe('dark')
    applyTheme(root, 'system')
    expect('theme' in root.dataset).toBe(false)
  })

  it('paints the phone bars in the chosen theme whatever the query, the query’s own for the system', () => {
    const light = '(prefers-color-scheme: light)'
    const dark = '(prefers-color-scheme: dark)'
    expect(themeColorFor('system', light)).toBe(THEME_COLOR.light)
    expect(themeColorFor('system', dark)).toBe(THEME_COLOR.dark)
    expect(themeColorFor('dark', light)).toBe(THEME_COLOR.dark)
    expect(themeColorFor('light', dark)).toBe(THEME_COLOR.light)
    expect(themeColorFor('system', null)).toBe(THEME_COLOR.light)
  })

  it('names the chosen theme alone as the color-scheme, both for the system', () => {
    expect(colorSchemeFor('light')).toBe('light')
    expect(colorSchemeFor('dark')).toBe('dark')
    expect(colorSchemeFor('system')).toBe('light dark')
    let content = 'light dark'
    const meta = { setAttribute: (_: string, v: string) => { content = v } }
    const doc = { querySelector: () => meta } as unknown as Pick<Document, 'querySelector'>
    applyColorScheme(doc, 'dark')
    expect(content).toBe('dark')
    applyColorScheme(doc, 'system')
    expect(content).toBe('light dark')
    // A page without the tag has nothing to say it on.
    expect(() => applyColorScheme({ querySelector: () => null }, 'light')).not.toThrow()
  })

  it('changes one choice at a time, and keeps it', () => {
    setAppearance({ density: 'compact' })
    expect(getAppearance().density).toBe('compact')
    expect(localStorage.getItem(DENSITY_KEY)).toBe('compact')
    setAppearance({ theme: 'dark' })
    expect(getAppearance()).toEqual({ theme: 'dark', density: 'compact' })
    setAppearance({ theme: 'system', density: 'cozy' })
    expect(getAppearance()).toEqual({ theme: 'system', density: 'cozy' })
    expect(localStorage.length).toBe(0)
  })
})

// Two windows side by side: a choice made in one arrives in the other through
// the storage event, and a change to anything else kept there does not repaint.
describe('another tab', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('follows a theme or display chosen in another tab, and the whole storage cleared', () => {
    const storage = fakeStorage()
    const root = { dataset: {} as DOMStringMap }
    let onStorage: (e: { key: string | null }) => void = () => {}
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('document', { documentElement: root, querySelector: () => null, querySelectorAll: () => [] })
    vi.stubGlobal('window', {
      addEventListener: (type: string, fn: typeof onStorage) => { if (type === 'storage') onStorage = fn },
    })
    setAppearance({ theme: 'system', density: 'cozy' })
    installAppearance()
    expect('theme' in root.dataset).toBe(false)

    // The other tab kept a value: this one reads it and draws it.
    storage.setItem(THEME_KEY, 'dark')
    onStorage({ key: THEME_KEY })
    expect(getAppearance().theme).toBe('dark')
    expect(root.dataset.theme).toBe('dark')

    // Another key changing is not a reason to read again.
    storage.setItem(DENSITY_KEY, 'compact')
    onStorage({ key: 'locale' })
    expect(getAppearance().density).toBe('cozy')
    onStorage({ key: DENSITY_KEY })
    expect(getAppearance()).toEqual({ theme: 'dark', density: 'compact' })

    // A null key is the whole storage cleared: back to the defaults.
    storage.clear()
    onStorage({ key: null })
    expect(getAppearance()).toEqual({ theme: 'system', density: 'cozy' })
    expect('theme' in root.dataset).toBe(false)
  })
})

// index.html paints the theme before this file has loaded, from its own copy
// of the key and the two colours. Nothing ties the copies but these tests.
describe('index.html first paint', () => {
  const script = /<script>([\s\S]*?)<\/script>/.exec(indexHtml)?.[1] ?? ''

  it('reads the same key and paints the same colours as appearance.ts', () => {
    expect(script).toContain(`localStorage.getItem('${THEME_KEY}')`)
    expect(script).toContain(`'${THEME_COLOR.light}'`)
    expect(script).toContain(`'${THEME_COLOR.dark}'`)
    expect(indexHtml).toContain(`<meta name="theme-color" content="${THEME_COLOR.light}" media="(prefers-color-scheme: light)" />`)
    expect(indexHtml).toContain(`<meta name="theme-color" content="${THEME_COLOR.dark}" media="(prefers-color-scheme: dark)" />`)
    expect(indexHtml).toContain(`<meta name="color-scheme" content="${colorSchemeFor('system')}" />`)
  })

  // The script run against a page made of index.html's own tags draws what
  // paint() would draw for the same kept value.
  function firstPaint(kept: string | null) {
    const tag = (content: string, media: string | null) => {
      const attrs: Record<string, string> = { content }
      if (media !== null) attrs.media = media
      return {
        getAttribute: (k: string) => attrs[k] ?? null,
        setAttribute: (k: string, v: string) => { attrs[k] = v },
      }
    }
    const scheme = tag(/<meta name="color-scheme" content="([^"]+)"/.exec(indexHtml)![1], null)
    const bars = [...indexHtml.matchAll(/<meta name="theme-color" content="([^"]+)" media="([^"]+)"/g)]
      .map(([, content, media]) => tag(content, media))
    const doc = {
      documentElement: { dataset: {} as DOMStringMap },
      querySelector: (sel: string) => (sel === 'meta[name="color-scheme"]' ? scheme : null),
      querySelectorAll: (sel: string) => (sel === 'meta[name="theme-color"]' ? bars : []),
    }
    const storage = fakeStorage()
    if (kept !== null) storage.setItem(THEME_KEY, kept)
    new Function('localStorage', 'document', script)(storage, doc)
    return {
      theme: doc.documentElement.dataset.theme,
      scheme: scheme.getAttribute('content'),
      bars: bars.map((b) => [b.getAttribute('media'), b.getAttribute('content')]),
    }
  }

  it.each([['dark'], ['light'], [null], ['Dark']])('draws what appearance.ts draws with %s kept', (kept) => {
    const theme = normalizeTheme(kept)
    const root = { dataset: {} as DOMStringMap }
    applyTheme(root, theme)
    const drawn = firstPaint(kept)
    expect(drawn.theme).toBe(root.dataset.theme)
    expect(drawn.scheme).toBe(colorSchemeFor(theme))
    expect(drawn.bars).toHaveLength(2)
    for (const [media, content] of drawn.bars) expect(content).toBe(themeColorFor(theme, media))
  })

  it('leaves the system to decide when storage refuses', () => {
    expect(() => new Function('localStorage', 'document', script)(refusing, {})).not.toThrow()
  })
})
