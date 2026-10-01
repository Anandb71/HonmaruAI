import { describe, it, expect, vi } from 'vitest'
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

  it('draws a line of nothing but emoji large, and emoji among words as they are', () => {
    expect(html('🎉')).toBe('<span class="slk-emoji big">🎉</span>')
    expect(html('👍 🙏\nthanks 🙏')).toBe('<span class="slk-emoji big">👍 🙏</span><br/>thanks 🙏')
    expect(html('- 🚀')).toBe('<ul class="slk-ul"><li><span class="slk-emoji big">🚀</span></li></ul>')
    expect(html('*🎉* shipped')).toBe('<b>🎉</b> shipped')
    expect(html('*🎉*')).toBe('<b>🎉</b>')
    expect(html('`🎉`')).toBe('<code class="slk-code">🎉</code>')
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

describe('the emoji picker', () => {
  it('opens on a search box, the usual emoji, and every group once the list is here', async () => {
    const { EmojiPicker } = await import('./MessageParts')
    const { loadEmojiData } = await import('../utils/emojiSearch')
    const draw = () => renderToStaticMarkup(<EmojiPicker onPick={() => {}} onClose={() => {}} />)
    const before = draw()
    expect(before).toContain('<input class="slk-picker-search" type="search" placeholder="Search emoji" aria-label="Search emoji"')
    expect(before).toContain('Frequently used')
    expect(before).not.toContain('Smileys &amp; people')
    // It says the rest is on its way, rather than look complete.
    expect(before).toContain('data-emoji-list="loading">Loading…</p>')
    await loadEmojiData()
    const after = draw()
    expect(after).toContain('Smileys &amp; people')
    expect(after).not.toContain('data-emoji-list')
    expect(after).toContain('aria-label="👍" title=":+1:"')
    // One stop for Tab; the arrows do the rest.
    expect(after.match(/tabindex="0"/g)).toHaveLength(1)
    expect(after.match(/data-cell="/g)!.length).toBeGreaterThan(380)
  })
})

describe('the hover bar’s reactions', () => {
  it('are the usual three, then the ones you reacted with last, each staying where it is', async () => {
    const { QuickReactions } = await import('./MessageParts')
    const { rememberEmoji } = await import('../utils/emojiSearch')
    const bar = () => [...renderToStaticMarkup(<QuickReactions onReact={() => {}} />).matchAll(/aria-label="React with ([^"]+)"/g)].map((m) => m[1])
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} })
    expect(bar()).toEqual(['✅', '👀', '🙌'])
    rememberEmoji('🔥')
    expect(bar()).toEqual(['✅', '👀', '🔥'])
    // One already in the bar, clicked: it does not move from under the pointer.
    rememberEmoji('👀')
    expect(bar()).toEqual(['✅', '👀', '🔥'])
    rememberEmoji('🎉')
    expect(bar()).toEqual(['🎉', '👀', '🔥'])
    vi.unstubAllGlobals()
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
