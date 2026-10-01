// The sidebar as the eye reads it, for the keys that move through it. ⌥↑ and
// ⌥↓ used to walk the team's own order (channels, people, agents, apps)
// while the screen showed Starred, your sections and your drag order — and
// they stopped on conversations hidden in a folded group. Walking what is
// drawn, in the order it is drawn, is the only order a person can follow.

/// One group of the sidebar: the id its fold is kept under, and what it
/// holds, top to bottom.
export interface SidebarGroup<T> {
  id: string
  items: readonly T[]
}

/// Every conversation a reader can see, top to bottom: the groups in the
/// order drawn, less the folded ones. One that shows up twice (a view kept
/// in two of your sections) counts once, where it first appears, so a walk
/// through the list cannot loop between the two.
export function visibleOrder<T extends { key: string }>(groups: readonly SidebarGroup<T>[], folded: Readonly<Record<string, boolean>>): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const g of groups) {
    if (folded[g.id]) continue
    for (const item of g.items) {
      if (seen.has(item.key)) continue
      seen.add(item.key)
      out.push(item)
    }
  }
  return out
}

/// The folded group to open so that the conversation `key` shows: the first
/// one that holds it. Null when it already shows in a group that is open, or
/// no group holds it — there is nothing to unfold.
export function foldedHome<T extends { key: string }>(groups: readonly SidebarGroup<T>[], folded: Readonly<Record<string, boolean>>, key: string): string | null {
  let first: string | null = null
  for (const g of groups) {
    if (!g.items.some((item) => item.key === key)) continue
    if (!folded[g.id]) return null
    if (first === null) first = g.id
  }
  return first
}

/// The next (dir 1) or previous (dir -1) one after `currentKey` that `pred`
/// takes, going round past either end. The current one is looked at last,
/// so it comes back only when nothing else matches; null when nothing in the
/// list does. With no current one, or one not in the list (it sits in a
/// folded group, or Activity is open), down starts at the top and up at the
/// bottom.
export function step<T extends { key: string }>(list: readonly T[], currentKey: string | null | undefined, dir: 1 | -1, pred: (item: T) => boolean = () => true): T | null {
  const n = list.length
  if (!n) return null
  const at = currentKey == null ? -1 : list.findIndex((x) => x.key === currentKey)
  const start = at >= 0 ? at : dir === 1 ? -1 : n
  for (let i = 1; i <= n; i += 1) {
    const item = list[(((start + dir * i) % n) + n) % n]
    if (pred(item)) return item
  }
  return null
}
