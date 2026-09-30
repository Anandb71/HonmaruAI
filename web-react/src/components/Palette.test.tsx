import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Palette, pointerMoved } from './Palette'
import type { Place } from '../utils/places'

const api = { httpBase: 'http://relay.test', orgId: 'org-1', sessionToken: 'session' }
const noop = () => {}
const html = (props: Partial<React.ComponentProps<typeof Palette>>) =>
  renderToStaticMarkup(<Palette {...api} cards={[]} onPick={noop} onClose={noop} {...props} />)
/// The rows, in order, by the conversation each opens.
const rows = (out: string) => [...out.matchAll(/data-view="([^"]+)"/g)].map((m) => m[1])

const places: Place[] = [
  { view: 'b:general', kind: 'channel', name: 'general', handle: 'general' },
  { view: 'b:board', kind: 'channel', name: 'board', handle: 'board', private: true, unread: 3 },
  { view: 'dm:r1', kind: 'person', name: 'Kenji Tanaka', handle: 'kenji', mentions: 2 },
  { view: 'g:abc', kind: 'group', name: 'Kenji Tanaka, Ana Ruiz', fresh: true },
  { view: 'ag:7', kind: 'agent', name: 'Hayao', handle: 'hayao' },
]

// ⌘K opened with nothing typed: where to go before anything else.
describe('Palette, with nothing typed', () => {
  it('lists conversations first: the one before, then what calls for you — not the one you are in', () => {
    const out = html({ places, recent: ['b:general', 'ag:7'], current: 'b:general' })
    expect(rows(out)).toEqual(['ag:7', 'dm:r1', 'b:board', 'g:abc'])
    expect(out.indexOf('Conversations')).toBeGreaterThan(-1)
    expect(out.indexOf('Conversations')).toBeLessThan(out.indexOf('Go to'))
    // The first row is the one Enter takes: back to where you were.
    expect(out).toMatch(/aria-selected="true"[^>]*data-view="ag:7"/)
  })

  it('says what each one is and what waits there, in words as well as marks', () => {
    const out = html({ places, recent: ['b:general'] })
    const row = (view: string) => out.slice(out.indexOf(`data-view="${view}"`), out.indexOf('</li>', out.indexOf(`data-view="${view}"`)))
    expect(row('b:general')).toContain('<span class="palette-lead" aria-hidden="true">#</span>')
    expect(row('b:board')).toContain('<svg')
    expect(row('b:board')).toContain('<span class="sr-only">Private</span>')
    expect(row('b:board')).toContain('<span aria-hidden="true">3</span><span class="sr-only">3 waiting on you</span>')
    expect(row('dm:r1')).toContain('<span class="palette-lead" aria-hidden="true">@</span>')
    expect(row('dm:r1')).toContain('<span class="palette-meta">@kenji</span>')
    expect(row('dm:r1')).toContain('<span aria-hidden="true">@2</span><span class="sr-only">2 mentions of you</span>')
    expect(row('g:abc')).toContain('<span class="palette-fresh"><span class="sr-only">New messages</span></span>')
  })

  it('knows the channels before the list has ever been drawn', () => {
    const out = html({ businesses: [{ slug: 'front-desk', name: 'Front desk' }, { slug: 'ops', name: 'Ops' }], recent: ['b:ops'] })
    expect(rows(out)).toEqual(['b:ops'])
    expect(out).toContain('>Ops</span>')
  })

  it('tells how to jump to a conversation in the box itself', () => {
    expect(html({})).toContain('placeholder="Jump to a conversation, or search messages and decisions')
  })
})

// A pointer resting on the list while ↓ scrolls it does not take the
// highlight back.
describe('pointerMoved', () => {
  it('is a move only where the pointer is somewhere else on the screen', () => {
    expect(pointerMoved({ x: 400, y: 300 }, { screenX: 400, screenY: 300, movementX: 0, movementY: 0 })).toBe(false)
    expect(pointerMoved({ x: 400, y: 300 }, { screenX: 400, screenY: 302 })).toBe(true)
  })

  it('judges the first move by how far it went', () => {
    expect(pointerMoved(null, { screenX: 400, screenY: 300, movementX: 0, movementY: 0 })).toBe(false)
    expect(pointerMoved(null, { screenX: 400, screenY: 300, movementX: 3, movementY: 0 })).toBe(true)
  })
})
