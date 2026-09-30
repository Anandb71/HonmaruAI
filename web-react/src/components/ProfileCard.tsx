import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Avatar, tintFor } from './Avatar'
import { Icon } from './Icon'
import { useT } from '../utils/i18n'
import { getLocale } from '../utils/locale'
import { statusShown, awayShown, localTime, placeCard } from '../utils/people'
import type { PersonStatus, Placement } from '../utils/people'

/// A teammate's card, as a chat client pops it out beside a face, a name or
/// an @mention: their photo and whether they are here, who they are, what
/// they are up to, their clock, and the two ways on — write to them, or read
/// the whole profile. It opens over the conversation and closes the way a
/// popover does (Escape, a click elsewhere, focus moving away), so a thread
/// open beside the conversation stays open.

/// What the card shows: the member list's view at once, what the profile
/// read adds (their timezone) once it has it.
export interface ProfilePerson {
  ref: string
  name: string
  handle?: string | null
  title?: string | null
  avatarUrl?: string | null
  status?: PersonStatus | null
  awayUntil?: string | null
  timezone?: string | null
  mine?: boolean
}

interface Props {
  person: ProfilePerson
  online: boolean
  /// What it opened from: it stands beside it, and Escape goes back to it.
  anchor: HTMLElement | null
  /// Their conversation — absent for you, or for someone with none to open.
  onMessage?: () => void
  onFullProfile: () => void
  onClose: () => void
  /// The time it is, pinned by a test; otherwise the card keeps its own.
  now?: number
}

const same = (a: Placement | null, b: Placement) => Boolean(a && a.left === b.left && a.top === b.top && a.side === b.side && a.up === b.up)

export const ProfileCard: React.FC<Props> = ({ person, online, anchor, onMessage, onFullProfile, onClose, now }) => {
  const t = useT()
  const locale = getLocale()
  const nameId = useId()
  const box = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  // Their clock moves while the card is open.
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    if (now !== undefined) return
    const id = setInterval(() => setClock(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [now])
  const at = now ?? clock

  // Beside what it opened from, measured before it is seen; again when the
  // window or the conversation under it moves. Offset sizes: the opening
  // animation scales it, and a scaled box measures short.
  const [place, setPlace] = useState<Placement | null>(null)
  const measure = useCallback(() => {
    const el = box.current
    if (!el || !anchor) return
    // What it stood beside is gone (another conversation opened).
    if (!anchor.isConnected) { closeRef.current(); return }
    const next = placeCard(anchor.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, { width: el.offsetWidth, height: el.offsetHeight })
    setPlace((prev) => (same(prev, next) ? prev : next))
  }, [anchor])
  useLayoutEffect(measure)
  useEffect(() => {
    let frame = 0
    const again = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure) }
    window.addEventListener('resize', again)
    document.addEventListener('scroll', again, true)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', again); document.removeEventListener('scroll', again, true) }
  }, [measure])

  // Focus comes into the card, so a screen reader says whose it is and Tab
  // reaches its buttons; Escape takes it back to what opened it. A click
  // elsewhere closes it and leaves focus where that click put it. Escape is
  // caught on the way down, before the conversation's own Escape (which
  // closes the thread) hears it.
  useEffect(() => {
    box.current?.focus({ preventScroll: true })
    const away = (e: PointerEvent) => {
      const target = e.target as Node
      if (box.current?.contains(target) || anchor?.contains(target)) return
      closeRef.current()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault(); e.stopPropagation()
      closeRef.current()
      if (anchor?.isConnected) anchor.focus({ preventScroll: true })
    }
    document.addEventListener('pointerdown', away, true)
    document.addEventListener('keydown', key, true)
    return () => {
      document.removeEventListener('pointerdown', away, true)
      document.removeEventListener('keydown', key, true)
    }
  }, [anchor])

  const status = statusShown(person.status, at)
  const away = awayShown(person.awayUntil, at)
  const local = localTime(person.timezone, at, locale)
  const title = person.title ? t(person.title.charAt(0).toUpperCase() + person.title.slice(1)) : ''
  const [, tint] = tintFor(person.name)

  return (
    <div
      ref={box}
      className={`slk-popout${place ? ` ${place.side}${place.up ? ' up' : ''}` : ''}`}
      role="dialog"
      aria-labelledby={nameId}
      tabIndex={-1}
      data-popout={person.ref}
      style={place ? { left: place.left, top: place.top } : { left: 0, top: 0, visibility: 'hidden' }}
      // Tabbing out of it is leaving it.
      onBlur={(e) => { const to = e.relatedTarget as Node | null; if (to && !e.currentTarget.contains(to) && to !== anchor) onClose() }}
    >
      <div className="slk-popout-banner" style={{ background: tint }} aria-hidden="true" />
      <div className="slk-popout-face">
        <Avatar name={person.name} url={person.avatarUrl} size={72} />
        <span className={`cl-presence${online ? ' on' : ''}`} role="img" aria-label={online ? t('Online') : t('Offline')} />
      </div>
      <div className="slk-popout-body">
        <h2 id={nameId} className="slk-popout-name">{person.name}</h2>
        {person.handle && <p className="slk-popout-handle">@{person.handle}</p>}
        {title && <p className="slk-popout-title">{title}</p>}
        {status && (
          <p className="slk-popout-status">
            {status.emoji && <span className="slk-popout-emoji">{status.emoji}</span>}
            {status.text && <span>{status.text}</span>}
          </p>
        )}
        {away && <p className="slk-popout-away">{t('Away until {when}', { when: new Date(away).toLocaleDateString(locale, { month: 'short', day: 'numeric' }) })}</p>}
        {local && <p className="slk-popout-local"><Icon name="clock" size={13} /> {t('{time} local time', { time: local })}</p>}
        <div className="slk-popout-actions">
          {onMessage && <button type="button" className="slk-send" onClick={onMessage} data-popout-message="1">{t('Message')}</button>}
          <button type="button" className="cl-nudge" onClick={onFullProfile} data-popout-full="1">{t('View full profile')}</button>
        </div>
      </div>
    </div>
  )
}
