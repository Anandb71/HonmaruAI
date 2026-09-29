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
})
