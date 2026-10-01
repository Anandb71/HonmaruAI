// Where the desktop window may go, and what a honmaru:// link opens.
//
// Pure: no Electron here, so every rule is tested (test/links.test.js).

export const PROTOCOL = 'honmaru'

/// The paths a link may open (packages/core/src/links.ts LINK_PATH_PREFIXES):
/// the web app turns them into its own routes on load.
const LINK_HEADS = new Set(['c', 'join'])

/// A honmaru:// link as the web app's own address: `honmaru://c/b%3Ageneral?org=x`
/// → `<app>/c/b%3Ageneral?org=x`. The web app checks the channel and the
/// workspace itself (parseAppLink), so this only moves the path across. Any
/// other honmaru:// link opens the app at its start; anything else is null.
export function deepLinkToUrl(link, appUrl) {
  let url
  try { url = new URL(String(link || '')) } catch { return null }
  if (url.protocol !== `${PROTOCOL}:`) return null
  const target = new URL(appUrl)
  // A custom scheme puts the first segment in the host: honmaru://c/x.
  const head = url.host
  const rest = url.pathname.replace(/^\/+/, '')
  if (LINK_HEADS.has(head) && rest && !rest.includes('..')) {
    target.pathname = `/${head}/${rest}`
    const org = url.searchParams.get('org')
    if (head === 'c' && org) target.search = `?org=${encodeURIComponent(org)}`
  }
  return target.toString()
}

/// The first honmaru:// link among a process's arguments (Windows and Linux
/// hand a link to the app as an argument), or null.
export function linkFromArgv(argv) {
  return (argv || []).find((arg) => typeof arg === 'string' && arg.startsWith(`${PROTOCOL}://`)) || null
}

const originOf = (value) => {
  try { return new URL(value).origin } catch { return null }
}

/// Links that are safe to hand to the operating system: the web, and mail.
export function isSafeExternal(value) {
  try {
    const { protocol } = new URL(value)
    return protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:'
  } catch {
    return false
  }
}

/// How long a sign-in may take once it has left for an identity provider.
export const SIGN_IN_MS = 10 * 60 * 1000

/// Whether the app window may go to `target`.
///
/// - The app and the API (and GitHub, for sign-in) are always allowed.
/// - A sign-in leaves them: the API redirects to GitHub or to a company's
///   identity provider, whose own pages then redirect among themselves. A
///   navigation the API redirected elsewhere starts a sign-in window of
///   `SIGN_IN_MS` in which any https page may load; it ends the moment the
///   window is back on the app or the API.
/// - Anything else stays out of the window and opens in the browser.
///
/// `from` is where the navigation started (for a redirect, the address the
/// chain began at). Returns `{ allow, external, signInUntil }`.
export function navigationDecision({ target, from, origins, apiOrigins, signInUntil = 0, now = Date.now(), redirect = false }) {
  const to = originOf(target)
  let protocol = ''
  try { protocol = new URL(target).protocol } catch { /* not a URL */ }
  if (!to || (protocol !== 'https:' && protocol !== 'http:')) {
    return { allow: false, external: isSafeExternal(target), signInUntil }
  }
  if (origins.includes(to)) return { allow: true, external: false, signInUntil: 0 }
  if (protocol === 'https:' && signInUntil > now) return { allow: true, external: false, signInUntil }
  if (protocol === 'https:' && redirect && apiOrigins.includes(originOf(from))) {
    return { allow: true, external: false, signInUntil: now + SIGN_IN_MS }
  }
  return { allow: false, external: true, signInUntil }
}
