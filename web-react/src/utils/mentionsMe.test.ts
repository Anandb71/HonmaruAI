import { describe, it, expect } from 'vitest'
import { mentionsMe, namesMe, meReader, type Reader } from './mentionsMe'

// A message that calls you is marked; one that only looks like it is not.
describe('mentionsMe', () => {
  const people = [
    { ref: 'u1', name: 'Anand Babu', handle: 'anand', mine: true },
    { ref: 'u2', name: 'Kenji Sato', handle: 'kenji' },
    { ref: 'u3', name: 'Mika Sato', aliases: ['みか'] },
  ]
  const reader: Reader = {
    people,
    groups: [{ handle: 'design', refs: ['u1', 'u2'] }, { handle: 'sales', refs: ['u2', 'u3'] }],
  }
  const from = (body: string, author = 'u2') => ({ body, authorRef: author, mine: false })

  it('is you, named directly', () => {
    expect(mentionsMe(from('@anand can you look?'), reader)).toBe(true)
    expect(mentionsMe(from('thanks @Anand'), reader)).toBe(true)
    expect(mentionsMe(from('@AnandBabu the draft is up'), reader)).toBe(true)
    expect(mentionsMe(from('＠anand 確認お願いします'), reader)).toBe(true)
    expect(mentionsMe(from('確認@anand'), reader)).toBe(true)
    expect(mentionsMe(from('(cc @anand)'), reader)).toBe(true)
  })

  it('is not somebody else named', () => {
    expect(mentionsMe(from('@kenji can you look?'), reader)).toBe(false)
    expect(mentionsMe(from('@みか ありがとう'), reader)).toBe(false)
    expect(mentionsMe(from('@nobody hello'), reader)).toBe(false)
    expect(mentionsMe(from('no mention at all'), reader)).toBe(false)
  })

  // Two Kenjis: "@" writes each by the whole name ("@KenjiMori"), and a bare
  // "@Kenji" typed by hand reaches whichever the list has first — in the
  // Worker too, which is who it notifies. So it calls you only if that is you.
  it('is you by a shared first name only when you are the first with it', () => {
    const kenjis = [
      { ref: 'u2', name: 'Kenji Sato' },
      { ref: 'u4', name: 'Kenji Mori', mine: true },
    ]
    expect(mentionsMe(from('@Kenji can you look?', 'u9'), { people: kenjis })).toBe(false)
    expect(namesMe('@Kenji', kenjis)).toBe(false)
    expect(mentionsMe(from('@KenjiMori can you look?', 'u9'), { people: kenjis })).toBe(true)
    expect(namesMe('@KenjiMori', kenjis)).toBe(true)
    const meFirst = [...kenjis].reverse()
    expect(mentionsMe(from('@Kenji can you look?', 'u9'), { people: meFirst })).toBe(true)
    expect(namesMe('@Kenji', meFirst)).toBe(true)
  })

  it('is you through a group you are in, not one you are not', () => {
    expect(mentionsMe(from('@design review please'), reader)).toBe(true)
    expect(mentionsMe(from('@Design review please'), reader)).toBe(true)
    expect(mentionsMe(from('@sales numbers are in'), reader)).toBe(false)
    expect(mentionsMe(from('@design review please'), { people })).toBe(false)
  })

  it('is you when everyone is called', () => {
    for (const body of ['@here standup in 5', '@channel heads up', '@all please read', '@everyone ship it', '＠channelへ共有', '確認@channel']) {
      expect(mentionsMe(from(body), reader)).toBe(true)
    }
    expect(mentionsMe(from('@alliance meeting'), reader)).toBe(false)
    expect(mentionsMe(from('@herein lies the rub'), reader)).toBe(false)
  })

  it('is never your own message', () => {
    expect(mentionsMe({ body: '@anand note to self', mine: true }, reader)).toBe(false)
    expect(mentionsMe(from('@channel heads up', 'u1'), reader)).toBe(false)
    expect(mentionsMe(from('@design review please', 'u1'), reader)).toBe(false)
  })

  it('is not an address or a link that has an @ in it', () => {
    expect(mentionsMe(from('mail anand@example.com'), reader)).toBe(false)
    expect(mentionsMe(from('write to kenji@anand'), reader)).toBe(false)
    expect(mentionsMe(from('see https://youtube.com/@anand'), reader)).toBe(false)
    expect(mentionsMe(from('ops@here.jp is the list'), reader)).toBe(false)
    expect(mentionsMe(from('team@design.io'), reader)).toBe(false)
  })

  it('is nothing until the team has loaded', () => {
    expect(mentionsMe(from('@anand @channel'), { people: [] })).toBe(false)
    expect(mentionsMe(from('@channel'), { people: people.map((p) => ({ ...p, mine: false })) })).toBe(false)
    expect(mentionsMe({ body: '' }, reader)).toBe(false)
  })
})

