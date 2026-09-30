import React, { useEffect, useState } from 'react'
import { useT } from '../utils/i18n'

interface Archived { slug: string; name: string; private: boolean; archivedAt: string }

/// Channels that were archived, newest first, each with a way back. A
/// restored channel returns to everyone's sidebar with all it held. Nothing
/// shows when there are none.
export const ArchivedChannels: React.FC<{ httpBase: string; orgId: string; sessionToken: string }> = ({ httpBase, orgId, sessionToken }) => {
  const t = useT()
  const [list, setList] = useState<Archived[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const headers = { 'x-session-token': sessionToken }

  useEffect(() => {
    fetch(`${httpBase}/businesses/archived?orgId=${encodeURIComponent(orgId)}`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setList(d?.channels || []))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [httpBase, orgId, sessionToken])

  if (!list.length && done === null) return null
  const restore = async (c: Archived) => {
    setBusy(c.slug); setProblem(null)
    const res = await fetch(`${httpBase}/businesses/unarchive`, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ orgId, slug: c.slug }),
    }).catch(() => null)
    setBusy(null)
    if (!res?.ok) { setProblem(((await res?.json().catch(() => null))?.message) || t('That did not work. Try again.')); return }
    setList((l) => l.filter((x) => x.slug !== c.slug))
    setDone(c.name)
    window.dispatchEvent(new Event('honmaru:reload-businesses'))
  }
  return (
    <section className="pf-sec pf-biz" data-archived-channels="1">
      <div className="rows-title">{t('Archived channels')}</div>
      {done !== null && <p className="hint" role="status" style={{ margin: '0 4px 10px', fontSize: 12.5 }}>{t('Restored #{name}', { name: done })}</p>}
      {problem && <p className="hint" role="alert" style={{ margin: '0 4px 10px', fontSize: 12.5, color: '#e5484d' }}>{problem}</p>}
      {list.length > 0 && (
        <ul className="tidy-list">
          {list.map((c) => (
            <li key={c.slug}>
              <div className="tidy-row">
                <span className="tidy-name">{c.private ? '🔒 ' : '#'}{c.name}</span>
                <span className="tidy-meta">{new Date(c.archivedAt).toLocaleDateString()}</span>
                <button type="button" className="pill-btn" disabled={busy !== null} onClick={() => void restore(c)} data-restore-channel={c.name}>
                  {busy === c.slug ? t('Restoring…') : t('Restore')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
