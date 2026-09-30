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

/// Whether a message calls you: your @name, a user group you are in, or
/// everyone at once (@channel, @all, @everyone, @here). Never one you wrote —
/// what you said to the room is not news to you. Until the team has loaded
/// nobody is known to be you, and nothing is.
export function mentionsMe(message: { body?: string | null; mine?: boolean; authorRef?: string | null }, reader: Reader): boolean {
  const me = reader.people.find((p) => p.mine)?.ref
  const body = message.body || ''
  if (!me || !body || message.mine || message.authorRef === me) return false
  if (mentionsEveryone(body)) return true
  if (mentionedRefs(body, reader.people).includes(me)) return true
  // A group is called by its handle, as the Worker reads it: only the ones
  // you are in can call you.
  const yours = (reader.groups || []).filter((g) => g.refs.includes(me)).map((g) => ({ ref: `group:${g.handle}`, name: g.handle, handle: g.handle }))
  return yours.length > 0 && mentionedRefs(body, yours).length > 0
}

/// Whether one `@token`, as a message draws it, is your own name: marked
/// stronger than anyone else's, so it is found at a glance in a long message.
export function namesMe(token: string, people: Mentionable[]): boolean {
  const me = people.find((p) => p.mine)?.ref
  return me ? mentionedRefs(token, people).includes(me) : false
}