describe('namesMe', () => {
  const people = [
    { ref: 'u1', name: 'Anand Babu', handle: 'anand', mine: true },
    { ref: 'u2', name: 'Kenji Sato', handle: 'kenji' },
  ]
  it('marks your own @name and nobody else’s', () => {
    expect(namesMe('@anand', people)).toBe(true)
    expect(namesMe('＠Anand', people)).toBe(true)
    expect(namesMe('@kenji', people)).toBe(false)
    expect(namesMe('@channel', people)).toBe(false)
    expect(namesMe('@anand', people.map((p) => ({ ...p, mine: false })))).toBe(false)
  })
})

// The same answers, kept for one team: what the conversation asks of every
// message each time it is drawn.
describe('meReader', () => {
  const people = [
    { ref: 'u1', name: 'Anand Babu', handle: 'anand', mine: true },
    { ref: 'u2', name: 'Kenji Sato', handle: 'kenji' },
  ]
  const reader: Reader = { people, groups: [{ handle: 'design', refs: ['u1'] }, { handle: 'sales', refs: ['u2'] }] }

  it('answers as mentionsMe and namesMe do, the second time too', () => {
    const kept = meReader(reader)
    for (const body of ['@anand hi', '@kenji hi', '@channel', '@design', '@sales', 'mail anand@example.com', 'no mention', '']) {
      for (const authorRef of ['u2', 'u1']) {
        const said = { body, authorRef }
        expect(kept.mentionsMe(said)).toBe(mentionsMe(said, reader))
        expect(kept.mentionsMe(said)).toBe(mentionsMe(said, reader))
      }
    }
    for (const token of ['@anand', '＠Anand', '@kenji', '@channel', '@nobody']) {
      expect(kept.namesMe(token)).toBe(namesMe(token, people))
      expect(kept.namesMe(token)).toBe(namesMe(token, people))
    }
  })

  it('keeps what the words say, not who wrote them', () => {
    const kept = meReader(reader)
    expect(kept.mentionsMe({ body: '@channel heads up', authorRef: 'u2' })).toBe(true)
    expect(kept.mentionsMe({ body: '@channel heads up', authorRef: 'u1' })).toBe(false)
    expect(kept.mentionsMe({ body: '@channel heads up', mine: true })).toBe(false)
    expect(kept.mentionsMe({ body: '@channel heads up', authorRef: 'u2' })).toBe(true)
  })

  it('still answers right once it has kept too many and started over', () => {
    const kept = meReader(reader)
    for (let i = 0; i < 2500; i++) {
      expect(kept.mentionsMe({ body: `@anand #${i}`, authorRef: 'u2' })).toBe(true)
      expect(kept.mentionsMe({ body: `@kenji #${i}`, authorRef: 'u1' })).toBe(false)
    }
  })

  it('is nobody until the team has loaded', () => {
    const kept = meReader({ people: [] })
    expect(kept.mentionsMe({ body: '@channel', authorRef: 'u2' })).toBe(false)
    expect(kept.namesMe('@anand')).toBe(false)
  })
})
