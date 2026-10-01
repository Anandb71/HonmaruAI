import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { renderRich, prefixLines, continueBlock } from './MessageParts'

const html = (text: string) => renderToStaticMarkup(<>{renderRich(text, () => 'mention')}</>)

// A message's formatting, the way Slack reads it.
describe('renderRich', () => {
  it('puts one blank line between a list and the paragraph after it, not two', () => {
    const out = html('*Done*\n- a\n- b\n\n*Tomorrow*\n- c')
    expect(out).toBe('<b>Done</b><ul class="slk-ul"><li>a</li><li>b</li></ul><br/><b>Tomorrow</b><ul class="slk-ul"><li>c</li></ul>')
  })

  it('still breaks plain lines, and a line straight after a list starts on its own', () => {
    expect(html('one\ntwo')).toBe('one<br/>two')
    expect(html('- a\nafter')).toBe('<ul class="slk-ul"><li>a</li></ul>after')
    expect(html('> quoted\nplain')).toBe('<blockquote class="slk-quote">quoted</blockquote>plain')
  })

  it('reads quoted lines one after another as one quote', () => {
    expect(html('> one\n> two\nafter')).toBe('<blockquote class="slk-quote">one<br/>two</blockquote>after')
  })

  it('draws a numbered list, keeping its numbers, apart from bullets', () => {
    expect(html('1. a\n2. b\n- c')).toBe('<ol class="slk-ol"><li value="1">a</li><li value="2">b</li></ol><ul class="slk-ul"><li>c</li></ul>')
  })
})

// Discord's marks, beside Slack's.
describe('renderRich, the Discord way', () => {
  it('hides a ||spoiler|| until it is revealed, and keeps the words out of the accessible name', () => {
    const out = html('the end: ||he was a ghost||!')
    expect(out).toBe('the end: <span class="slk-spoiler" role="button" tabindex="0" aria-label="Spoiler, press to reveal"><span aria-hidden="true">he was a ghost</span></span>!')
  })

  it('formats inside a spoiler, and a link inside it stops at the bars', () => {
    expect(html('||*big*||')).toContain('<span aria-hidden="true"><b>big</b></span>')
    expect(html('||https://x.test/a||')).toContain('<a href="https://x.test/a"')
  })

  it('reads __underline__ and ~~strike~~ as one mark, not two single ones', () => {
    expect(html('__under__')).toBe('<u>under</u>')
    expect(html('~~gone~~')).toBe('<s>gone</s>')
    expect(html('_it_ ~s~')).toBe('<i>it</i> <s>s</s>')
  })

  it('draws #, ## and ### headings and -# subtext as lines of their own', () => {
    expect(html('# Big\ntext')).toBe('<div class="slk-h slk-h1" role="heading" aria-level="3">Big</div>text')
    expect(html('### Small')).toBe('<div class="slk-h slk-h3" role="heading" aria-level="5">Small</div>')
    expect(html('-# fine print')).toBe('<div class="slk-subtext">fine print</div>')
  })

  it('leaves #channel, #hashtags and a lone # as they are', () => {
    expect(html('#general')).toBe('#general')
    expect(html('#### four')).toBe('#### four')
    expect(html('- a\n- b')).toBe('<ul class="slk-ul"><li>a</li><li>b</li></ul>')
  })
})

// A composer box, as far as the format buttons touch it.
function box(value: string, start: number, end = start) {
  const state = { value, el: { selectionStart: start, selectionEnd: end, focus() {}, setSelectionRange(a: number, b: number) { this.selectionStart = a; this.selectionEnd = b } } }
  return { state, set: (v: string) => { state.value = v } }
}
globalThis.requestAnimationFrame = ((f: FrameRequestCallback) => { f(0); return 0 }) as typeof requestAnimationFrame

