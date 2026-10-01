// When the list should read everything again. The relay's join sends the
// cards afresh but not what was said in the channels meanwhile, so a socket
// that dropped, or a tab that slept, would never show those messages until
// somebody switched conversations. Dashboard asks these and says so with a
// 'honmaru:resync' window event; the list listens.

/// Back online: true only when a socket that had dropped connects again.
/// The first connect is not one — what was loaded then is already current.
export function reconnectWatch(): (connected: boolean) => boolean {
  let was: boolean | null = null
  return (connected) => {
    const back = connected && was === false
    was = connected
    return back
  }
}

/// Visible again after long enough hidden for the socket to have slept
/// through things: a closed lid, a locked phone, a tab left behind. A glance
/// at another tab is not. Timed from when it first went hidden.
export function wakeWatch(longMs = 60_000): (visible: boolean, now: number) => boolean {
  let hiddenAt: number | null = null
  return (visible, now) => {
    if (!visible) {
      if (hiddenAt === null) hiddenAt = now
      return false
    }
    const woke = hiddenAt !== null && now - hiddenAt > longMs
    hiddenAt = null
    return woke
  }
}
