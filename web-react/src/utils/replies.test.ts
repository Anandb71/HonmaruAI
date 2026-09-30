import { describe, it, expect } from 'vitest'
import type { ChannelMessage } from '../types/card'
import { SPOILER_MASK, replyExcerpt, quoteOf, refreshQuotes, excerptParts } from './replies'

const msg = (over: Partial<ChannelMessage> = {}): ChannelMessage => ({
  id: 'm1', channel: 'b:cafe', kind: 'message', body: 'Roaster wants +8%', authorName: 'Mika', authorRef: 'r-mika',
  mine: false, cardId: null, createdAt: '2026-10-01T09:00:00.000Z', ...over,
})

// The same cases the Worker's test reads (test/inline-reply.test.js): the
// bar over the composer quotes a message exactly as the reply will.
describe('replyExcerpt', () => {
  it('puts it on one line and cuts it with an ellipsis', () => {
    expect(replyExcerpt('one\n\ntwo   three')).toBe('one two three')
    expect(replyExcerpt('x'.repeat(200))).toBe(`${'x'.repeat(119)}…`)
    expect(replyExcerpt('x'.repeat(120))).toBe('x'.repeat(120))
    // An emoji is not split in two by the cut.
    expect(Array.from(replyExcerpt('😀'.repeat(130)))).toHaveLength(120)
  })

  it('hides every spoiler, even one the cut would have halved', () => {
    expect(replyExcerpt('a ||b|| c ||d\ne|| f')).toBe(`a ${SPOILER_MASK} c ${SPOILER_MASK} f`)
    const long = replyExcerpt(`${'a'.repeat(110)} ||the secret that runs past the cut||`)
    expect(long).not.toContain('secret')
    expect(long).not.toContain('||')
  })

  it('reads bars inside code as code, not as a spoiler', () => {
    expect(replyExcerpt('run `a || b` then ||c||')).toBe(`run \`a || b\` then ${SPOILER_MASK}`)
    expect(replyExcerpt('```if (a || b) {}``` ok')).toBe('```if (a || b) {}``` ok')
    expect(replyExcerpt('a || b')).toBe('a || b')
  })

  it('names a file when there are no words', () => {
    expect(replyExcerpt('', 'plan.pdf')).toBe('📎 plan.pdf')
    expect(replyExcerpt('see this', 'plan.pdf')).toBe('see this')
    expect(replyExcerpt(null)).toBe('')
  })
})

describe('quoteOf', () => {
  it('quotes a teammate by name and ref, the AI by neither', () => {
    expect(quoteOf(msg({ body: 'the code is ||1234||' }))).toEqual({
      id: 'm1', kind: 'message', authorName: 'Mika', authorRef: 'r-mika', excerpt: `the code is ${SPOILER_MASK}`, deleted: false,
    })
    expect(quoteOf(msg({ kind: 'ai', authorName: null, authorRef: null }))).toMatchObject({ kind: 'ai', authorName: null, authorRef: null })
  })

  it('says only that an unsent message is gone', () => {
    expect(quoteOf(msg({ deleted: true, body: '' }))).toEqual({ id: 'm1', kind: null, authorName: null, authorRef: null, excerpt: '', deleted: true })
  })

  it('names the first file of a message that is only files', () => {
    const file = { id: 'f1', name: 'menu.png', type: 'image/png', size: 10, url: '/f1' }
    expect(quoteOf(msg({ body: '', files: [file] })).excerpt).toBe('📎 menu.png')
  })
})

describe('refreshQuotes', () => {
  const original = msg()
  const reply = msg({ id: 'm2', body: 'too much', authorName: 'Toru', authorRef: 'r-toru', replyTo: quoteOf(original) })
  const other = msg({ id: 'm3', body: 'unrelated' })

  it('brings an edit into every reply that quotes it', () => {
    const next = refreshQuotes([original, reply, other], { ...original, body: 'Roaster wants +6%', editedAt: '2026-10-01T09:05:00.000Z' })
    expect(next[1].replyTo?.excerpt).toBe('Roaster wants +6%')
    expect(next[2]).toBe(other)
  })

  it('marks the quote gone once the original is unsent', () => {
    const next = refreshQuotes([reply, other], { ...original, deleted: true, body: '' })
    expect(next[0].replyTo).toMatchObject({ id: 'm1', deleted: true, excerpt: '', authorName: null })
  })

  it('hands back the same list when nothing quotes the message', () => {
    const list = [original, other]
    expect(refreshQuotes(list, { ...other, body: 'changed' })).toBe(list)
  })
})

describe('excerptParts', () => {
  it('splits an excerpt at each hidden spoiler', () => {
    expect(excerptParts(`a ${SPOILER_MASK} b`)).toEqual(['a ', null, ' b'])
    expect(excerptParts(`${SPOILER_MASK}${SPOILER_MASK}`)).toEqual([null, null])
    expect(excerptParts('plain')).toEqual(['plain'])
    expect(excerptParts('')).toEqual([])
  })
})
