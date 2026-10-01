// The unread count, read off the page's title: the web app writes
// "(3) Honmaru AI" (web-react/src/utils/notifications.ts), so the desktop
// app needs no bridge to know it.
//
// Pure: no Electron here (test/badge.test.js).

export function countFromTitle(title) {
  const match = /^\((\d{1,4})\)\s/.exec(String(title || ''))
  return match ? Number(match[1]) : 0
}

/// What the tray's tooltip says.
export function trayTooltip(count, name = 'Honmaru AI') {
  if (count <= 0) return name
  return count === 1 ? `${name}: 1 waiting` : `${name}: ${count} waiting`
}

/// A new count is worth drawing the eye to only when it went up.
export function shouldAttract(previous, next, focused) {
  return !focused && next > previous
}
