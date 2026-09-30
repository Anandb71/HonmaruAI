import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RowMenu } from './RowMenu'

// The sidebar's right-click menu: what it draws before anyone touches it.
describe('RowMenu', () => {
  const html = renderToStaticMarkup(
    <RowMenu at={{ x: 10, y: 20 }} label="#kitchen" onClose={() => {}} entries={[
      { kind: 'item', label: 'Star channel', icon: 'star', data: 'star' },
      { kind: 'item', label: 'Copy', submenu: [{ kind: 'item', label: 'Copy link' }], data: 'copy' },
      { kind: 'sep' },
      { kind: 'head', label: 'Notify you about…' },
      { kind: 'item', label: 'All new posts', checked: false },
      { kind: 'item', label: 'Just mentions', checked: true },
      { kind: 'item', label: 'Leave channel', danger: true },
    ]} />,
  )
  it('draws the items, a line, the heading and a tick on the choice that is on', () => {
    expect(html).toContain('data-row-menu="star"')
    expect(html).toContain('role="separator"')
    expect(html).toContain('Notify you about…')
    expect(html).toMatch(/aria-checked="true" class=" checked"[^>]*>.*Just mentions/)
    expect(html).toMatch(/aria-checked="false"[^>]*>.*All new posts/)
    expect(html).toContain('class="danger"')
  })
  it('keeps a submenu shut until it is opened, and says it has one', () => {
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).not.toContain('Copy link')
  })
  it('names the menu itself, where a screen reader reads it', () => {
    expect(html).toMatch(/^<div class="row-menu"[^>]*><ul role="menu" aria-label="#kitchen"/)
  })
})

// A message's right-click menu: its quick reactions in a row along the top.
describe('a strip in a RowMenu', () => {
  const html = renderToStaticMarkup(
    <RowMenu at={{ x: 10, y: 20 }} label="Message actions" onClose={() => {}} entries={[
      { kind: 'strip', label: 'Add reaction', items: [
        { label: 'React with ✅', text: '✅', onSelect: () => {}, data: 'react:✅' },
        { label: 'React with 👀', text: '👀', onSelect: () => {}, data: 'react:👀' },
        { label: 'Add reaction', icon: 'smile', onSelect: () => {}, data: 'react-more' },
      ] },
      { kind: 'sep' },
      { kind: 'item', label: 'Reply in thread', data: 'reply' },
    ]} />,
  )
  it('is one named group of menu items, each named for a screen reader, above the rest', () => {
    expect(html).toMatch(/<li role="none" class="row-menu-strip"><div role="group" aria-label="Add reaction">/)
    expect(html).toMatch(/<button[^>]*role="menuitem" aria-label="React with ✅"[^>]*data-row-menu="react:✅"[^>]*>✅<\/button>/)
    expect(html).toMatch(/aria-label="Add reaction"[^>]*data-row-menu="react-more"[^>]*><svg/)
    expect(html.indexOf('row-menu-strip')).toBeLessThan(html.indexOf('Reply in thread'))
  })
})
