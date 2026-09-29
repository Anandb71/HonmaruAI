import { describe, it, expect } from 'vitest'
import { mentionQuery, matchMembers, insertMention, mentionedRefs, splitMentions, mentionKind, mentionSegments, mentionsEveryone, broadcastOf } from './mentions'

const team = [
  { ref: 'r1', name: 'Toru Bando' },
  { ref: 'r2', name: 'Mika Sato', aliases: ['美香'] },
  { ref: 'r3', name: 'Kenji' },
]

describe('mentions', () => {
  it('knows when the caret is inside an @', () => {
    expect(mentionQuery('ask @Mi', 7)).toEqual({ start: 4, query: 'Mi' })
    expect(mentionQuery('ask @Mika to', 12)).toBeNull()
    expect(mentionQuery('mail toru@x.jp', 14)).toBeNull()
    expect(mentionQuery('@', 1)).toEqual({ start: 0, query: '' })
  })

  it('offers the team, best match first', () => {
    expect(matchMembers(team, 'mi').map((m) => m.ref)).toEqual(['r2'])
    expect(matchMembers(team, 'sato').map((m) => m.ref)).toEqual(['r2'])
    expect(matchMembers(team, '美').map((m) => m.ref)).toEqual(['r2'])
    expect(matchMembers(team, '').map((m) => m.ref)).toEqual(['r3', 'r2', 'r1'])
    expect(matchMembers(team, 'zzz')).toEqual([])
  })

  it('puts the name in and moves the caret past it', () => {
    expect(insertMention('ask @Mi please', 7, team[1])).toEqual({ text: 'ask @Mika  please', caret: 10 })
  })

  it('reads the refs of whoever was named, by first name, full name or alias', () => {
    expect(mentionedRefs('@Mika and @Toru: look. @美香 too, @nobody not', team)).toEqual(['r2', 'r1'])
    expect(mentionedRefs('nothing here', team)).toEqual([])
  })

  it('hears @channel, @all and @here as everyone — with ＠, and after Japanese words', () => {
    for (const text of ['@channel 見て', '@all', '＠all 確認', '確認お願いします@channel', '@allの皆さん', '@here']) expect(mentionsEveryone(text)).toBe(true)
    for (const text of ['@alliance', '@channels', 'toru@all.jp', 'https://youtube.com/@channel', '@Mika']) expect(mentionsEveryone(text)).toBe(false)
    expect(broadcastOf('@all')).toBe('channel')
    expect(broadcastOf('＠here')).toBe('here')
    expect(mentionKind('@all', team)).toBe('group')
    // A decision is still asked of the people named, not everyone.
    expect(mentionedRefs('@channel please decide', team)).toEqual([])
    expect(mentionedRefs('確認@Mika', team)).toEqual(['r2'])
  })

  it('offers @all once it is typed, and hears @everyone as everyone', () => {
    const specials = [
      { ref: '__channel', name: 'channel', handle: 'channel', special: 'channel' as const },
      { ref: '__all', name: 'all', handle: 'all', special: 'channel' as const },
    ]
    expect(matchMembers([...specials, ...team], '').map((m) => m.ref)).not.toContain('__all')
    expect(matchMembers([...specials, ...team], 'al').map((m) => m.ref)).toContain('__all')
    expect(mentionsEveryone('@everyone 見て')).toBe(true)
  })

  it('offers names after ＠ and right after Japanese words', () => {
    expect(mentionQuery('確認@Mi', 5)).toEqual({ start: 2, query: 'Mi' })
    expect(mentionQuery('＠ch', 3)).toEqual({ start: 0, query: 'ch' })
    expect(mentionQuery('mail a@b', 8)).toBeNull()
  })

  it('splits a line so each @Name can be drawn', () => {
    expect(splitMentions('hi @Mika, and @Kenji')).toEqual([
      { text: 'hi ', mention: false }, { text: '@Mika', mention: true },
      { text: ', and ', mention: false }, { text: '@Kenji', mention: true },
    ])
  })
})

describe('usernames', () => {
  const team = [
    { ref: 'r1', name: 'Mika Sato', handle: 'mikas' },
    { ref: 'r2', name: 'Kenji', handle: null },
  ]
  it('finds a person by username and writes the username', () => {
    expect(matchMembers(team, 'mik').map((m) => m.ref)).toEqual(['r1'])
    expect(insertMention('ask @mi', 7, team[0]).text).toBe('ask @mikas ')
    // No username: the first name, as before.
    expect(insertMention('ask @ke', 7, team[1]).text).toBe('ask @Kenji ')
  })
  it('reads a username back out of a sentence', () => {
    expect(mentionedRefs('@mikas approve the price', team)).toEqual(['r1'])
    expect(mentionedRefs('@Mika approve the price', team)).toEqual(['r1'])
  })
})


describe('mentionKind', () => {
  const list = [
    { ref: '__ai', name: 'AI' },
    { ref: 'm1', name: 'Mika Sato', handle: 'mika' },
    { ref: 'group:sales', name: 'Sales', handle: 'sales' },
    { ref: 'agent:a1', name: 'Hayao', handle: 'hayao' },
  ]
  it('names who a mention reaches, and nobody for a name nobody has', () => {
    expect(mentionKind('@AI', list)).toBe('ai')
    expect(mentionKind('@mika', list)).toBe('person')
    expect(mentionKind('@Mika', list)).toBe('person')
    expect(mentionKind('@sales', list)).toBe('group')
    expect(mentionKind('@hayaoに', list)).toBe('agent')
    expect(mentionKind('＠hayao', list)).toBe('agent')
    expect(mentionKind('@nobody', list)).toBeNull()
  })
  it('cuts a text into runs that join back exactly', () => {
    const text = '@mika and @nobody, ask @hayaoに'
    const parts = mentionSegments(text, list)
    expect(parts.map((p) => p.text).join('')).toBe(text)
    expect(parts.filter((p) => p.mention).map((p) => [p.text, p.kind])).toEqual([['@mika', 'person'], ['@nobody', null], ['@hayaoに', 'agent']])
    expect(mentionSegments('mail a@b.com', list).some((p) => p.mention)).toBe(false)
  })
})

describe('the "@" list, as Slack orders it', () => {
  const list = [
    { ref: 'out', name: 'Ryan Haraki', outside: true },
    { ref: 'agent:1', name: 'jack', handle: 'jack', agent: true },
    { ref: 'p1', name: 'Gota Wazumi' },
    { ref: '__agents', name: 'agents', handle: 'agents', special: 'agents' as const, handles: ['ando', 'jack'] },
    { ref: '__here', name: 'here', handle: 'here', special: 'here' as const },
  ]
  it('puts @here and @agents first, then people here, then agents, then people outside', () => {
    expect(matchMembers(list, '').map((m) => m.ref)).toEqual(['__agents', '__here', 'p1', 'agent:1', 'out'])
  })
  it('writes out every agent for @agents', () => {
    expect(insertMention('@ag', 3, list[3]).text).toBe('@ando @jack ')
    expect(insertMention('hi @he', 6, list[4]).text).toBe('hi @here ')
  })
})
