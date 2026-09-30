import { describe, it, expect, beforeEach } from 'vitest'
import {
  readAppearance, writeAppearance, normalizeTheme, normalizeDensity, applyTheme, themeColorFor,
  colorSchemeFor, applyColorScheme, setAppearance, getAppearance, THEME_KEY, DENSITY_KEY, THEME_COLOR,
} from './appearance'

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
