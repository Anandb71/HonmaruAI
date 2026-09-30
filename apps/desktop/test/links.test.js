import { describe, it, expect } from 'vitest'
import { deepLinkToUrl, linkFromArgv, isSafeExternal, navigationDecision, SIGN_IN_MS } from '../src/links.js'

const APP = 'https://app.honmaruai.com/'
const API = 'https://tiktokforwork.torubj0904.workers.dev'
const ORIGINS = ['https://app.honmaruai.com', API, 'https://github.com']

describe('honmaru:// links', () => {
  it('open a conversation in its workspace, and an invitation, at the web app\'s own paths', () => {
    expect(deepLinkToUrl('honmaru://c/b%3Ageneral?org=team%3Aacme', APP)).toBe('https://app.honmaruai.com/c/b%3Ageneral?org=team%3Aacme')
    expect(deepLinkToUrl('honmaru://c/dm:mika', APP)).toBe('https://app.honmaruai.com/c/dm:mika')
    expect(deepLinkToUrl('honmaru://join/0123456789abcdef', APP)).toBe('https://app.honmaruai.com/join/0123456789abcdef')
  })

  it('open the app at its start for anything else of ours, and nothing for other schemes', () => {
    expect(deepLinkToUrl('honmaru://settings', APP)).toBe('https://app.honmaruai.com/')
    // Dot segments are resolved by the URL parser: it never leaves the app,
    // and the web app refuses "etc" as a channel.
    expect(new URL(deepLinkToUrl('honmaru://c/../../etc', APP)).origin).toBe('https://app.honmaruai.com')
    expect(deepLinkToUrl('https://evil.example/c/x', APP)).toBeNull()
    expect(deepLinkToUrl('not a url', APP)).toBeNull()
  })

  it('never carry a workspace onto an invitation', () => {
    expect(deepLinkToUrl('honmaru://join/abc?org=x', APP)).toBe('https://app.honmaruai.com/join/abc')
  })

  it('are found among a second start\'s arguments', () => {
    expect(linkFromArgv(['C:\\Honmaru.exe', '--flag', 'honmaru://c/b%3Ax'])).toBe('honmaru://c/b%3Ax')
    expect(linkFromArgv(['C:\\Honmaru.exe'])).toBeNull()
  })
})

describe('where the window may go', () => {
  const decide = (target, extra = {}) => navigationDecision({ target, from: APP, origins: ORIGINS, apiOrigins: [API], now: 1000, ...extra })

  it('stays on the app, the API and GitHub', () => {
    expect(decide('https://app.honmaruai.com/#/list')).toMatchObject({ allow: true })
    expect(decide(`${API}/auth/github`)).toMatchObject({ allow: true })
    expect(decide('https://github.com/login/oauth/authorize?x=1')).toMatchObject({ allow: true })
  })

  it('sends any other page to the browser', () => {
    expect(decide('https://news.example/story')).toEqual({ allow: false, external: true, signInUntil: 0 })
  })

  it('lets a sign-in the API sent elsewhere run its course, then ends it back on the app', () => {
    const started = decide('https://login.company.example/saml', { from: `${API}/sso/start?orgId=x`, redirect: true })
    expect(started).toEqual({ allow: true, external: false, signInUntil: 1000 + SIGN_IN_MS })
    // The identity provider's own pages, within the window.
    expect(decide('https://mfa.company.example/push', { signInUntil: started.signInUntil, now: 5000 })).toMatchObject({ allow: true })
    // Back on the app: the window closes.
    expect(decide('https://app.honmaruai.com/', { signInUntil: started.signInUntil })).toEqual({ allow: true, external: false, signInUntil: 0 })
    // And it does not last forever.
    expect(decide('https://mfa.company.example/push', { signInUntil: started.signInUntil, now: started.signInUntil + 1 })).toMatchObject({ allow: false })
  })

  it('does not open a sign-in for a redirect that did not come from the API, or for plain http', () => {
    expect(decide('https://login.company.example/', { from: 'https://news.example/', redirect: true })).toMatchObject({ allow: false, external: true })
    expect(decide('https://login.company.example/', { from: API, redirect: false })).toMatchObject({ allow: false })
    expect(decide('http://login.company.example/', { from: API, redirect: true })).toMatchObject({ allow: false })
  })

  it('never loads other schemes, and hands only web and mail links to the system', () => {
    expect(decide('file:///C:/Windows/system32')).toEqual({ allow: false, external: false, signInUntil: 0 })
    expect(decide('mailto:hi@example.com')).toEqual({ allow: false, external: true, signInUntil: 0 })
    expect(isSafeExternal('javascript:alert(1)')).toBe(false)
    expect(isSafeExternal('ms-settings:privacy')).toBe(false)
    expect(isSafeExternal('https://example.com')).toBe(true)
  })
})
