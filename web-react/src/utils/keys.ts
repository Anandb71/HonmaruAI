// Keys, as the person's own keyboard writes them. A Mac says ⌘⇧A and means
// Command; Windows and Linux say Ctrl+Shift+A. The app's keys already answer
// to Ctrl off a Mac, so what it prints is only a question of whose keyboard
// is in front of it — and printing ⌘ to someone with no ⌘ key is a shortcut
// they cannot find.

/// Enough of `navigator` to tell a Mac from anything else.
export interface NavigatorLike {
  platform?: string
  userAgent?: string
  userAgentData?: { platform?: string } | null
}

/// A Mac, or an iPhone or iPad (a keyboard on one has ⌘ too). The newer
/// `userAgentData.platform` is read first ("macOS"), then the old
/// `platform` ("MacIntel", "iPad"), and the user agent last, for a browser
/// that leaves both out.
export function isMacPlatform(nav: NavigatorLike | null | undefined = typeof navigator !== 'undefined' ? navigator : undefined): boolean {
  if (!nav) return false
  const said = nav.userAgentData?.platform || nav.platform || nav.userAgent || ''
  return /Mac|iPhone|iPad|iPod/i.test(said)
}

/// What each part of a combo is called on a Mac: glyphs, written together.
const MAC: Record<string, string> = {
  Mod: '⌘', Ctrl: '⌃', Alt: '⌥', Shift: '⇧',
  Up: '↑', Down: '↓', Left: '←', Right: '→',
}
/// …and everywhere else: words, joined with "+". Arrows are arrows on any
/// keyboard.
const OTHER: Record<string, string> = {
  Mod: 'Ctrl', Ctrl: 'Ctrl', Alt: 'Alt', Shift: 'Shift',
  Up: '↑', Down: '↓', Left: '←', Right: '→',
}

/// A combo written once, the way code names it — "Mod+Shift+A", "Alt+Up",
/// "Shift+Esc" — as this keyboard prints it: "⌘⇧A" on a Mac, "Ctrl+Shift+A"
/// elsewhere. Alternatives are separated by " / " ("Alt+Up / Alt+Down"),
/// and anything it has no name for ("N", "Enter", "1–9") is left as it is.
export function formatCombo(combo: string, mac: boolean): string {
  const names = mac ? MAC : OTHER
  return combo
    .split(' / ')
    .map((one) => one.split('+').map((part) => (Object.hasOwn(names, part) ? names[part] : part)).join(mac ? '' : '+'))
    .join(' / ')
}
