import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StatusPopover } from './StatusPopover'

// The status popover, as it opens: before your settings have arrived.
describe('StatusPopover', () => {
  const html = renderToStaticMarkup(
    <StatusPopover
      httpBase="https://relay.test" orgId="org" sessionToken="token"
      me={{ name: 'Aya', url: null }} from="rail" anchor={{ current: null }}
      onClose={() => {}} onProfile={() => {}}
    />,
  )
  it('is a dialog, named, that says it is loading', () => {
    expect(html).toMatch(/^<div class="status-pop from-rail" role="dialog" aria-label="Status" tabindex="-1"/)
    expect(html).toContain('<h2>Aya</h2>')
    expect(html).toContain('role="status">Loading…</p>')
  })
  it('keeps the way to your profile, and a labelled way out', () => {
    expect(html).toContain('data-view-profile="1"')
    expect(html).toContain('View profile')
    expect(html).toContain('aria-label="Close"')
  })
})
