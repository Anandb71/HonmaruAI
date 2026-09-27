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
