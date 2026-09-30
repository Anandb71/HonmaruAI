import { describe, it, expect } from 'vitest'
import { APP_ORIGIN, channelLink, joinLink, linkPath, parseAppLink, webHashFor } from '../src/links'

const CODE = '0123456789abcdef0123456789abcdef'

describe('links', () => {
  it('builds a conversation link on the web app, with its workspace', () => {
    expect(channelLink('b:general', 'team:acme')).toBe(`${APP_ORIGIN}/c/b%3Ageneral?org=team%3Aacme`)
    expect(channelLink('dm:alice|bob')).toBe(`${APP_ORIGIN}/c/dm%3Aalice%7Cbob`)
    expect(channelLink('b:x', null, 'https://staging.example/')).toBe('https://staging.example/c/b%3Ax')
  })

  it('builds an invitation link', () => {
    expect(joinLink(CODE.toUpperCase())).toBe(`${APP_ORIGIN}/join/${CODE}`)
  })

  it('reads back what it builds', () => {
    expect(parseAppLink(channelLink('b:general', 'team:acme'))).toEqual({ kind: 'channel', channel: 'b:general', orgId: 'team:acme' })
    expect(parseAppLink(channelLink('ag:hayao'))).toEqual({ kind: 'channel', channel: 'ag:hayao', orgId: null })
    expect(parseAppLink(joinLink(CODE))).toEqual({ kind: 'join', code: CODE })
  })

  it('reads paths, custom-scheme URLs and unencoded channels', () => {
    expect(parseAppLink('/c/b%3Ageneral?org=personal%3Aabc')).toEqual({ kind: 'channel', channel: 'b:general', orgId: 'personal:abc' })
    expect(parseAppLink('honmaru://c/b%3Ageneral')).toEqual({ kind: 'channel', channel: 'b:general', orgId: null })
    expect(parseAppLink('honmaru:///join/' + CODE)).toEqual({ kind: 'join', code: CODE })
    expect(parseAppLink('https://app.honmaruai.com/c/b:general')).toEqual({ kind: 'channel', channel: 'b:general', orgId: null })
  })

  it('refuses what is not a link of ours', () => {
    expect(parseAppLink('')).toBeNull()
    expect(parseAppLink('/c/')).toBeNull()
    expect(parseAppLink('/c/general')).toBeNull()
    expect(parseAppLink('/join/nothex')).toBeNull()
    expect(parseAppLink(`/join/${CODE}/more`)).toBeNull()
    expect(parseAppLink('/feed/123')).toBeNull()
    expect(parseAppLink('/c/b%3A%E0%A4%A')).toBeNull()
  })

  it('drops a workspace that is not an id', () => {
    expect(parseAppLink('/c/b%3Ax?org=%3Cscript%3E')).toEqual({ kind: 'channel', channel: 'b:x', orgId: null })
  })

  it('gives the path the app routes and the hash the web routes', () => {
    const link = { kind: 'channel', channel: 'b:general', orgId: 'team:acme' } as const
    expect(linkPath(link)).toBe('/c/b%3Ageneral?org=team%3Aacme')
    expect(webHashFor(link)).toBe('#/c/b%3Ageneral?org=team%3Aacme')
    expect(webHashFor({ kind: 'join', code: CODE })).toBe(`#/join/${CODE}`)
  })
})
