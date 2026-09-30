import { describe, it, expect } from 'vitest'
import { appUrlFrom, allowedOrigins, apiOriginsFrom, DEFAULT_APP_URL, DEFAULT_API_ORIGINS } from '../src/config.js'

describe('what the desktop app loads', () => {
  it('is the production web app unless told otherwise', () => {
    expect(appUrlFrom({}, [])).toBe(DEFAULT_APP_URL)
  })

  it('takes --app-url before HONMARU_APP_URL, and ignores anything that is not http(s)', () => {
    expect(appUrlFrom({ HONMARU_APP_URL: 'https://staging.example' }, [])).toBe('https://staging.example/')
    expect(appUrlFrom({ HONMARU_APP_URL: 'https://staging.example' }, ['electron', '.', '--app-url=http://localhost:3000'])).toBe('http://localhost:3000/')
    expect(appUrlFrom({ HONMARU_APP_URL: 'file:///C:/evil.html' }, [])).toBe(DEFAULT_APP_URL)
    expect(appUrlFrom({}, ['--app-url=javascript:alert(1)'])).toBe(DEFAULT_APP_URL)
  })

  it('knows its own origins: the app, the API (plus any configured), and GitHub', () => {
    expect(apiOriginsFrom({ HONMARU_API_ORIGINS: 'https://api.staging.example/, nonsense, ftp://x' })).toEqual([...DEFAULT_API_ORIGINS, 'https://api.staging.example'])
    expect(allowedOrigins('http://localhost:3000/', {})).toEqual(['http://localhost:3000', ...DEFAULT_API_ORIGINS, 'https://github.com'])
  })
})
