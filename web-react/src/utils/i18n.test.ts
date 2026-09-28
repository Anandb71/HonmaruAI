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
