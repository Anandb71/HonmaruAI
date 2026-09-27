// @mentions: naming a teammate in what you write.
//
// The composer and the thread both offer the team's names when you type "@",
// and both send the refs of whoever you named — the Worker resolves those
// against the real member list, so a name that is nobody's names nobody.

import { useEffect, useState } from 'react'

export interface Mentionable {
  ref: string
  /// This is you.
  mine?: boolean
  avatarUrl?: string | null
  name: string
  /// Other names they answer to, when the profile carries them.
  aliases?: string[]
  /// Their username: what @ writes, when they have one.
  handle?: string | null
  /// A line under the name: a group's size, an agent's job.
  title?: string
  /// One of the team's agents: drawn with its emoji and an "Agent" tag.
  agent?: boolean
  emoji?: string | null
  /// A hash of their login, matching the relay's online/offline events.
  presence?: string | null
  /// Here right now: a green dot beside them in "@".
  online?: boolean
  /// Not in the conversation being written in: "@" says so.
  outside?: boolean
  /// "@here" (everyone in the conversation) or "@agents" (every agent in it).
  special?: 'here' | 'channel' | 'agents'
  /// What a special entry does, said on its right.
  detail?: string
  /// For "@agents": the handles it writes out.
  handles?: string[]
}

/// An agent as the workspace lists it (GET /channels, /channels/agents).
export interface AgentFace {
  id: string
  handle: string
  name: string
  emoji?: string | null
  description?: string
  scope?: 'team' | 'personal'
  /// The channels it was added to, as you see them.
  channels?: string[]
  /// Someone else's, callable only in those channels.
  placed?: boolean
}

/// The agents "@" reaches in one conversation: your own everywhere, one
/// somebody added to a channel only there.
export function agentsIn(agents: AgentFace[], view: string | null | undefined): AgentFace[] {
  return agents.filter((a) => !a.placed || Boolean(view && a.channels?.includes(view)))
}

/// The team's agents as names "@" offers: `@hayao` is written by its handle,
/// found by its name too. A handle a person or group already offers is left
/// to them — the server would not have let it be made, but a list loaded a
/// moment apart can disagree.
export function agentMentionables(agents: AgentFace[], taken: Mentionable[] = []): Mentionable[] {
  const fold = (x: string) => x.normalize('NFKC').toLowerCase()
  const used = new Set(taken.map((m) => fold(m.handle || '')).filter(Boolean))
  const seen = new Set<string>()
  const out: Mentionable[] = []
  for (const a of agents) {
    const h = fold(a.handle || '')
    if (!h || used.has(h) || seen.has(h)) continue
    seen.add(h)
    out.push({ ref: `agent:${a.id}`, name: a.name || a.handle, handle: a.handle, title: a.description || undefined, agent: true, emoji: a.emoji || null })
  }
  return out
}

/// The `@` token the caret is inside, if any: where it starts and what has
/// been typed so far. `null` when the caret is not in one.
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const at = Math.max(before.lastIndexOf('@'), before.lastIndexOf('＠'))
  if (at < 0) return null
  if (at > 0 && !MENTION_BEFORE.test(before[at - 1])) return null
  const query = before.slice(at + 1)
  if (/[\s@＠,，。、!?！？:;)）」]/.test(query)) return null
  if (query.length > 40) return null
  return { start: at, query }
}

const fold = (s: string) => s.normalize('NFKC').toLowerCase()

