// A message that calls you, marked in the conversation the way Discord tints
// the row of one that names you.
//
// Read by the rules the Worker uses to decide whom a message reaches
// (threads.js resolveMentions), on the same member list "@" offers: what is
// lit up is what called you, not every word that happens to look like you.

import { mentionedRefs, mentionsEveryone, type Mentionable } from '@honmaru/core/mentions'

/// A user group as the workspace lists it (GET /channels/usergroups).
export interface GroupRefs {
  handle: string
  /// Who is in it, by member ref.
  refs: string[]
}

/// Who is reading: the team as "@" knows it, your own entry marked `mine`,
/// and the user groups with who is in each.
export interface Reader {
  people: Mentionable[]
  groups?: readonly GroupRefs[]
}

/// What a message is asked about: its words and who wrote them.
type Said = { body?: string | null; mine?: boolean; authorRef?: string | null }

/// Your ref, and the user groups that can call you as names to read an @
/// against. A group is called by its handle, as the Worker reads it: only
/// the ones you are in can call you.
function whoIsMe(reader: Reader): { me?: string; groups: Mentionable[] } {
  const me = reader.people.find((p) => p.mine)?.ref
  const groups = me ? (reader.groups || []).filter((g) => g.refs.includes(me)).map((g) => ({ ref: `group:${g.handle}`, name: g.handle, handle: g.handle })) : []
  return { me, groups }
}

/// Whether words call `me`, whoever wrote them.
function calls(body: string, me: string, people: Mentionable[], groups: Mentionable[]): boolean {
  if (mentionsEveryone(body)) return true
  if (mentionedRefs(body, people).includes(me)) return true
  return groups.length > 0 && mentionedRefs(body, groups).length > 0
}

/// Whether a message calls you: your @name, a user group you are in, or
/// everyone at once (@channel, @all, @everyone, @here). Never one you wrote —
/// what you said to the room is not news to you. Until the team has loaded
/// nobody is known to be you, and nothing is.
export function mentionsMe(message: Said, reader: Reader): boolean {
  const { me, groups } = whoIsMe(reader)
  const body = message.body || ''
  if (!me || !body || message.mine || message.authorRef === me) return false
  return calls(body, me, reader.people, groups)
}

/// Whether one `@token`, as a message draws it, is your own name: marked
/// stronger than anyone else's, so it is found at a glance in a long message.
export function namesMe(token: string, people: Mentionable[]): boolean {
  const me = people.find((p) => p.mine)?.ref
  return me ? mentionedRefs(token, people).includes(me) : false
}

/// How many answers a reader keeps before it starts over: more than a long
/// scrollback holds, few enough that a day in one tab does not keep every
/// message it has shown.
const KEPT = 2000

/// mentionsMe and namesMe for one team, with the answers kept. The
/// conversation asks both of every message each time it is drawn — every
/// keystroke in the composer — and each reads every @ in the words against
/// the whole team; the answer only changes with the words, or with the team
/// and its groups. Make a new one when those change (a useMemo over them)
/// and nothing kept outlives what it was read against. What is kept is
/// whether the words call you: who wrote them is looked at every time, so
/// your own message never takes another's answer.
export function meReader(reader: Reader): { mentionsMe: (message: Said) => boolean; namesMe: (token: string) => boolean } {
  const { me, groups } = whoIsMe(reader)
  const bodies = new Map<string, boolean>()
  const tokens = new Map<string, boolean>()
  const recall = (kept: Map<string, boolean>, key: string, read: () => boolean) => {
    let answer = kept.get(key)
    if (answer === undefined) {
      if (kept.size >= KEPT) kept.clear()
      answer = read()
      kept.set(key, answer)
    }
    return answer
  }
  return {
    mentionsMe: (message) => {
      const body = message.body || ''
      if (!me || !body || message.mine || message.authorRef === me) return false
      return recall(bodies, body, () => calls(body, me, reader.people, groups))
    },
    namesMe: (token) => (me ? recall(tokens, token, () => mentionedRefs(token, reader.people).includes(me)) : false),
  }
}
