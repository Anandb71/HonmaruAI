import { describe, expect, it, vi, afterEach } from 'vitest'
import { soundForMessage, rememberLevel, rememberLevels, levelOf } from './sound'

// When a message arriving makes a sound, and which.
describe('soundForMessage', () => {
  const channel = { mine: false, channel: 'b:cafe', mentionsMe: false }
  it('is silent for what you wrote yourself', () => {
    expect(soundForMessage({ ...channel, mine: true }, { level: 'all', open: false })).toBe(null)
  })
  it('knocks for a direct message or a mention, drops for a channel message', () => {
    expect(soundForMessage({ ...channel, channel: 'dm:abc' }, { level: 'all', open: false })).toBe('mention')
    expect(soundForMessage({ ...channel, mentionsMe: true }, { level: 'all', open: false })).toBe('mention')
    expect(soundForMessage(channel, { level: 'all', open: false })).toBe('message')
  })
  it('respects mute and mentions-only', () => {
    expect(soundForMessage({ ...channel, mentionsMe: true }, { level: 'mute', open: false })).toBe(null)
    expect(soundForMessage(channel, { level: 'mentions', open: false })).toBe(null)
    expect(soundForMessage({ ...channel, mentionsMe: true }, { level: 'mentions', open: false })).toBe('mention')
  })
  it('keeps a channel thread reply quiet unless it names you', () => {
    expect(soundForMessage({ ...channel, parentId: 'm1' }, { level: 'all', open: false })).toBe(null)
    expect(soundForMessage({ ...channel, parentId: 'm1', mentionsMe: true }, { level: 'all', open: false })).toBe('mention')
  })
  it('only ticks in the conversation you are looking at', () => {
    expect(soundForMessage({ ...channel, channel: 'dm:abc' }, { level: 'all', open: true })).toBe('inConversation')
  })
})

// What the socket reads to decide on a sound or a notification.
describe('conversation levels, as this browser remembers them', () => {
  afterEach(() => vi.unstubAllGlobals())
  const storage = () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) } })
  }

  it('writes one conversation without touching the others', () => {
    storage()
    rememberLevels('org', { 'b:a': 'mute', 'b:b': 'mentions' })
    rememberLevel('org', 'b:c', 'mute')
    rememberLevel('org', 'b:a', 'all')
    expect(levelOf('org', 'b:a')).toBe('all')
    expect(levelOf('org', 'b:b')).toBe('mentions')
    expect(levelOf('org', 'b:c')).toBe('mute')
  })

  it('works before anything was remembered', () => {
    storage()
    rememberLevel('org', 'dm:x', 'mute')
    expect(levelOf('org', 'dm:x')).toBe('mute')
  })
})
