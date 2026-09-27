import React, { useCallback, useEffect, useState } from 'react'
import { useT } from '../utils/i18n'

// More apps, through Smithery Connect (docs/smithery-apps.md). An owner
// chooses which apps the workspace allows; each person connects their own,
// and only their own AI conversation reads it. Nothing here shows or takes a
// connection ID: the server finds yours by who you are.

interface App {
  server: string; name: string; description: string | null; iconUrl: string | null
  verified: boolean; allowWrites: boolean
  connection?: { state: string; since: string } | null
}
interface Found { server: string; name: string; description: string; iconUrl: string | null; verified: boolean; useCount: number; homepage: string | null }

export const SmitheryApps: React.FC<{ httpBase: string; orgId: string; sessionToken: string }> = ({ httpBase, orgId, sessionToken }) => {
  const t = useT()
  const [data, setData] = useState<{ configured: boolean; apps: App[]; canConnect: boolean; canManage: boolean } | null>(null)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Found[] | null>(null)
  const [writes, setWrites] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const q = `orgId=${encodeURIComponent(orgId)}`
  const headers = { 'x-session-token': sessionToken, 'content-type': 'application/json' }

  const load = useCallback(async () => {
    const res = await fetch(`${httpBase}/orgs/apps?${q}`, { headers: { 'x-session-token': sessionToken } }).catch(() => null)
    if (res?.ok) setData(await res.json())
  }, [httpBase, orgId, sessionToken])
  useEffect(() => { void load() }, [load])
  // Back from Smithery's page in another tab: how it stands now.
  useEffect(() => {
    const again = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', again)
    return () => document.removeEventListener('visibilitychange', again)
  }, [load])

  const send = async (path: string, method: string, body: Record<string, unknown> | null, done?: string) => {
    setBusy(true); setError(null); setNote(null)
    try {
      const res = await fetch(`${httpBase}${path}`, { method, headers, ...(body ? { body: JSON.stringify({ orgId, ...body }) } : {}) })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setError(out.message || t('That did not work.')); return null }
      if (done) setNote(done)
      await load()
      return out
    } finally { setBusy(false) }
  }

  const search = async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`${httpBase}/orgs/apps/registry?${q}&q=${encodeURIComponent(query)}`, { headers: { 'x-session-token': sessionToken } })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setError(out.message || t('That did not work.')); return }
      setFound(out.servers || [])
    } finally { setBusy(false) }
  }

  const connect = async (server: string) => {
    // Opened now, while the click still counts, so no pop-up blocker stops it.
    const tab = window.open('', '_blank')
    const out = await send('/apps/connect', 'POST', { server })
    if (out?.setupUrl && tab) { tab.opener = null; tab.location.href = out.setupUrl }
    else tab?.close()
    if (out && !out.setupUrl) setNote(t('Connected.'))
  }

  if (!data) return null
  const allowed = new Set(data.apps.map((a) => a.server))
  const stateLabel = (s: string) => s === 'connected' ? t('Connected') : s === 'auth_required' || s === 'input_required' || s === 'pending' ? t('Finish signing in') : s === 'missing' ? t('Connect again') : t('Not working')

  return (
    <div className="smithery-apps" data-smithery-apps>
      <div className="studio-rule"><span>{t('More apps, through Smithery')}</span><i /></div>
      <p className="studio-hint">{t('What you connect here is yours alone: only your own conversation with your AI reads it, never a channel or anyone else. It reads, and does not write, unless an owner allowed it.')}</p>
      {!data.configured && <div className="form-note">{t('Not set up on this server yet.')}</div>}
      {note && <p className="rules-note" role="status">{note}</p>}
      {error && <div className="form-error">{error}</div>}
      {data.configured && data.apps.length === 0 && <p className="studio-hint">{data.canManage ? t('No apps are allowed yet. Choose some below.') : t('No apps are allowed in this workspace yet. An owner chooses them.')}</p>}
      {data.apps.map((a) => (
        <div key={a.server} className="sso-domain" data-smithery-app={a.server} data-smithery-state={a.connection?.state || 'none'}>
          <div className="sso-domain-head">
            {a.iconUrl && <img src={a.iconUrl} alt="" width={18} height={18} referrerPolicy="no-referrer" />}
            <b>{a.name}</b>
            {a.verified && <span className="sso-badge ok">{t('Verified')}</span>}
            {a.allowWrites && <span className="sso-badge">{t('Can write')}</span>}
            {a.connection && <span className={`sso-badge${a.connection.state === 'connected' ? ' ok' : ''}`}>{stateLabel(a.connection.state)}</span>}
          </div>
          {a.description && <p className="row-sub">{a.description}</p>}
          <div className="rules-actions">
            {data.canConnect && (!a.connection || a.connection.state !== 'connected') && <button type="button" className="studio-btn" disabled={busy} data-smithery-connect onClick={() => void connect(a.server)}>{a.connection ? t('Finish signing in') : t('Connect')}</button>}
            {a.connection && <button type="button" className="studio-btn" disabled={busy} onClick={() => void send(`/apps/connect?${q}&server=${encodeURIComponent(a.server)}`, 'DELETE', null, t('Disconnected.'))}>{t('Disconnect')}</button>}
            {data.canManage && <button type="button" className="studio-btn danger" disabled={busy} onClick={() => { if (window.confirm(t('Take {app} away? Everyone’s connection to it ends.', { app: a.name }))) void send(`/orgs/apps?${q}&server=${encodeURIComponent(a.server)}`, 'DELETE', null, t('Taken away.')) }}>{t('Take away')}</button>}
          </div>
        </div>
      ))}
      {data.canManage && data.configured && (
        <div className="sso-domain" data-smithery-manage>
          <p className="row-sub">{t('Choose which apps people here may connect. What their AI reads from an app passes through Smithery (smithery.ai), a company in the United States; your data rules and audit log do not see inside it.')}</p>
          <form className="rules-actions" onSubmit={(e) => { e.preventDefault(); void search() }}>
            <input className="rules-number wide" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search Smithery, e.g. Linear')} data-smithery-search />
            <button type="submit" className="studio-btn" disabled={busy}>{t('Search')}</button>
          </form>
          {found && found.length === 0 && <p className="row-sub">{t('Nothing found.')}</p>}
          {found?.map((f) => (
            <div key={f.server} className="dlg-secret" data-smithery-found={f.server}>
              <span><b>{f.name}</b>{f.verified ? ` · ${t('Verified')}` : ` · ${t('Not verified')}`}<br /><span className="row-sub">{f.description}</span></span>
              <label className="row-sub"><input type="checkbox" checked={Boolean(writes[f.server])} onChange={(e) => setWrites({ ...writes, [f.server]: e.target.checked })} /> {t('Let the AI write (create, send, change)')}</label>
              <button type="button" className="studio-btn" disabled={busy || allowed.has(f.server)} onClick={() => void send('/orgs/apps', 'POST', { server: f.server, allowWrites: Boolean(writes[f.server]) }, t('Allowed. People can connect it now.'))}>{allowed.has(f.server) ? t('Allowed') : t('Allow')}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
