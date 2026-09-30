import { useSyncExternalStore } from 'react'

// How this browser draws the app: the theme — whatever the system says, or
// light or dark regardless — and how tightly a conversation's messages sit.
// Kept in this browser, not on the account: the laptop at a desk and the
// phone at night each keep their own. index.html reads the theme as well,
// before anything paints, so a dark choice never opens on a white flash.

export type Theme = 'system' | 'light' | 'dark'
export type Density = 'cozy' | 'compact'
export interface Appearance { theme: Theme; density: Density }

export const THEMES: readonly Theme[] = ['system', 'light', 'dark']
export const DENSITIES: readonly Density[] = ['cozy', 'compact']
export const DEFAULT_APPEARANCE: Appearance = { theme: 'system', density: 'cozy' }

/// Where each choice is kept. index.html reads THEME_KEY by name, before
/// this file has loaded: change one and change the other.
export const THEME_KEY = 'theme'
export const DENSITY_KEY = 'density'

/// The colour a phone paints its bars around the app, as index.html's two
/// <meta name="theme-color"> tags carry it.
export const THEME_COLOR = { light: '#ffffff', dark: '#0f0f0f' } as const

type Reader = Pick<Storage, 'getItem'>
type Keeper = Pick<Storage, 'setItem' | 'removeItem'>

/// Anything kept that is not a theme this app draws — an old value, a typo
/// in the console — is the system's.
export function normalizeTheme(raw: unknown): Theme {
  return raw === 'light' || raw === 'dark' ? raw : 'system'
}

export function normalizeDensity(raw: unknown): Density {
  return raw === 'compact' ? 'compact' : 'cozy'
}

function local(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

/// What this browser kept. No storage, or storage that refuses (a private
/// window, a site whose data is blocked), reads as the defaults.
export function readAppearance(storage: Reader | null = local()): Appearance {
  const get = (key: string) => { try { return storage ? storage.getItem(key) : null } catch { return null } }
  return { theme: normalizeTheme(get(THEME_KEY)), density: normalizeDensity(get(DENSITY_KEY)) }
}

/// Keep a choice. The default is kept as nothing at all, so a browser that
/// never chose goes on following whatever the default is.
export function writeAppearance(next: Partial<Appearance>, storage: Keeper | null = local()): void {
  if (!storage) return
  const keep = (key: string, value: string, fallback: string) => {
    try {
      if (value === fallback) storage.removeItem(key)
      else storage.setItem(key, value)
    } catch { /* a browser that keeps nothing keeps nothing */ }
  }
  if (next.theme !== undefined) keep(THEME_KEY, normalizeTheme(next.theme), DEFAULT_APPEARANCE.theme)
  if (next.density !== undefined) keep(DENSITY_KEY, normalizeDensity(next.density), DEFAULT_APPEARANCE.density)
}

/// The theme, on the document's root: every dark rule in the stylesheets
/// asks `[data-theme]` before it asks the system. 'system' takes the
/// attribute away, and the system's own setting decides again.
export function applyTheme(root: Pick<HTMLElement, 'dataset'>, theme: Theme): void {
  if (theme === 'system') delete root.dataset.theme
  else root.dataset.theme = theme
}

/// The colour for one theme-color tag, by the media query it carries: a
/// chosen theme wins over either query, the system's is the query's own.
export function themeColorFor(theme: Theme, media: string | null): string {
  if (theme !== 'system') return THEME_COLOR[theme]
  return /dark/.test(media || '') ? THEME_COLOR.dark : THEME_COLOR.light
}

export function applyThemeColor(doc: Pick<Document, 'querySelectorAll'>, theme: Theme): void {
  doc.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute('content', themeColorFor(theme, meta.getAttribute('media')))
  })
}

/// What <meta name="color-scheme"> says. The browser paints its canvas and
/// its own controls by that tag before any stylesheet has loaded, so it
/// names the chosen theme alone, and both for the system's.
export function colorSchemeFor(theme: Theme): string {
  return theme === 'system' ? 'light dark' : theme
}

export function applyColorScheme(doc: Pick<Document, 'querySelector'>, theme: Theme): void {
  doc.querySelector('meta[name="color-scheme"]')?.setAttribute('content', colorSchemeFor(theme))
}

let current: Appearance = readAppearance()
const listeners = new Set<() => void>()
const emit = () => { for (const l of listeners) l() }
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }
const snapshot = () => current

function paint(): void {
  if (typeof document === 'undefined') return
  applyTheme(document.documentElement, current.theme)
  applyColorScheme(document, current.theme)
  applyThemeColor(document, current.theme)
}

export function getAppearance(): Appearance {
  return current
}

/// Choose, and see it at once: kept, drawn, and every screen reading it
/// repainted. A browser that cannot keep it still shows it until it closes.
export function setAppearance(next: Partial<Appearance>): void {
  current = {
    theme: next.theme !== undefined ? normalizeTheme(next.theme) : current.theme,
    density: next.density !== undefined ? normalizeDensity(next.density) : current.density,
  }
  writeAppearance(next)
  paint()
  emit()
}

/// At start: the theme index.html already drew, said again from the same
/// storage, and another tab's choice followed here — two windows side by
/// side should not disagree about the dark.
export function installAppearance(): void {
  paint()
  if (typeof window === 'undefined') return
  window.addEventListener('storage', (e) => {
    // A null key is the whole storage cleared.
    if (e.key !== null && e.key !== THEME_KEY && e.key !== DENSITY_KEY) return
    current = readAppearance()
    paint()
    emit()
  })
}

/// Re-render when a choice changes, here or in another tab.
export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
