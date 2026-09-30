import type { ChannelMessage, FileRef } from '../types/card'

// Sending as Discord does: what you write is in the conversation the moment
// you press Enter, under an id of its own ("tmp-…") and marked as on its way,
// until the server's copy takes its place. One that does not go stays where
// it was, marked, with why — to send again or throw away. The words are
// never lost to a bad connection.
//
// The server's copy comes two ways, in either order: the answer to the send,
// and the live event the socket brings everyone. Whichever comes first takes
// the place of ours; the other finds it already there.

const TEMP = 'tmp-'

/// Held only on this device, under a temporary id: on its way, or failed.
export const isTemp = (m: Pick<ChannelMessage, 'id'>) => m.id.startsWith(TEMP)

/// How a message held only here is drawn: on its way, or did not go.
export const tempState = (m: ChannelMessage): 'pending' | 'failed' | undefined =>
  m.failed ? 'failed' : m.pending ? 'pending' : undefined

/// Ours, as it will look once the server has it: written by you, now.
export function tempMessage(
  said: { channel: string; body: string; parentId?: string | null; files?: FileRef[] },
  you: { name: string | null; ref: string | null; avatar?: string | null },
  now = new Date(),
  random = () => Math.random().toString(36).slice(2, 10),
): ChannelMessage {
  return {
    id: `${TEMP}${now.getTime().toString(36)}-${random()}`,
    channel: said.channel,
    kind: 'message',
    body: said.body,
    authorName: you.name,
    authorRef: you.ref,
    authorAvatar: you.avatar ?? null,
    mine: true,
    cardId: null,
    createdAt: now.toISOString(),
    parentId: said.parentId ?? null,
    ...(said.files?.length ? { files: said.files } : {}),
    pending: true,
  }
}

/// The server's copy in place of ours, where ours was. When the socket
/// brought it first, ours just goes and the copy already shown stays — it
/// may be newer (a reaction, the card it became). When ours is gone (a
/// thread reopened, say), the server's copy still shows: it was sent.
export function reconcile(list: ChannelMessage[], tempId: string, real: ChannelMessage): ChannelMessage[] {
  if (list.some((x) => x.id === real.id)) return list.some((x) => x.id === tempId) ? list.filter((x) => x.id !== tempId) : list
  if (list.some((x) => x.id === tempId)) return list.map((x) => (x.id === tempId ? real : x))
  return [...list, real]
}

/// It did not go: kept where it was, with why.
export const markFailed = (list: ChannelMessage[], tempId: string, why: string): ChannelMessage[] =>
  list.map((x) => (x.id === tempId ? { ...x, pending: false, failed: why } : x))

/// Sent again: on its way once more.
export const markPending = (list: ChannelMessage[], tempId: string): ChannelMessage[] =>
  list.map((x) => (x.id === tempId ? { ...x, pending: true, failed: undefined } : x))

const words = (s: string) => s.replace(/\r\n/g, '\n').trim()
const fileIds = (m: ChannelMessage) => (m.files || []).map((f) => f.id).sort().join(',')

/// The server's copy of something of ours still held here: the same words,
/// files and thread, as first sent. The server keeps the words trimmed.
const sameAs = (held: ChannelMessage, real: ChannelMessage) => isTemp(held)
  && !real.editedAt && !real.deleted
  && (held.parentId || null) === (real.parentId || null)
  && words(held.body) === words(real.body)
  && fileIds(held) === fileIds(real)

/// Which of ours still held here a message the socket brought is the
/// server's copy of — none when it is already held, or not ours. One on its
/// way before one that failed with the same words: that one was sent again.
export const echoOf = (list: ChannelMessage[], msg: ChannelMessage): ChannelMessage | undefined =>
  msg.mine && !list.some((x) => x.id === msg.id)
    ? list.find((x) => x.pending && sameAs(x, msg)) || list.find((x) => sameAs(x, msg))
    : undefined

/// A message the socket brought. The copy already held changes in place;
/// our own words still held here take the server's copy where they are, so
/// the socket beating the answer to the send never shows them twice; any
/// other message is new, at the end.
export function arrive(list: ChannelMessage[], msg: ChannelMessage): ChannelMessage[] {
  if (list.some((x) => x.id === msg.id)) return list.map((x) => (x.id === msg.id ? msg : x))
  const held = echoOf(list, msg)
  return held ? list.map((x) => (x === held ? msg : x)) : [...list, msg]
}

/// A fresh copy from the server, with what is still held only here kept at
/// the end: a reload never drops a message on its way, or one that did not
/// go and is waiting to be sent again.
export function keepTemps(fresh: ChannelMessage[], held: ChannelMessage[] | undefined): ChannelMessage[] {
  const ours = (held || []).filter(isTemp)
  return ours.length ? [...fresh, ...ours] : fresh
}
