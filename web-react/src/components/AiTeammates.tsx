import React, { useCallback, useEffect, useState } from 'react'
import { useT } from '../utils/i18n'

// AI teammates, in the Studio: Claude set up for the whole workspace, the
// way Claude Tag is in Slack. It works with the workspace's own Anthropic
// account (billed there); its tools' keys go to Anthropic's vault. Nothing
// secret ever comes back from the Worker: only whether it is set.

interface Tool { name: string; secretName: string; host: string; secretValue?: string }
interface Teammate {
  provider: string; name: string; handle: string; models: string[]
  enabled: boolean; hasApiKey: boolean; hasGithubToken: boolean
  repos: string[]; model: string; instructions: string; channels: string[] | null
  monthlyLimitUsd: number | null; spentThisMonthUsd: number; tools: Tool[]; ready: boolean
}
interface Channel { slug: string; name: string }

interface Draft {
  apiKey: string; githubToken: string; model: string; instructions: string; repos: string
  everywhere: boolean; channels: Set<string>; limit: string; tools: Tool[]
}

const draftOf = (tm: Teammate): Draft => ({
  apiKey: '', githubToken: '', model: tm.model, instructions: tm.instructions, repos: tm.repos.join('\n'),
  everywhere: tm.channels === null, channels: new Set((tm.channels || []).filter((c) => c.startsWith('b:')).map((c) => c.slice(2))),
  limit: tm.monthlyLimitUsd === null ? '' : String(tm.monthlyLimitUsd), tools: tm.tools.map((x) => ({ ...x, secretValue: '' })),
})

const usd = (n: number) => `$${n.toFixed(2)}`

