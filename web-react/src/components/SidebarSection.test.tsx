import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SidebarSection } from './SidebarSection'

const quiet = { cards: 0, mentions: 0, fresh: false }
const draw = (props: Partial<React.ComponentProps<typeof SidebarSection>>) => renderToStaticMarkup(
  <SidebarSection id="channels" label="Channels" shut={false} onFold={() => {}} badge={quiet} rows={[]} empty="No channels yet." {...props} />,
)
const plus = <button type="button" className="cl-add" aria-expanded="true" />
const box = <form className="cl-add-form" />

// One section of the sidebar, open and folded.
describe('a sidebar section', () => {
  it('open, lists its rows under a header that says so', () => {
    const html = draw({ rows: [<li key="a">kitchen</li>, <li key="b">front-desk</li>] })
    expect(html).toContain('data-section="channels"')
    expect(html).toMatch(/class="cl-fold" aria-expanded="true"/)
    expect(html).toContain('<ul><li>kitchen</li><li>front-desk</li></ul>')
    expect(html).not.toContain('cl-empty')
    expect(html).not.toContain('cl-badge')
  })

  it('open and empty, says what goes there', () => {
    const html = draw({})
    expect(html).toContain('<p class="cl-empty">No channels yet.</p>')
    expect(html).not.toContain('<ul>')
  })

  it('folded, keeps the rows it is given and counts what waits in its header', () => {
    const html = draw({ shut: true, rows: [<li key="a">kitchen</li>], badge: { cards: 3, mentions: 2, fresh: true } })
    expect(html).toMatch(/class="cl-section folded"/)
    expect(html).toMatch(/class="cl-fold" aria-expanded="false"/)
    expect(html).toContain('<ul><li>kitchen</li></ul>')
    expect(html).toContain('<span class="cl-badge mention" aria-hidden="true">@2</span>')
    expect(html).toContain('<span class="cl-badge" aria-hidden="true">3</span>')
    // The dot is for when nothing louder is said.
    expect(html).not.toContain('cl-fresh')
    expect(draw({ shut: true, badge: { cards: 0, mentions: 0, fresh: true } })).toContain('cl-fresh')
  })

  it('folded and empty, says nothing under its header', () => {
    const html = draw({ shut: true })
    expect(html).not.toContain('cl-empty')
    expect(html).not.toContain('<ul>')
  })

  // Folds outlive a reload: "+" on a section folded last week must still
  // open its box, not flip aria-expanded over nothing.
  it('folded, still draws what its "+" opened', () => {
    const html = draw({ shut: true, action: plus, below: box })
    expect(html).toMatch(/class="cl-fold" aria-expanded="false"/)
    expect(html).toContain('<button type="button" class="cl-add" aria-expanded="true"></button>')
    expect(html).toContain('<form class="cl-add-form"></form>')
    // After the rows that still call for you, as when it is open.
    const withRow = draw({ shut: true, action: plus, below: box, rows: [<li key="a">kitchen</li>] })
    expect(withRow).toMatch(/<\/ul><form class="cl-add-form"><\/form><\/section>$/)
    expect(draw({ action: plus, below: box, rows: [<li key="a">kitchen</li>] })).toMatch(/<\/ul><form class="cl-add-form"><\/form><\/section>$/)
  })

  it('draws nothing under it until "+" is pressed', () => {
    expect(draw({ shut: true, action: plus, below: null })).toMatch(/<\/h2><\/section>$/)
  })
})
