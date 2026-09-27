import React, { useEffect, useState } from 'react'
import type { ChannelMessage } from '../types/card'
import { useLanguage, useT } from '../utils/i18n'

// An agent's or the AI's reply in the reader's own language. Someone asked
// in theirs; everyone else reads it in their own, with the original a tap
// away. Made once per language on the server and kept there; here only
// what this screen has already been handed is remembered.

const made = new Map<string, { lang: string; body: string } | null>()
const asking = new Map<string, Promise<{ lang: string; body: string } | null>>()

async function ask(api: { httpBase: string; orgId: string; sessionToken: string }, channel: string, m: ChannelMessage, lang: string) {
  const key = `${m.id}:${lang}:${m.body.length}`
  if (made.has(key)) return made.get(key) || null
  if (!asking.has(key)) {
    asking.set(key, (async () => {
      // A reply only just written is usually being translated already.
      const age = Date.now() - Date.parse(m.createdAt || '')
      if (age >= 0 && age < 20_000) await new Promise((r) => setTimeout(r, 4000))
      const res = await fetch(`${api.httpBase}/channels/messages/translate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-session-token': api.sessionToken },
        body: JSON.stringify({ orgId: api.orgId, channel, messageId: m.id, locale: lang }),
      }).catch(() => null)
      const out = res?.ok ? ((await res.json().catch(() => ({}))).translation || null) : null
      made.set(key, out)
      asking.delete(key)
      return out
    })())
  }
  return asking.get(key)!
}

export const ReplyText: React.FC<{
  m: ChannelMessage
  channel: string
  api: { httpBase: string; orgId: string; sessionToken: string }
  render: (text: string) => React.ReactNode
}> = ({ m, channel, api, render }) => {
  const t = useT()
  const lang = useLanguage()
  const reply = m.kind === 'agent' || m.kind === 'ai'
  const differs = reply && Boolean(m.lang) && m.lang !== lang && Boolean(m.body)
  const given = m.translation && m.translation.lang === lang ? m.translation : null
  const [fetched, setFetched] = useState<{ lang: string; body: string } | null>(null)
  const [original, setOriginal] = useState(false)
  useEffect(() => {
    setFetched(null)
    if (!differs || given) return
    let live = true
    void ask(api, channel, m, lang).then((out) => { if (live && out?.lang === lang) setFetched(out) })
    return () => { live = false }
  }, [m.id, m.body, lang, differs, Boolean(given)])
  const translation = given || fetched
  if (!differs || !translation) return <>{render(m.body)}</>
  return (
    <>
      {render(original ? m.body : translation.body)}
      <button type="button" className="slk-translated" onClick={() => setOriginal(!original)} data-reply-translated={original ? 'original' : lang}>
        {original ? t('Show translation') : t('Translated · Show original')}
      </button>
    </>
  )
}