/// What may come right before an "@" for it to start a mention: a space, a
/// bracket or quote, or any letter outside ASCII ("確認@channel") — never an
/// ASCII letter, digit or URL character ("a@b.jp", "youtube.com/@channel").
/// The same rule as the Worker's (threads.js).
const MENTION_BEFORE = /[^\x21-\x7E]|[(\[{"']/
const MENTION_RE = /(^|[^\x21-\x7E]|[(\[{"'])([@＠][^\s@＠,，。、!?！？:;)）」]+)/g

/// "@channel" and "@all" (everyone in the conversation) or "@here" (those
/// at the app now): a Japanese word may follow, an ASCII letter may not.
export function broadcastOf(token: string): 'channel' | 'here' | null {
  const m = /^(channel|all|here)(?![a-z0-9_.-])/.exec(fold(token.replace(/^[@＠]/, '')))
  return m ? (m[1] === 'all' ? 'channel' : m[1] as 'channel' | 'here') : null
}

/// Whether a message calls everyone who reads it — so whoever reads it is
/// mentioned. ("@here" too: a message that arrives live finds you at the app.)
export function mentionsEveryone(text: string): boolean {
  const re = new RegExp(MENTION_RE.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) if (broadcastOf(m[2])) return true
  return false
}

/// Who matches what has been typed so far, best first: a name that starts
/// with it, then one that contains it. Empty query: everyone.
export function matchMembers(members: Mentionable[], query: string, limit = 8): Mentionable[] {
  const q = fold(query.trim())
  const score = (m: Mentionable) => {
    const names = [m.handle || '', m.name, ...(m.aliases || [])].filter(Boolean).map(fold)
    if (!q) return 1
    if (names.some((n) => n.startsWith(q))) return 3
    if (names.some((n) => n.split(/\s+/).some((w) => w.startsWith(q)))) return 2
    if (names.some((n) => n.includes(q))) return 1
    return 0
  }
  // @here and @agents first, then the people in the conversation, then its
  // agents, then everyone else — the way Slack lists them.
  const rank = (m: Mentionable) => (m.special ? 0 : m.outside ? 3 : m.agent ? 2 : 1)
  return members
    .map((m) => ({ m, s: score(m) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || rank(a.m) - rank(b.m) || a.m.name.localeCompare(b.m.name))
    .slice(0, limit)
    .map((x) => x.m)
}

/// The text with the current `@query` replaced by `@Name ` and where the
/// caret should land afterwards.
export function insertMention(text: string, caret: number, member: Mentionable): { text: string; caret: number } {
  const q = mentionQuery(text, caret)
  if (!q) return { text, caret }
  // The username when there is one — it is exact and has no spaces; else
  // the first name, which the Worker also matches.
  const label = member.special === 'agents' && member.handles?.length
    ? `${member.handles.map((h) => `@${h}`).join(' ')} `
    : `@${member.handle || member.name.split(/\s+/)[0] || member.name} `
  const next = text.slice(0, q.start) + label + text.slice(caret)
  return { text: next, caret: q.start + label.length }
}

/// The members a text names, by first name, whole name or alias.
export function mentionedRefs(text: string, members: Mentionable[]): string[] {
  const refs = new Set<string>()
  const re = new RegExp(MENTION_RE.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const want = fold(m[2].replace(/^[@＠]/, ''))
    const hit = members.find((mem) => {
      const names = [mem.handle || '', mem.name, mem.name.split(/\s+/)[0], ...(mem.aliases || [])].filter(Boolean).map(fold)
      return names.includes(want)
    })
    if (hit) refs.add(hit.ref)
  }
  return [...refs]
}

/// A line of text split so every `@Name` can be drawn as a mention.
export function splitMentions(text: string): Array<{ text: string; mention: boolean }> {
  const out: Array<{ text: string; mention: boolean }> = []
  const re = new RegExp(MENTION_RE.source, 'g')
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const start = m.index + m[1].length
    if (start > last) out.push({ text: text.slice(last, start), mention: false })
    out.push({ text: m[2], mention: true })
    last = start + m[2].length
  }
  if (last < text.length) out.push({ text: text.slice(last), mention: false })
  return out
}

// The team, once per workspace, shared by every box that offers names —
// read again when somebody joins or leaves (the relay says so), and when the
// page comes back into view after a while, in case that word was missed.
const cache = new Map<string, Promise<Mentionable[]>>()
const loadedAt = new Map<string, number>()
const STALE_MS = 60_000

export function loadMembers(httpBase: string, orgId: string, sessionToken: string): Promise<Mentionable[]> {
  const key = `${httpBase}|${orgId}`
  if (!cache.has(key)) {
    loadedAt.set(key, Date.now())
    cache.set(key, fetch(`${httpBase}/members?orgId=${encodeURIComponent(orgId)}`, { headers: { 'x-session-token': sessionToken } })
      .then((r) => (r.ok ? r.json() : { members: [] }))
      .then((data) => (data.members || []).map((m: { ref: string; name: string; aliases?: string[]; handle?: string | null; mine?: boolean; avatarUrl?: string | null; presence?: string | null }) => ({ ref: m.ref, name: m.name, aliases: m.aliases || [], handle: m.handle || null, mine: Boolean(m.mine), avatarUrl: m.avatarUrl || null, presence: m.presence || null })))
      .catch(() => { cache.delete(key); return [] }))
  }
  return cache.get(key)!
}

export function forgetMembers(orgId?: string): void {
  if (!orgId) { cache.clear(); return }
  for (const key of [...cache.keys()]) if (key.endsWith(`|${orgId}`)) cache.delete(key)
}

export function useMembers(httpBase: string, orgId: string, sessionToken: string): Mentionable[] {
  const [members, setMembers] = useState<Mentionable[]>([])
  useEffect(() => {
    let ignore = false
    const read = () => loadMembers(httpBase, orgId, sessionToken).then((list) => { if (!ignore) setMembers(list) })
    // Every box that offers names hears the same word: the first one to
    // hear it reads the team again, the rest share that read.
    const again = () => {
      if (Date.now() - (loadedAt.get(`${httpBase}|${orgId}`) || 0) > 2000) forgetMembers(orgId)
      void read()
    }
    const back = () => {
      if (document.visibilityState !== 'visible') return
      const at = loadedAt.get(`${httpBase}|${orgId}`) || 0
      if (Date.now() - at > STALE_MS) again()
    }
    void read()
    window.addEventListener('honmaru:members-changed', again)
    window.addEventListener('focus', back)
    document.addEventListener('visibilitychange', back)
    return () => {
      ignore = true
      window.removeEventListener('honmaru:members-changed', again)
      window.removeEventListener('focus', back)
      document.removeEventListener('visibilitychange', back)
    }
  }, [httpBase, orgId, sessionToken])
  return members
}

/// What an `@token` names, if anyone: the AI, a person, a user group or an
/// agent — or null when it matches nobody, so it is left as plain text
/// rather than dressed up as a mention that reaches no one. "@hayaoに" is
/// "@hayao": the particle goes with the name.
export type MentionKind = 'ai' | 'person' | 'group' | 'agent'
export function mentionKind(token: string, list: Mentionable[]): MentionKind | null {
  const raw = token.replace(/^[@＠]/, '')
  // Everyone in the conversation: drawn like a group.
  if (broadcastOf(raw)) return 'group'
  for (const want of new Set([fold(raw), fold(raw.replace(/[にへ]$/, ''))])) {
    if (!want) continue
    if (want === 'ai') return 'ai'
    const hit = list.find((mem) => [mem.handle || '', mem.name, mem.name.split(/\s+/)[0], ...(mem.aliases || [])]
      .filter(Boolean).map(fold).includes(want))
    if (hit) {
      if (hit.ref === '__ai') return 'ai'
      if (hit.ref.startsWith('group:')) return 'group'
      if (hit.ref.startsWith('agent:')) return 'agent'
      return 'person'
    }
  }
  return null
}

/// A text cut into plain runs and `@mentions`, each mention with what it
/// names (null: nobody). The pieces join back into the text exactly.
export function mentionSegments(text: string, list: Mentionable[]): Array<{ text: string; kind: MentionKind | null; mention: boolean }> {
  const out: Array<{ text: string; kind: MentionKind | null; mention: boolean }> = []
  const re = new RegExp(MENTION_RE.source, 'g')
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const start = m.index + m[1].length
    if (start > last) out.push({ text: text.slice(last, start), kind: null, mention: false })
    out.push({ text: m[2], kind: mentionKind(m[2], list), mention: true })
    last = start + m[2].length
  }
  if (last < text.length) out.push({ text: text.slice(last), kind: null, mention: false })
  return out
}
