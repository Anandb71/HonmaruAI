// When the page's renderer dies, whether to bring it back. A crash now and
// then is reloaded without a word; one that keeps happening (a page that
// crashes on load) would reload forever, burning the CPU behind a flickering
// window, so after a few in quick succession the app stops and says so.
//
// Pure: no Electron here (test/crashes.test.js).

/// How many crashes in how long before the app stops reloading.
export const CRASH_LIMIT = 3
export const CRASH_WINDOW_MS = 60 * 1000

/// Given the times of earlier crashes and this one, whether to reload, and
/// the crash times still worth remembering (those inside the window).
export function crashVerdict(history, now, { limit = CRASH_LIMIT, windowMs = CRASH_WINDOW_MS } = {}) {
  const recent = [...(history || []).filter((at) => now - at < windowMs), now]
  return { reload: recent.length < limit, history: recent }
}