describe('the quote and list buttons', () => {
  it('mark every selected line, and take the mark off again', () => {
    const { state, set } = box('one\ntwo', 0, 7)
    prefixLines(state.el as unknown as HTMLTextAreaElement, state.value, set, '> ')
    expect(state.value).toBe('> one\n> two')
    prefixLines(state.el as unknown as HTMLTextAreaElement, state.value, set, '> ')
    expect(state.value).toBe('one\ntwo')
  })

  it('mark the line the caret is on in an empty box, and keep the caret after the mark', () => {
    const { state, set } = box('', 0)
    prefixLines(state.el as unknown as HTMLTextAreaElement, state.value, set, '- ')
    expect(state.value).toBe('- ')
    expect(state.el.selectionStart).toBe(2)
  })

  it('turn a quote into a list rather than stack marks, and number a numbered one', () => {
    const { state, set } = box('> a\n> b', 0, 7)
    prefixLines(state.el as unknown as HTMLTextAreaElement, state.value, set, '1. ')
    expect(state.value).toBe('1. a\n2. b')
  })

  it('carry the mark to a new line, and end the list on an empty one', () => {
    const { state, set } = box('- milk', 6)
    expect(continueBlock(state.el as unknown as HTMLTextAreaElement, state.value, set)).toBe(true)
    expect(state.value).toBe('- milk\n- ')
    state.el.selectionStart = state.el.selectionEnd = state.value.length
    expect(continueBlock(state.el as unknown as HTMLTextAreaElement, state.value, set)).toBe(true)
    expect(state.value).toBe('- milk\n')
    const n = box('1. a', 4)
    continueBlock(n.state.el as unknown as HTMLTextAreaElement, n.state.value, n.set)
    expect(n.state.value).toBe('1. a\n2. ')
    const plain = box('hello', 5)
    expect(continueBlock(plain.state.el as unknown as HTMLTextAreaElement, plain.state.value, plain.set)).toBe(false)
  })
})

describe('a Jam recording in a message', () => {
  it('plays where it was posted; any other link stays a link', () => {
    const url = 'https://api.example.com/channels/jam/audio/0f8b3c3e-1111-4222-8333-944455556666'
    expect(html(`Recording: ${url}`)).toBe(`Recording: <audio class="slk-jam-audio" controls="" preload="none" src="${url}"></audio>`)
    expect(html('see https://example.com/channels/jam/audio/nope')).toContain('<a href="https://example.com/channels/jam/audio/nope"')
  })
})

describe('the links a message unfurls', () => {
  it('takes the first two, trims punctuation, skips a Jam recording', async () => {
    const { unfurlable } = await import('./MessageParts')
    expect(unfurlable('see https://a.example/x, and https://b.example/y! https://c.example/z')).toEqual(['https://a.example/x', 'https://b.example/y'])
    expect(unfurlable('https://h.example/channels/jam/audio/0f8fad5b-d9cb-469f-a165-70867728950e')).toEqual([])
    expect(unfurlable('no links')).toEqual([])
  })
})

describe('who reacted', () => {
  it('is a sentence in the reader’s language, with the rest counted when there are many', async () => {
    const { reactorNames } = await import('./MessageParts')
    const more = (n: number) => `${n} others`
    expect(reactorNames(['Aya', 'Ken', 'You'], 'en', more)).toBe('Aya, Ken, and You')
    expect(reactorNames(['Aya'], 'en', more)).toBe('Aya')
    expect(reactorNames(['あや', 'けん', 'あなた'], 'ja', more)).toBe('あや、けん、あなた')
    const many = Array.from({ length: 15 }, (_, i) => `P${i + 1}`)
    expect(reactorNames(many, 'en', more)).toBe('P1, P2, P3, P4, P5, P6, P7, P8, P9, P10, P11, P12, and 3 others')
  })
})

describe('the typing line', () => {
  it('shows who is typing with the dots, kept out of a screen reader’s way', async () => {
    const { TypingLine } = await import('./MessageParts')
    const out = renderToStaticMarkup(<TypingLine names={['Aki', 'Ben']} />)
    expect(out).toContain('<div class="slk-typing-people" data-typing="1">')
    expect(out).toContain('<span class="slk-typing-now" aria-hidden="true"><span class="slk-dots"><i></i><i></i><i></i></span><span class="slk-typing-text">Aki and Ben are typing…</span></span>')
    // Its own polite region, told once the line is on screen.
    expect(out).toContain('<span class="sr-only" role="status" aria-live="polite" aria-atomic="true"></span>')
  })

  it('keeps its region with nobody typing, so the next one is heard', async () => {
    const { TypingLine } = await import('./MessageParts')
    expect(renderToStaticMarkup(<TypingLine names={[]} />)).toBe('<div class="slk-typing-people"><span class="sr-only" role="status" aria-live="polite" aria-atomic="true"></span></div>')
  })
})
