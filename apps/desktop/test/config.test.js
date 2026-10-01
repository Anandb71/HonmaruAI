import { describe, it, expect } from 'vitest'
import { appUrlFrom, allowedOrigins, apiOriginsFrom, trustedOrigin, DEFAULT_APP_URL, DEFAULT_API_ORIGINS } from '../src/config.js'

const dev = { packaged: false }

describe('what the desktop app loads', () => {
  it('is the production web app unless told otherwise', () => {
    expect(appUrlFrom({}, [])).toBe(DEFAULT_APP_URL)
    expect(appUrlFrom({}, [], dev)).toBe(DEFAULT_APP_URL)
  })

  it('takes --app-url before HONMARU_APP_URL while developing, and ignores anything that is not https or a local dev server', () => {
    expect(appUrlFrom({ HONMARU_APP_URL: 'https://staging.example' }, [], dev)).toBe('https://staging.example/')
    expect(appUrlFrom({ HONMARU_APP_URL: 'https://staging.example' }, ['electron', '.', '--app-url=http://localhost:3000'], dev)).toBe('http://localhost:3000/')
    expect(appUrlFrom({}, ['--app-url=http://127.0.0.1:3000/'], dev)).toBe('http://127.0.0.1:3000/')
    expect(appUrlFrom({ HONMARU_APP_URL: 'http://staging.example' }, [], dev)).toBe(DEFAULT_APP_URL)
    expect(appUrlFrom({ HONMARU_APP_URL: 'file:///C:/evil.html' }, [], dev)).toBe(DEFAULT_APP_URL)
    expect(appUrlFrom({}, ['--app-url=javascript:alert(1)'], dev)).toBe(DEFAULT_APP_URL)
  })

  it('cannot be pointed anywhere else once installed, by a flag or the environment', () => {
    expect(appUrlFrom({ HONMARU_APP_URL: 'https://evil.example' }, [], { packaged: true })).toBe(DEFAULT_APP_URL)
    expect(appUrlFrom({}, ['--app-url=https://evil.example'], { packaged: true })).toBe(DEFAULT_APP_URL)
    expect(apiOriginsFrom({ HONMARU_API_ORIGINS: 'https://evil.example' }, { packaged: true })).toEqual(DEFAULT_API_ORIGINS)
    // Leaving the option out counts as installed: the safe side.
    expect(appUrlFrom({ HONMARU_APP_URL: 'https://evil.example' }, [])).toBe(DEFAULT_APP_URL)
    expect(apiOriginsFrom({ HONMARU_API_ORIGINS: 'https://evil.example' })).toEqual(DEFAULT_API_ORIGINS)
  })

  it('trusts https, and plain http only on this machine while developing', () => {
    expect(trustedOrigin('https://a.example/x')).toBe('https://a.example')
    expect(trustedOrigin('http://localhost:8787', dev)).toBe('http://localhost:8787')
    expect(trustedOrigin('http://localhost:8787')).toBeNull()
    expect(trustedOrigin('http://a.example', dev)).toBeNull()
    expect(trustedOrigin('ftp://a.example', dev)).toBeNull()
    expect(trustedOrigin('nonsense', dev)).toBeNull()
  })

  it('knows its own origins: the app, the API (plus any configured), and GitHub', () => {
    expect(apiOriginsFrom({ HONMARU_API_ORIGINS: 'https://api.staging.example/, nonsense, ftp://x, http://api.example' }, dev)).toEqual([...DEFAULT_API_ORIGINS, 'https://api.staging.example'])
    expect(apiOriginsFrom({ HONMARU_API_ORIGINS: 'http://localhost:8787' }, dev)).toEqual([...DEFAULT_API_ORIGINS, 'http://localhost:8787'])
    expect(allowedOrigins('http://localhost:3000/', {}, dev)).toEqual(['http://localhost:3000', ...DEFAULT_API_ORIGINS, 'https://github.com'])
    expect(allowedOrigins(DEFAULT_APP_URL, { HONMARU_API_ORIGINS: 'https://x.example' })).toEqual(['https://app.honmaruai.com', ...DEFAULT_API_ORIGINS, 'https://github.com'])
  })
})
