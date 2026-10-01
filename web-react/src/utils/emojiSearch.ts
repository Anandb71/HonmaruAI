import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { EmojiEntry } from './emojiData'
import { CUSTOM_EMOJI, useCustomEmoji, type CustomEmoji } from './customEmoji'

// Finding an emoji: by name in the picker and after a ':', the ones you
// used last, and whether a line is nothing but emoji. The list itself
// (emojiData.ts) is loaded the first time something asks for it.

/// The reactions most people reach for, first in the bar as in Slack —
/// until you have used some of your own.
export const QUICK_REACTIONS = ['✅', '👀', '🙌']

/// What the Worker takes as a reaction (cleanEmoji in worker/src/channels.js):
/// a workspace's `:name:`, or a pictograph, short.
export function canReact(raw: string): boolean {
  const text = String(raw || '').trim()
  if (!text || text.length > 16) return false
  if (CUSTOM_EMOJI.test(text)) return true
  return /^[\p{Extended_Pictographic}\p{Emoji_Component}\u200d\ufe0f]+$/u.test(text) && /\p{Extended_Pictographic}/u.test(text)
}

// ---- Search ----

/// "Thumbs Up", ":thumbs_up:" and "thumbs_up" are one query.
function normalize(q: string): string {
  return q.trim().toLowerCase().replace(/^:+|:+$/g, '').replace(/\s+/g, '_')
}

/// How well a name answers a query: 0 is the name itself, 1 starts with it,
/// 2 has it somewhere, 3 not at all.
function rank(name: string, query: string): number {
  return name === query ? 0 : name.startsWith(query) ? 1 : name.includes(query) ? 2 : 3
}

/// Whatever has names, ranked against a query: a name that is the query
/// first, then names that start with it, then names that hold it; within
/// each, in the list's own order. `self` is what the thing is when pasted
/// in whole, which finds it too.
function byNames<T>(list: T[], names: (x: T) => string[], self: (x: T) => string, q: string, limit: number): T[] {
  const query = normalize(q)
  if (!query) return []
  const tiers: T[][] = [[], [], []]
  for (const x of list) {
    const best = self(x) === q.trim() ? 0 : Math.min(...names(x).map((n) => rank(n, query)))
    if (best < 3) tiers[best].push(x)
  }
  return tiers.flat().slice(0, limit)
}

/// The emoji whose names answer a query, the common ones first within a
/// rank since the list is in that order.
export function searchEmoji(data: EmojiEntry[], q: string, limit = 48): EmojiEntry[] {
  return byNames(data, (x) => x.n, (x) => x.e, q, limit)
}

/// The same for this workspace's own emoji.
export function searchCustomEmoji(list: CustomEmoji[], q: string, limit = 48): CustomEmoji[] {
  return byNames(list, (c) => [c.name], (c) => `:${c.name}:`, q, limit)
}

/// The name to show beside an emoji a query found: the one that answered
/// it best, or its shortcode.
export function bestName(entry: EmojiEntry, q: string): string {
  const query = normalize(q)
  let best = entry.n[0]
  let score = query ? rank(best, query) : 0
  for (const n of entry.n) {
    const r = rank(n, query)
    if (r < score) { best = n; score = r }
  }
  return best
}

// ---- The list, loaded once ----

let data: EmojiEntry[] | null = null
let loading: Promise<EmojiEntry[] | null> | null = null
let failed = false
const dataListeners = new Set<() => void>()
const emitData = () => { for (const l of dataListeners) l() }

// The chunk's address, once a fetch of it has failed, and how often it has
// been asked for since. Chromium keeps a failed import() and gives every
// later one for the same address that failure again, back online or not;
// its error names the address, and with a query on the end it is a new one.
// A browser whose error names nothing (Safari) is asked for the plain one.
let lost: string | null = null
let tries = 0
/// The address in an import() error, when it is one of this site's own.
export function lostChunk(err: unknown, origin: string): string | null {
  const at = /https?:\/\/\S+/.exec(err instanceof Error ? err.message : '')
  return at && origin && at[0].startsWith(`${origin}/`) ? at[0] : null
}
function importList(): Promise<{ EMOJI: EmojiEntry[] }> {
  if (!lost) return import('./emojiData')
  tries += 1
  return import(/* @vite-ignore */ `${lost}${lost.includes('?') ? '&' : '?'}again=${tries}`) as Promise<{ EMOJI: EmojiEntry[] }>
}

