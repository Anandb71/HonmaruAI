import { describe, it, expect, beforeEach, vi } from 'vitest'
import { changeLocale, localeReady, snapshot, t } from './i18n'

// A language's table arrives after it is chosen. What `useT` draws from has
// to change when it does, or React keeps what it drew in English.
describe('a language chosen before its table is here', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { documentElement: {} })
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
    })
  })

  it('repaints once the table arrives, not only when the language changes', async () => {
    changeLocale('de')
    const chosen = snapshot()
    await localeReady()
    expect(t('Saved.')).toBe('Gespeichert.')
    expect(snapshot()).not.toBe(chosen)
    changeLocale('en')
  })
})

// A hint that names a key is given the key as this keyboard prints it; a ⌘
// written into the sentence is a key most keyboards do not have.
describe('the canvas hint', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { documentElement: {} })
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
    })
  })

  it('prints the key it is handed, in every language, and none of its own', async () => {
    for (const code of ['en', 'ja', 'fr', 'de', 'es']) {
      changeLocale(code)
      await localeReady()
      const hint = t('canvas.syntax', { key: 'Ctrl+Enter' })
      expect(hint, code).toContain('Ctrl+Enter')
      expect(hint, code).not.toContain('⌘')
      expect(hint, code).not.toContain('{key}')
    }
    changeLocale('en')
  })
})
