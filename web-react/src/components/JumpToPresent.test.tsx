import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { JumpToPresent, newBelowLabel } from './JumpToPresent'
import { t } from '../utils/i18n'

const draw = (count: number) => renderToStaticMarkup(<JumpToPresent count={count} onJump={() => {}} />)

// "Jump to present": what it draws while the reader is up in the history.
describe('JumpToPresent', () => {
  it('is a button that says where it goes, and its key', () => {
    const html = draw(0)
    expect(html).toContain('class="slk-present"')
    expect(html).toContain('type="button"')
    expect(html).toContain('aria-keyshortcuts="Shift+PageDown"')
    expect(html).toContain('<span>Jump to present</span>')
  })

  it('shows no count when nothing new waits below', () => {
    expect(draw(0)).not.toContain('<b>')
  })

  it('counts what waits below, one and many, before the words', () => {
    expect(draw(1)).toMatch(/<b>1 new message<\/b><span>Jump to present<\/span>/)
    expect(draw(12)).toContain('<b>12 new messages</b>')
  })

  it('puts the count in the same words a screen reader is told', () => {
    expect(newBelowLabel(1, t)).toBe('1 new message')
    expect(newBelowLabel(3, t)).toBe('3 new messages')
  })
})