/// Fetch the list (its own chunk). A failed fetch — offline, or a deploy
/// that replaced the chunk — is tried again the next time it is asked for.
export function loadEmojiData(): Promise<EmojiEntry[] | null> {
  if (data) return Promise.resolve(data)
  if (!loading) {
    loading = importList()
      .then((m) => { data = m.EMOJI; emitData(); return data })
      .catch((err: unknown) => {
        lost = lost || lostChunk(err, typeof location === 'undefined' ? '' : location.origin)
        loading = null; failed = true; emitData()
        return null
      })
    // Asked for again after it failed: on its way once more.
    if (failed) { failed = false; emitData() }
  }
  return loading
}

const subscribeData = (fn: () => void) => { dataListeners.add(fn); return () => { dataListeners.delete(fn) } }
const dataSnapshot = () => data

/// Where the list is: here, on its way (or not asked for yet), or not
/// fetched — so a picker can say which, rather than look as if the dozen
/// emoji it has without the list were all there are.
export type EmojiDataState = 'ready' | 'loading' | 'failed'
export function emojiDataState(): EmojiDataState {
  return data ? 'ready' : failed ? 'failed' : 'loading'
}
export function useEmojiDataState(): EmojiDataState {
  return useSyncExternalStore(subscribeData, emojiDataState, emojiDataState)
}

/// The list, or null until it is here. `wanted` false waits without asking,
/// so a box that has not seen a ':' yet costs nothing.
export function useEmojiData(wanted = true): EmojiEntry[] | null {
  const now = useSyncExternalStore(subscribeData, dataSnapshot, dataSnapshot)
  useEffect(() => { if (wanted && !now) void loadEmojiData() }, [wanted, now])
  return now
}

// ---- Recently used ----

const RECENT_KEY = 'emoji.recent'
export const RECENT_MAX = 24

/// `e` first, once, and the list no longer than `max`.
export function pushRecent(list: string[], e: string, max = RECENT_MAX): string[] {
  return [e, ...list.filter((x) => x !== e)].slice(0, max)
}

/// What this browser remembers, without anything that is not an emoji —
/// storage is anybody's to write to.
export function readRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as unknown
    if (!Array.isArray(raw)) return []
    return [...new Set(raw.filter((x): x is string => typeof x === 'string' && canReact(x)))].slice(0, RECENT_MAX)
  } catch { return [] }
}

let recent: string[] | null = null
const places = new Map<string, string[]>()
const recentListeners = new Set<() => void>()
const emitRecent = () => { for (const l of recentListeners) l() }

/// Put an emoji at the front of the recent ones: picked, or reacted with.
export function rememberEmoji(e: string): void {
  // Already first — the picker and the reaction it makes both tell us.
  if (!canReact(e) || recentSnapshot()[0] === e.trim()) return
  const next = pushRecent(recentSnapshot(), e.trim())
  recent = next
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* kept for this tab only */ }
  emitRecent()
}

export function resetEmojiAccount(): void {
  recent = []
  places.clear()
  try { localStorage.removeItem(RECENT_KEY) } catch { /* signing out clears the key too */ }
  emitRecent()
}

function recentSnapshot(): string[] {
  if (!recent) recent = readRecent()
  return recent
}

