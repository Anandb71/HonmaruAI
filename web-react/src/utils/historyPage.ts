// Whether a conversation goes further back than what is loaded.
//
// A page of history used to come back as its messages alone, and a page
// shorter than a full one was taken for the start of the conversation —
// until one unsent message on it made it short, and "This is the start of
// #name" showed with everything above it out of reach. The Worker says it
// outright now, as `more`; a page from one that does not (an older deploy)
// is still counted.

/// Whether there are older messages than this page: the Worker's `more`
/// when it says, or else whether the page came back full. The next page is
/// asked for from the oldest message loaded, so a page with nothing on it
/// leads nowhere: asking again would only bring the same empty page.
export function hasOlder(data: { messages?: unknown[] | null; more?: unknown } | null | undefined, page: number): boolean {
  const count = (data?.messages || []).length
  if (typeof data?.more === 'boolean') return data.more && count > 0
  return count >= page
}
