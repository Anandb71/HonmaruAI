import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProfileCard } from './ProfileCard'
import type { ProfilePerson } from './ProfileCard'

// A teammate's popout, as it is drawn before anyone touches it.
describe('ProfileCard', () => {
  const now = Date.parse('2026-10-01T12:05:00Z')
  const mika: ProfilePerson = {
    ref: 'm1', name: 'Mika Sato', handle: 'mika', title: 'admin', avatarUrl: 'https://img.example/mika.png',
    status: { emoji: '🍜', text: 'Lunch', until: '2026-10-01T13:00:00Z' }, awayUntil: null, timezone: 'Asia/Tokyo',
  }
  const draw = (person: ProfilePerson, opts: { online?: boolean; message?: boolean } = {}) => renderToStaticMarkup(
    <ProfileCard person={person} online={opts.online ?? true} anchor={null} now={now}
      onMessage={opts.message === false ? undefined : () => {}} onFullProfile={() => {}} onClose={() => {}} />,
  )

  it('is a dialog named by the person, with their photo and whether they are here', () => {
    const html = draw(mika)
    expect(html).toMatch(/role="dialog" aria-labelledby="([^"]+)"[^>]*>.*<h2 id="\1" class="slk-popout-name">Mika Sato<\/h2>/)
    expect(html).toContain('src="https://img.example/mika.png"')
    expect(html).toContain('class="cl-presence on" role="img" aria-label="Online"')
    expect(draw(mika, { online: false })).toContain('class="cl-presence" role="img" aria-label="Offline"')
  })

  it('says who they are, what they are up to and the time where they are', () => {
    const html = draw(mika)
    expect(html).toContain('@mika')
    expect(html).toContain('<p class="slk-popout-title">Admin</p>')
    expect(html).toContain('Lunch')
    // 21:05 in Tokyo, however this machine's language writes it.
    expect(html).toMatch(/(9:05|21:05)[^<]*local time/)
  })

  it('leaves out a status and an away whose time is up', () => {
    const html = draw({ ...mika, status: { emoji: '📅', text: 'In a meeting', until: '2026-10-01T11:00:00Z' }, awayUntil: '2026-09-30T00:00:00Z' })
    expect(html).not.toContain('In a meeting')
    expect(html).not.toContain('slk-popout-status')
    expect(html).not.toContain('slk-popout-away')
    expect(draw({ ...mika, awayUntil: '2026-10-09T00:00:00Z' })).toContain('slk-popout-away')
  })

  it('offers Message only where there is a conversation to open, and always the full profile', () => {
    expect(draw(mika)).toContain('data-popout-message="1"')
    const yours = draw({ ...mika, mine: true }, { message: false })
    expect(yours).not.toContain('data-popout-message')
    expect(yours).toContain('View full profile')
  })

  it('stays out of sight until it has been placed beside what opened it', () => {
    expect(draw(mika)).toMatch(/style="left:0;top:0;visibility:hidden"/)
  })
})