// Another tab's reaction reaches this one's bar too.
const onStorage = (e: StorageEvent) => { if (e.key === RECENT_KEY || e.key === null) { recent = null; emitRecent() } }
function subscribeRecent(fn: () => void) {
  if (!recentListeners.size && typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  recentListeners.add(fn)
  return () => {
    recentListeners.delete(fn)
    if (!recentListeners.size && typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
  }
}
export function useRecentEmoji(): string[] {
  return useSyncExternalStore(subscribeRecent, recentSnapshot, recentSnapshot)
}

/// The three reactions for the bar: the ones used last that can be drawn
/// here, topped up from the usual three.
export function quickReactions(list: string[], drawable: (e: string) => boolean, fallback = QUICK_REACTIONS, n = 3): string[] {
  return [...new Set([...list.filter(drawable), ...fallback])].slice(0, n)
}

/// A bar's emoji in the places they had: one that is still wanted stays
/// where it was, and a new one takes the place of the one that left. Moved
/// to the front instead, the reaction just clicked slid away from under the
/// pointer, and the click to take it back landed on its neighbour.
export function keepPlaces(shown: string[] | undefined, wanted: string[]): string[] {
  if (!shown || shown.length !== wanted.length) return wanted
  const stay = new Set(wanted)
  const had = new Set(shown)
  const fresh = wanted.filter((e) => !had.has(e))
  return shown.map((e) => (stay.has(e) ? e : fresh.shift() ?? e))
}

// Each bar as it is drawn now — the hover bar's three, a sheet's six — so
// every message's bar is in one order, and stays in it.
// `places` lives with the recent list, and signing out clears both.

/// The same, kept current: the bar's three, or as many as a phone's sheet
/// has room for, topped up from its own usual ones (a constant, so it is
/// one value from render to render). A workspace's own emoji counts only in
/// the workspace that has it. Which emoji follows what you used last; where
/// each sits does not change while it is one of them.
export function useQuickReactions(fallback = QUICK_REACTIONS, n = 3): string[] {
  const list = useRecentEmoji()
  const custom = useCustomEmoji()
  return useMemo(() => {
    const names = new Set(custom.map((c) => `:${c.name}:`))
    const bar = `${n} ${fallback.join(' ')}`
    const next = keepPlaces(places.get(bar), quickReactions(list, (e) => !CUSTOM_EMOJI.test(e) || names.has(e), fallback, n))
    places.set(bar, next)
    return next
  }, [list, custom, fallback, n])
}

// ---- A line of nothing but emoji ----

// One emoji, whole: a flag's pair of regional letters; a character drawn as
// a picture — by default, or made one by the selector after it — with its
// skin tone and whatever a joiner ties to it; or a keycap. A symbol that is
// text until a selector says otherwise (★ ♪ ♡ ™ ✔, as common in a Japanese
// line as letters) is not one, and stays the size of the text it is.
const PICTURE = /\p{Regional_Indicator}{1,2}|(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}\ufe0f)(?:\p{Emoji_Modifier}|\ufe0f|\u200d\p{Extended_Pictographic})*|[0-9#*]\ufe0f?\u20e3/gu
const GLUE = /[\s\u200d\ufe0f\u20e3\p{Emoji_Modifier}\u{E0020}-\u{E007F}]/gu

/// The most emoji a line is drawn large with. Past it, as in Slack, a line
/// is a wall of them and reads better small.
export const BIG_EMOJI_MAX = 24

/// True when a line has emoji and nothing else but spaces: the characters,
/// and `:name:` for the names `known` says this workspace draws. Such a line
/// is drawn large, as Slack does — up to BIG_EMOJI_MAX of them.
export function isEmojiOnly(line: string, known: (token: string) => boolean = () => false): boolean {
  let pictures = 0
  const rest = line.replace(/:[a-z0-9_+-]{1,30}:/g, (token) => {
    if (!known(token)) return token
    pictures += 1
    return ' '
  })
  const left = rest.replace(PICTURE, () => { pictures += 1; return '' }).replace(GLUE, '')
  return !left && pictures > 0 && pictures <= BIG_EMOJI_MAX
}

// ---- The picker ----

/// What the picker offered before it knew anything: shown under "Frequently
/// used" until you have reacted with something yourself.
export const FREQUENT_EMOJI = ['👍', '✅', '👀', '🙌', '🎉', '🙏', '❤️', '😂', '🔥', '💯', '👏', '🚀']

/// One button in the picker: what it sends, the name it goes by, and for a
/// workspace's own emoji its picture.
export interface PickerCell { emoji: string; name: string; url?: string }
/// A labelled grid of them. `label` is the English key, translated where it
/// is drawn; `workspace` is the one with the link to add more.
export interface PickerSection { label: string; cells: PickerCell[]; workspace?: boolean }

/// The picker's contents. Searching, one flat grid: this workspace's emoji
/// that match first, then the rest. Otherwise this workspace's emoji, the
/// ones used lately (or the usual ones, for someone new), and every group
/// of the list once it is here — in its own order, so its groups need not
/// be imported to be named.
export function pickerSections(query: string, custom: CustomEmoji[], recent: string[], data: EmojiEntry[] | null): PickerSection[] {
  const own = (c: CustomEmoji): PickerCell => ({ emoji: `:${c.name}:`, name: c.name, url: c.url })
  if (normalize(query)) {
    const found = [...searchCustomEmoji(custom, query).map(own), ...searchEmoji(data || [], query).map((x) => ({ emoji: x.e, name: bestName(x, query) }))]
    return [{ label: 'Search results', cells: found }]
  }
  const shortcode = new Map((data || []).map((x) => [x.e, x.n[0]]))
  const plain = (e: string): PickerCell => ({ emoji: e, name: shortcode.get(e) || '' })
  const byName = new Map(custom.map((c) => [`:${c.name}:`, c]))
  const lately = recent.flatMap((e) => {
    if (!CUSTOM_EMOJI.test(e)) return [plain(e)]
    const c = byName.get(e)
    return c ? [own(c)] : []
  })
  const groups: PickerSection[] = []
  for (const x of data || []) {
    const last = groups[groups.length - 1]
    const cell = { emoji: x.e, name: x.n[0] }
    if (last && last.label === x.g) last.cells.push(cell)
    else groups.push({ label: x.g, cells: [cell] })
  }
  return [
    { label: 'This workspace', cells: custom.map(own), workspace: true },
    lately.length ? { label: 'Recently used', cells: lately } : { label: 'Frequently used', cells: FREQUENT_EMOJI.map(plain) },
    ...groups,
  ]
}

// ---- The picker's grid, by keyboard ----

/// Where an arrow key goes in the picker: sections of `sizes` cells, `cols`
/// to a row, counted as one list. Down from a section's last row lands in
/// the next one's first, in the same column or the nearest; up from the very
/// first row is -1, the search box above. Past either end it stays.
export function gridStep(sizes: number[], at: number, key: string, cols = 8): number {
  const total = sizes.reduce((a, b) => a + b, 0)
  if (!total) return -1
  if (key === 'ArrowRight') return Math.min(at + 1, total - 1)
  if (key === 'ArrowLeft') return Math.max(at - 1, 0)
  if (key === 'Home') return 0
  if (key === 'End') return total - 1
  if (key !== 'ArrowDown' && key !== 'ArrowUp') return at
  const starts = sizes.map((_, s) => sizes.slice(0, s).reduce((a, b) => a + b, 0))
  let s = 0
  while (s < sizes.length - 1 && at >= starts[s] + sizes[s]) s += 1
  const i = at - starts[s]
  const col = i % cols
  if (key === 'ArrowDown') {
    if (i + cols < sizes[s]) return at + cols
    // The last row, short: a cell below the last one in it.
    if (Math.floor(i / cols) < Math.floor((sizes[s] - 1) / cols)) return starts[s] + sizes[s] - 1
    let n = s + 1
    while (n < sizes.length && !sizes[n]) n += 1
    return n < sizes.length ? starts[n] + Math.min(col, sizes[n] - 1) : at
  }
  if (i >= cols) return at - cols
  let p = s - 1
  while (p >= 0 && !sizes[p]) p -= 1
  if (p < 0) return -1
  const lastRow = Math.floor((sizes[p] - 1) / cols) * cols
  return starts[p] + Math.min(lastRow + col, sizes[p] - 1)
}
