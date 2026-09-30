// Where the reader is in a conversation, and what that decides: whether the
// log follows what arrives, whether it is read, and what counts as new below
// them. Discord's rules: at the bottom you are reading along and it keeps up;
// scrolled up you are reading history and nothing pulls you away from it.

/// A log's scroll, as the DOM gives it.
export interface ScrollBox { scrollHeight: number; scrollTop: number; clientHeight: number }

/// A message, as far as order and newness go.
export interface Said { id: string; createdAt: string; mine: boolean }

/// At the bottom, give or take a little: a picture that loaded under the last
/// line, or a scroll that stopped a few pixels short, is still at the bottom.
export function isAtBottom(el: ScrollBox, slack = 48): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < slack
}

/// Somebody is looking: the tab is showing and its window is in front. What
/// arrives is read only then — a tab in the background catching up after a
/// dropped connection would otherwise read a whole outage nobody saw.
export function isLooking(doc: { visibilityState: string; hasFocus(): boolean }): boolean {
  return doc.visibilityState === 'visible' && doc.hasFocus()
}

/// Whether the log goes to its newest line after a change. A conversation
/// just opened always does; a page of older messages loading above keeps
/// the reader where they were; otherwise it follows only a reader already at
/// the bottom — or one who just said something, who wants to see it said.
export function shouldFollow(o: { opened: boolean; atBottom: boolean; restoring: boolean; newestIsMine: boolean }): boolean {
  if (o.opened) return true
  if (o.restoring) return false
  return o.atBottom || o.newestIsMine
}

/// What counts as new to the reader: something somebody else said after a
/// point. The red "New" line and the count on "Jump to present" both ask
/// this, so they never disagree.
export function isNewSince(m: Pick<Said, 'mine' | 'createdAt'>, since: string): boolean {
  return !m.mine && m.createdAt > since
}

/// How many new messages are below a reader who left the bottom when the
/// newest they had was said at `since`. Counted by message, so a page of
/// older ones loading above, or one edited, adds nothing; one deleted is
/// taken back off.
export function countNewBelow(list: ReadonlyArray<Pick<Said, 'mine' | 'createdAt'>>, since: string | null): number {
  if (since === null) return 0
  let n = 0
  for (const m of list) if (isNewSince(m, since)) n += 1
  return n
}

const byTime = <T extends Said>(a: T, b: T) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0)

/// The newest page laid over what is loaded: a message it has replaces the
/// copy loaded, one it adds goes in by time, and the older pages loaded by
/// scrolling up stay. Within the time the page covers it is the whole truth,
/// so a message loaded there that it does not have was deleted meanwhile;
/// outside it — older pages, or something said after it was read — what is
/// loaded stands.
export function mergeById<T extends Said>(prev: readonly T[] | undefined, page: readonly T[]): T[] {
  if (!prev?.length) return [...page]
  if (!page.length) return [...prev]
  const from = page[0].createdAt
  const to = page[page.length - 1].createdAt
  const fresh = new Set(page.map((m) => m.id))
  const kept = prev.filter((m) => !fresh.has(m.id) && (m.createdAt < from || m.createdAt > to))
  return [...kept, ...page].sort(byTime)
}

/// What is loaded reaches further back than the newest page: pages loaded
/// by scrolling up, or the newest page as it was before more was said.
/// Whether there is more above is then theirs to say, not this page's.
export function reachesPast<T extends Said>(prev: readonly T[] | undefined, page: readonly T[]): boolean {
  return Boolean(prev?.length && page.length && prev[0].createdAt < page[0].createdAt)
}

/// A full newest page that does not reach back to what is loaded: more was
/// said while away than one page holds, and what is loaded cannot be joined
/// to it without a hole in the middle. Start again from the page.
/// Told by overlap, not by the newest loaded: a live message that arrived
/// after a reconnect, before the page was read, is inside the page's time
/// though everything before it is far older. The page joins only if its
/// first message is one already loaded.
export function leavesGap<T extends Said>(prev: readonly T[] | undefined, page: readonly T[], pageSize: number): boolean {
  if (!prev?.length || page.length < pageSize) return false
  const first = page[0]
  return prev.some((m) => m.createdAt < first.createdAt) && !prev.some((m) => m.id === first.id)
}
