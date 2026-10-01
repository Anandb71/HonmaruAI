// The desktop app (apps/desktop), as this page sees it.
//
// Its preload hands the page one object and nothing else:
// `window.honmaruDesktop = { isDesktop, platform, show() }`. Two things are
// different in there. There is no push service — Electron ships none — so
// Web Push cannot be turned on; the app stays running in the tray instead,
// its socket open, and the page's own notifications do the telling. And a
// click on one of those has to ask the app to bring its window forward:
// `window.focus()` cannot pull a window out of the tray.

export interface DesktopBridge {
  isDesktop: true
  platform: string
  show: () => void
}

/// The bridge, when this page is running inside the desktop app; else null.
export function desktop(): DesktopBridge | null {
  if (typeof window === 'undefined') return null
  const bridge = (window as unknown as { honmaruDesktop?: Partial<DesktopBridge> }).honmaruDesktop
  return bridge && bridge.isDesktop === true && typeof bridge.show === 'function' ? (bridge as DesktopBridge) : null
}
