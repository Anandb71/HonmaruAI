import React, { useEffect, useState } from 'react'
import { useT } from '../utils/i18n'

interface Unused { slug: string; name: string; createdAt: string; cards: number }

/// Channels nobody talks in — most made when the AI filed cards under names
/// it made up — offered to archive in one go. Archiving hides a channel from
/// every list; its cards and history stay. Nothing shows when there are none.
export const TidyChannels: React.FC<{ httpBase: string; orgId: string; sessionToken: string }> = ({ httpBase, orgId, sessionToken }) => {
  const t = useT()
  const [list, setList] = useState<Unused[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<number | null>(null)
  const headers = { 'x-session-token': sessionToken }

  useEffect(() => {
    fetch(`${httpBase}/businesses/unused?orgId=${encodeURIComponent(orgId)}`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { const l: Unused[] = d?.channels || []; setList(l); setPicked(new Set(l.map((c) => c.slug))) })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [httpBase, orgId, sessionToken])

  if (!list.length && done === null) return null
  const archive = async () => {
    if (!picked.size) return
    setBusy(true)
    const res = await fetch(`${httpBase}/businesses/archive`, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ orgId, slugs: [...picked] }),
    }).catch(() => null)
    const data = res?.ok ? await res.json().catch(() => null) : null
    setBusy(false)
    if (data) { setDone(data.archived || 0); setList((l) => l.filter((c) => !picked.has(c.slug))); setPicked(new Set()) }
  }
  return (
    <section className="pf-sec pf-biz" data-tidy-channels="1">
      <div className="rows-title">{t('Channels nobody talks in')}</div>
      <p className="hint" style={{ margin: '0 4px 10px', color: 'var(--ash)', fontSize: 12.5 }}>{t('tidy.blurb')}</p>
      {done !== null && <p className="hint" role="status" style={{ margin: '0 4px 10px', fontSize: 12.5 }}>{t('{n} archived.', { n: done })}</p>}
      {list.length > 0 && (
        <>
          <ul className="tidy-list">
            {list.map((c) => (
              <li key={c.slug}>
                <label>
                  <input type="checkbox" checked={picked.has(c.slug)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(c.slug); else n.delete(c.slug); return n })} />
                  <span className="tidy-name">#{c.name}</span>
                  <span className="tidy-meta">{t('{n} cards', { n: c.cards })}</span>
                </label>
              </li>
            ))}
          </ul>
          <button type="button" className="pill-btn" disabled={busy || !picked.size} onClick={() => void archive()} data-archive-channels="1">
            {busy ? t('Archiving…') : t('Archive {n}', { n: picked.size })}
          </button>
        </>
      )}
    </section>
  )
}