export const AiTeammates: React.FC<{ httpBase: string; orgId: string; sessionToken: string }> = ({ httpBase, orgId, sessionToken }) => {
  const t = useT()
  const [tm, setTm] = useState<Teammate | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`${httpBase}/teammates?orgId=${encodeURIComponent(orgId)}&provider=claude`, { headers: { 'x-session-token': sessionToken } }).catch(() => null)
    const data = res?.ok ? await res.json().catch(() => null) : null
    if (!data?.teammate) { setFailed(true); return }
    setTm(data.teammate); setCanEdit(Boolean(data.canEdit)); setDraft(draftOf(data.teammate))
  }, [httpBase, orgId, sessionToken])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    let ignore = false
    fetch(`${httpBase}/businesses?orgId=${encodeURIComponent(orgId)}`, { headers: { 'x-session-token': sessionToken } })
      .then((r) => (r.ok ? r.json() : { businesses: [] }))
      .then((data) => { if (!ignore) setChannels((data.businesses || []).map((b: Channel) => ({ slug: b.slug, name: b.name }))) })
      .catch(() => {})
    return () => { ignore = true }
  }, [httpBase, orgId, sessionToken])

  const save = async (enabled?: boolean) => {
    if (!draft) return
    setBusy(true); setError(null); setNote(null)
    const body: Record<string, unknown> = {
      orgId, provider: 'claude', model: draft.model, instructions: draft.instructions,
      repos: draft.repos.split(/[\s,]+/).map((r) => r.trim()).filter(Boolean),
      channels: draft.everywhere ? null : [...draft.channels].map((s) => `b:${s}`),
      monthlyLimitUsd: draft.limit.trim() ? Number(draft.limit) : null,
      tools: draft.tools.map((x) => ({ name: x.name, secretName: x.secretName, host: x.host, ...(x.secretValue?.trim() ? { secretValue: x.secretValue.trim() } : {}) })),
    }
    if (draft.apiKey.trim()) body.apiKey = draft.apiKey.trim()
    if (draft.githubToken.trim()) body.githubToken = draft.githubToken.trim()
    if (enabled !== undefined) body.enabled = enabled
    try {
      const res = await fetch(`${httpBase}/teammates`, { method: 'PUT', headers: { 'x-session-token': sessionToken, 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.message || t('That did not save.')); return }
      setTm(data.teammate); setDraft(draftOf(data.teammate))
      setNote(enabled === true ? t('Claude is on. Write @claude in a channel to hand it work.') : enabled === false ? t('Claude is off.') : t('Saved.'))
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) } finally { setBusy(false) }
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d))
  const setTool = (i: number, patch: Partial<Tool>) => setDraft((d) => (d ? { ...d, tools: d.tools.map((x, j) => (j === i ? { ...x, ...patch } : x)) } : d))
  const toggleChannel = (slug: string) => setDraft((d) => {
    if (!d) return d
    const next = new Set(d.channels)
    if (next.has(slug)) next.delete(slug); else next.add(slug)
    return { ...d, channels: next }
  })

  if (failed) return <section className="studio-page" data-studio-page="teammates"><h1 className="studio-title">{t('AI teammates')}</h1><p className="form-error" role="alert">{t('That did not load.')}</p></section>
  if (!tm || !draft) return <section className="studio-page" data-studio-page="teammates"><h1 className="studio-title">{t('AI teammates')}</h1><p className="row-sub">{t('Loading…')}</p></section>

  const status = tm.enabled ? t('On') : tm.hasApiKey ? t('Off') : t('Not set up')
  const off = !canEdit || busy

  return (
    <section className="studio-page sso-page teammates-page" data-studio-page="teammates">
      <h1 className="studio-title">{t('AI teammates')}</h1>
      <p className="studio-lede">{t('Hand work to an AI in a channel, as you would to a colleague: write @claude in a thread and Claude takes it on in a sandbox of its own — reads your repositories, runs code, opens pull requests — and answers in the thread. It runs on your own Anthropic account, which is billed directly.')}</p>
      {note && <p className="rules-note" role="status">{note}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="sso-domain" data-teammate="claude">
        <div className="sso-domain-head">
          <span className="teammate-mark" aria-hidden="true">✳️</span>
          <b>Claude</b> <code>@{tm.handle}</code>
          <span className={`sso-badge${tm.enabled ? ' ok' : ''}`} data-teammate-status>{status}</span>
        </div>
        <p className="row-sub" data-teammate-spent>
          {tm.monthlyLimitUsd === null
            ? t('Spent this month: {spent}', { spent: usd(tm.spentThisMonthUsd) })
            : t('Spent this month: {spent} of {limit}', { spent: usd(tm.spentThisMonthUsd), limit: usd(tm.monthlyLimitUsd) })}
        </p>
        {canEdit && (
          <div className="rules-actions">
            {tm.enabled
              ? <button type="button" className="studio-btn" disabled={busy} data-teammate-off onClick={() => void save(false)}>{t('Turn off')}</button>
              : <button type="button" className="studio-btn primary" disabled={busy || (!tm.hasApiKey && !draft.apiKey.trim())} data-teammate-on onClick={() => void save(true)}>{t('Save and turn on')}</button>}
          </div>
        )}
      </div>

      <form className="teammate-form" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <div className="studio-section-head"><div><h2>{t('Anthropic account')}</h2><p>{t('Make an API key in the Claude Console, ideally in a workspace made for Claude here, so its use is billed and limited on its own.')}</p></div></div>
        <label className="teammate-field">
          <span>{t('API key')}</span>
          <input className="rules-number wide" type="password" autoComplete="off" disabled={off} value={draft.apiKey} placeholder={tm.hasApiKey ? t('Saved. Paste a new one to replace it.') : 'sk-ant-…'} onChange={(e) => set({ apiKey: e.target.value })} data-teammate-key />
        </label>
        <label className="teammate-field">
          <span>{t('Model')}</span>
          <select className="rules-number wide" disabled={off} value={draft.model} onChange={(e) => set({ model: e.target.value })} data-teammate-model>
            {tm.models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="teammate-field">
          <span>{t('Monthly limit (USD)')}</span>
          <input className="rules-number" type="number" min={1} step={1} disabled={off} value={draft.limit} placeholder={t('None')} onChange={(e) => set({ limit: e.target.value })} data-teammate-limit />
          <small>{t('When the month’s spending reaches it, Claude says so instead of starting work. Each task is also capped at what is left.')}</small>
        </label>
        <label className="teammate-field">
          <span>{t('Instructions')}</span>
          <textarea className="rules-number wide" rows={4} disabled={off} value={draft.instructions} placeholder={t('How your team works: conventions, where things are, what to avoid.')} onChange={(e) => set({ instructions: e.target.value })} data-teammate-instructions />
        </label>

        <div className="studio-section-head"><div><h2>{t('Code')}</h2><p>{t('The repositories Claude may clone and open pull requests on, and a GitHub token that can reach them. It never pushes to the default branch.')}</p></div></div>
        <label className="teammate-field">
          <span>{t('GitHub token')}</span>
          <input className="rules-number wide" type="password" autoComplete="off" disabled={off} value={draft.githubToken} placeholder={tm.hasGithubToken ? t('Saved. Paste a new one to replace it.') : 'github_pat_…'} onChange={(e) => set({ githubToken: e.target.value })} data-teammate-github />
        </label>
        <label className="teammate-field">
          <span>{t('Repositories')}</span>
          <textarea className="rules-number wide" rows={3} disabled={off} value={draft.repos} placeholder={'acme/app\nacme/api'} onChange={(e) => set({ repos: e.target.value })} data-teammate-repos />
          <small>{t('One per line, as owner/name. Up to 10.')}</small>
        </label>

        <div className="studio-section-head"><div><h2>{t('Tools')}</h2><p>{t('Services Claude may call, such as Linear or Sentry. Each key goes to Anthropic’s vault and is added only to requests to its host; Claude never sees it.')}</p></div></div>
        {draft.tools.map((x, i) => (
          <div key={i} className="teammate-tool" data-teammate-tool={x.name || i}>
            <input className="rules-number" disabled={off} value={x.name} placeholder={t('Name')} aria-label={t('Name')} onChange={(e) => setTool(i, { name: e.target.value })} />
            <input className="rules-number" disabled={off} value={x.secretName} placeholder="LINEAR_API_KEY" aria-label={t('Variable')} onChange={(e) => setTool(i, { secretName: e.target.value.toUpperCase() })} />
            <input className="rules-number" disabled={off} value={x.host} placeholder="api.linear.app" aria-label={t('Host')} onChange={(e) => setTool(i, { host: e.target.value })} />
            <input className="rules-number" type="password" autoComplete="off" disabled={off} value={x.secretValue || ''} placeholder={tm.tools.some((y) => y.secretName === x.secretName) ? t('Saved') : t('Key')} aria-label={t('Key')} onChange={(e) => setTool(i, { secretValue: e.target.value })} />
            {canEdit && <button type="button" className="studio-btn danger" disabled={busy} onClick={() => set({ tools: draft.tools.filter((_, j) => j !== i) })}>{t('Remove')}</button>}
          </div>
        ))}
        {canEdit && draft.tools.length < 20 && (
          <div className="rules-actions"><button type="button" className="studio-btn" disabled={busy} data-teammate-add-tool onClick={() => set({ tools: [...draft.tools, { name: '', secretName: '', host: '', secretValue: '' }] })}>{t('Add a tool')}</button></div>
        )}

        <div className="studio-section-head"><div><h2>{t('Channels')}</h2><p>{t('Where @claude takes work. Group conversations always count; elsewhere it says it is not set up.')}</p></div></div>
        <div className="teammate-where">
          <label><input type="radio" name="teammate-where" disabled={off} checked={draft.everywhere} onChange={() => set({ everywhere: true })} data-teammate-everywhere /> {t('Every channel')}</label>
          <label><input type="radio" name="teammate-where" disabled={off} checked={!draft.everywhere} onChange={() => set({ everywhere: false })} data-teammate-some /> {t('Only these channels')}</label>
        </div>
        {!draft.everywhere && (
          <ul className="teammate-channels">
            {channels.map((c) => (
              <li key={c.slug}><label><input type="checkbox" disabled={off} checked={draft.channels.has(c.slug)} onChange={() => toggleChannel(c.slug)} data-teammate-channel={c.slug} /> #{c.name}</label></li>
            ))}
            {!channels.length && <li className="row-sub">{t('No channels yet.')}</li>}
          </ul>
        )}

        {canEdit
          ? <div className="rules-actions teammate-save"><button type="submit" className="studio-btn primary" disabled={busy} data-teammate-save>{busy ? t('Saving…') : t('Save')}</button></div>
          : <p className="form-note">{t('An admin of this workspace can change these.')}</p>}
      </form>
    </section>
  )
}
