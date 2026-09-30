import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import type { IconName } from './Icon'

/// A menu that opens where you right-clicked, the way a desktop chat app's
/// does: items, a line between groups, a small heading, a tick beside the
/// choice that is on, and a submenu that opens to the side. Escape, a click
/// elsewhere or a scroll closes it; the arrow keys walk it.
///
/// A strip is a row of small buttons side by side — a message's quick
/// reactions, along the top as Discord has them. ← and → walk along it;
/// ↑ and ↓ take the whole row as one item.

export type MenuEntry =
  | { kind: 'item'; label: string; onSelect?: () => void; icon?: IconName; checked?: boolean; danger?: boolean; hint?: string; submenu?: MenuEntry[]; data?: string; disabled?: boolean }
  | { kind: 'sep' }
  | { kind: 'head'; label: string }
  | { kind: 'strip'; label: string; items: StripItem[] }

/// One button in a strip: a character (an emoji) or an icon, and what it
/// is called for a screen reader and on hover.
export interface StripItem { label: string; text?: string; icon?: IconName; onSelect: () => void; data?: string }

interface Props {
  at: { x: number; y: number }
  entries: MenuEntry[]
  label: string
  onClose: () => void
}

// A strip counts once, by its first button, so ↑ and ↓ step over it whole.
const items = (el: HTMLElement | null) => (el ? [...el.querySelectorAll<HTMLButtonElement>(':scope > li > button:not([disabled]), :scope > li > [role="group"] > button:first-child')] : [])

/// ← and → along a strip, round from one end to the other.
const walkStrip = (e: React.KeyboardEvent<HTMLElement>) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  const all = [...e.currentTarget.querySelectorAll<HTMLButtonElement>(':scope > button')]
  const at = Math.max(0, all.indexOf(document.activeElement as HTMLButtonElement))
  e.preventDefault(); e.stopPropagation()
  all[(at + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length]?.focus()
}

function List({ entries, onClose, onBack, level, label }: { entries: MenuEntry[]; onClose: () => void; onBack?: () => void; level: number; label?: string }) {
  const ref = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [flip, setFlip] = useState(false)
  useLayoutEffect(() => {
    // A submenu that would run off the right edge opens to the left.
    const el = ref.current
    if (!el || level === 0) return
    const box = el.getBoundingClientRect()
    if (box.right > window.innerWidth - 4) setFlip(true)
  }, [level])
  useEffect(() => { if (level > 0) items(ref.current)[0]?.focus() }, [level])
  const onKeyDown = (e: React.KeyboardEvent) => {
    const list = items(ref.current)
    // Anywhere along a strip is the strip's place in the list.
    const active = document.activeElement as HTMLElement | null
    const strip = active?.parentElement?.getAttribute('role') === 'group' ? active.parentElement : null
    const at = list.indexOf((strip?.firstElementChild ?? active) as HTMLButtonElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); list[(at + 1) % list.length]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); list[(at - 1 + list.length) % list.length]?.focus() }
    else if (e.key === 'ArrowLeft' && onBack) { e.preventDefault(); e.stopPropagation(); onBack() }
  }
  return (
    <ul ref={ref} role="menu" aria-label={label} className={`row-menu-list${level ? ' sub' : ''}${flip ? ' flip' : ''}`} onKeyDown={onKeyDown}>
      {entries.map((entry, i) => {
        if (entry.kind === 'sep') return <li key={i} role="separator" className="row-menu-sep" />
        if (entry.kind === 'head') return <li key={i} role="presentation" className="row-menu-head">{entry.label}</li>
        if (entry.kind === 'strip') {
          return (
            <li key={i} role="none" className="row-menu-strip">
              <div role="group" aria-label={entry.label} onKeyDown={walkStrip}>
                {entry.items.map((it, j) => (
                  <button key={j} type="button" role="menuitem" aria-label={it.label} title={it.label} data-row-menu={it.data}
                    onClick={() => { onClose(); it.onSelect() }}>
                    {it.icon ? <Icon name={it.icon} size={17} /> : it.text}
                  </button>
                ))}
              </div>
            </li>
          )
        }
        const sub = entry.submenu && entry.submenu.length > 0
        return (
          <li key={i} role="none" onMouseEnter={() => setOpen(sub ? i : null)} onMouseLeave={() => { if (sub) setOpen(null) }}>
            <button
              type="button"
              role={entry.checked !== undefined ? 'menuitemradio' : 'menuitem'}
              aria-checked={entry.checked !== undefined ? entry.checked : undefined}
              aria-haspopup={sub ? 'menu' : undefined}
              aria-expanded={sub ? open === i : undefined}
              className={`${entry.danger ? 'danger' : ''}${entry.checked ? ' checked' : ''}`}
              disabled={entry.disabled}
              data-row-menu={entry.data}
              onClick={() => {
                if (sub) { setOpen(open === i ? null : i); return }
                onClose()
                entry.onSelect?.()
              }}
              onKeyDown={(e) => { if (sub && (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); setOpen(i) } }}
            >
              <span className="row-menu-mark" aria-hidden="true">
                {entry.checked ? <Icon name="check" size={14} /> : entry.icon ? <Icon name={entry.icon} size={14} /> : null}
              </span>
              <span className="row-menu-label">{entry.label}</span>
              {entry.hint && <span className="row-menu-hint">{entry.hint}</span>}
              {sub && <span className="row-menu-more" aria-hidden="true"><Icon name="chevron-right" size={13} /></span>}
            </button>
            {sub && open === i && (
              <List entries={entry.submenu!} onClose={onClose} level={level + 1}
                onBack={() => { setOpen(null); (ref.current?.children[i]?.querySelector('button') as HTMLButtonElement | null)?.focus() }} />
            )}
          </li>
        )
      })}
    </ul>
  )
}

export const RowMenu: React.FC<Props> = ({ at, entries, label, onClose }) => {
  const ref = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{ left: number; top: number }>({ left: at.x, top: at.y })
  // Kept on screen: a menu opened near the bottom or the right edge moves in.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const box = el.getBoundingClientRect()
    setPlace({
      left: Math.max(4, Math.min(at.x, window.innerWidth - box.width - 4)),
      top: Math.max(4, Math.min(at.y, window.innerHeight - box.height - 4)),
    })
  }, [at.x, at.y])
  // Shut, it hands the focus back to what had it — the message or the row
  // it was opened on — so a keyboard carries on from there. Not when what
  // was picked has taken the focus for itself (the box to edit in, a dialog).
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    const box = ref.current
    return () => {
      const now = document.activeElement
      if (before?.isConnected && (!now || now === document.body || box?.contains(now))) before.focus({ preventScroll: true })
    }
  }, [])
  useEffect(() => {
    items(ref.current?.querySelector('ul') as HTMLElement | null)[0]?.focus()
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    const gone = () => onClose()
    document.addEventListener('mousedown', away, true)
    document.addEventListener('keydown', key)
    window.addEventListener('blur', gone)
    window.addEventListener('resize', gone)
    document.addEventListener('scroll', gone, true)
    return () => {
      document.removeEventListener('mousedown', away, true)
      document.removeEventListener('keydown', key)
      window.removeEventListener('blur', gone)
      window.removeEventListener('resize', gone)
      document.removeEventListener('scroll', gone, true)
    }
  }, [onClose])
  return (
    <div ref={ref} className="row-menu" style={place} onContextMenu={(e) => e.preventDefault()}>
      {/* The name goes on the menu itself: on a plain box a screen reader says nothing of it. */}
      <List entries={entries} onClose={onClose} level={0} label={label} />
    </div>
  )
}
