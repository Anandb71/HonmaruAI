// @mentions: finding, inserting and reading `@Name` in what people write.
// Shared by every client (web, mobile, desktop); the web's React hook that
// loads the team lives in web-react/src/utils/mentions.ts.
//
// The composer and the thread both offer the team's names when you type "@",
// and both send the refs of whoever you named — the Worker resolves those
// against the real member list, so a name that is nobody's names nobody.

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
  /// A picture in place of the emoji, when it has one.
  avatarUrl?: string | null
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
    out.push({ ref: `agent:${a.id}`, name: a.name || a.handle, handle: a.handle, title: a.description || undefined, agent: true, emoji: a.emoji || null, avatarUrl: a.avatarUrl || null })
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

/// "@channel", "@all" and "@everyone" (everyone in the conversation) or
/// "@here" (those at the app now): a Japanese word may follow, an ASCII
/// letter may not.
export function broadcastOf(token: string): 'channel' | 'here' | null {
  const m = /^(channel|all|everyone|here)(?![a-z0-9_.-])/.exec(fold(token.replace(/^[@＠]/, '')))
  return m ? (m[1] === 'here' ? 'here' : 'channel') : null
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
    // "@all" is "@channel" by another name: offered once it is being typed.
    if (!q) return m.ref === '__all' ? 0 : 1
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
export function insertMention(text: string, caret: number, member: Mentionable, others: Mentionable[] = []): { text: string; caret: number } {
  const q = mentionQuery(text, caret)
  if (!q) return { text, caret }
  const label = member.special === 'agents' && member.handles?.length
    ? `${member.handles.map((h) => `@${h}`).join(' ')} `
    : `@${mentionLabel(member, others)} `
  const next = text.slice(0, q.start) + label + text.slice(caret)
  return { text: next, caret: q.start + label.length }
}

/// What "@" writes for somebody: their username when they have one — it is
/// exact and has no spaces; else their first name, unless someone else in
/// the list answers to it too ("@Kenji" would reach whichever Kenji came
/// first), and then the whole name run together ("@KenjiSato"), which the
/// Worker and the iPhone both match.
export function mentionLabel(member: Mentionable, others: Mentionable[] = []): string {
  if (member.handle) return member.handle
  const first = member.name.split(/\s+/)[0] || member.name
  const want = fold(first)
  const shared = others.some((o) => o.ref !== member.ref && !o.special && namesOf(o).includes(want))
  return shared ? member.name.replace(/\s+/g, '') : first
}

/// Every way an @ may write somebody, folded: their username, their name,
/// its first word, and the whole of it with the spaces taken out — the
/// iPhone writes "Mika Sato" as "@MikaSato" (the Worker agrees).
function namesOf(mem: Mentionable): string[] {
  return [mem.handle || '', mem.name, mem.name.split(/\s+/)[0], mem.name.replace(/\s+/g, ''), ...(mem.aliases || [])].filter(Boolean).map(fold)
}

/// The members a text names, by first name, whole name or alias.
export function mentionedRefs(text: string, members: Mentionable[]): string[] {
  const refs = new Set<string>()
  const re = new RegExp(MENTION_RE.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const want = fold(m[2].replace(/^[@＠]/, ''))
    const hit = members.find((mem) => {
      return namesOf(mem).includes(want)
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

/// What an `@token` names, if anyone: the AI, a person, a user group or an
/// agent — or null when it matches nobody, so it is left as plain text
/// rather than dressed up as a mention that reaches no one. "@hayaoに" is
/// "@hayao": the particle goes with the name.
export type MentionKind = 'ai' | 'person' | 'group' | 'agent'
export function mentionKind(token: string, list: Mentionable[]): MentionKind | null {
  const raw = token.replace(/^[@＠]/, '')
  // Everyone in the conversation: drawn like a group.
  if (broadcastOf(raw)) return 'group'
  for (const want of wantsOf(raw)) {
    if (want === 'ai') return 'ai'
    const hit = list.find((mem) => namesOf(mem).includes(want))
    if (hit) {
      if (hit.ref === '__ai') return 'ai'
      if (hit.ref.startsWith('group:')) return 'group'
      if (hit.ref.startsWith('agent:')) return 'agent'
      return 'person'
    }
  }
  return null
}

/// Whom an `@token` names, as the entry in the list — for a client that
/// opens their profile from it — found the way mentionKind finds them.
/// Null for nobody, and for "@channel", which is not one person.
export function mentionTarget(token: string, list: Mentionable[]): Mentionable | null {
  const raw = token.replace(/^[@＠]/, '')
  if (broadcastOf(raw)) return null
  for (const want of wantsOf(raw)) {
    const hit = list.find((mem) => namesOf(mem).includes(want))
    if (hit) return hit
  }
  return null
}

/// What an `@token` may be read as, folded: as written, then without the
/// particle a Japanese sentence puts after a name.
function wantsOf(raw: string): string[] {
  return [...new Set([fold(raw), fold(raw.replace(/[にへ]$/, ''))])].filter(Boolean)
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
