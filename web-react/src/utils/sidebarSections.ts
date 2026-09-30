// The sidebar's sections, folded the way a chat client folds a category:
// the header closes, and what still calls for you stays in view under it.

/// What a folded section needs to know about one of its rows.
export interface SectionRow {
  key: string
  /// The conversation (`b:…`, `dm:…`, `g:…`, `ag:…`); an app has none.
  view?: string
  /// Decision cards waiting on you.
  unread: number
  /// Said since you last looked.
  fresh?: boolean
}

/// How loud each conversation may be, as the prefs route keeps it; a
/// conversation not named is 'all'.
export type Levels = Record<string, 'mentions' | 'mute'>

export interface FoldContext {
  /// Unread mentions of you, by conversation.
  mentions: Record<string, number>
  /// The row open now, which a fold never hides.
  currentKey?: string | null
  prefs: Levels
}

/// The rows a folded section still shows, in their order: the one open now,
/// and each with a card waiting, something new said, or a mention. A muted
/// conversation shows only when it names you — muting it was asking not to
/// hear about the rest.
export function foldedRows<T extends SectionRow>(threads: T[], { mentions, currentKey, prefs }: FoldContext): T[] {
  return threads.filter((th) => {
    if (currentKey && th.key === currentKey) return true
    const named = Boolean(th.view && (mentions[th.view] || 0) > 0)
    if (th.view && prefs[th.view] === 'mute') return named
    return th.unread > 0 || Boolean(th.fresh) || named
  })
}

/// What a folded section's header says about its rows: the cards waiting
/// (red), the mentions (blue @N), and whether anything new was said.
export function sectionBadge(threads: SectionRow[], mentions: Record<string, number>): { cards: number; mentions: number; fresh: boolean } {
  let cards = 0
  let named = 0
  let fresh = false
  for (const th of threads) {
    cards += th.unread
    if (th.view) named += mentions[th.view] || 0
    if (th.fresh) fresh = true
  }
  return { cards, mentions: named, fresh }
}
