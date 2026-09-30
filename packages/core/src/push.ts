// What a tapped notification points at. The Worker sends the same keys to
// both platforms, but they arrive in different shapes: on an iPhone they sit
// beside `aps`; on Android FCM delivers every value as a string, and
// expo-notifications hands the app the JSON under `body` as the data. This
// takes whichever it is given and answers the one question a view has:
// which workspace, which conversation.

export interface PushTarget {
  orgId: string
  channel: string
  messageId: string | null
}

const isKey = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200

/// The conversation a notification is about, or null for anything else (a
/// card, a silent read-clearing push, or something malformed). Several
/// sources may be passed — the parsed data first, the raw remote message's
/// data after — and the first that names a conversation wins.
export function pushTarget(...sources: unknown[]): PushTarget | null {
  for (const source of sources) {
    const found = fromOne(source, 0)
    if (found) return found
  }
  return null
}

function fromOne(source: unknown, depth: number): PushTarget | null {
  if (!source || typeof source !== 'object' || depth > 1) return null
  const data = source as Record<string, unknown>
  if (data.kind !== undefined && data.kind !== 'message') return null
  if (isKey(data.orgId) && isKey(data.channel)) {
    return { orgId: data.orgId, channel: data.channel, messageId: isKey(data.messageId) ? data.messageId : null }
  }
  // FCM's raw data: the same keys again, as one JSON string.
  if (typeof data.body === 'string') {
    try { return fromOne(JSON.parse(data.body), depth + 1) } catch { return null }
  }
  return null
}
