// Links that open the same place on the web and in the app
// (docs/architecture/discord-model-platform-plan.md §11.3).
//
// A link is a real path on the web app's domain, so the phone can claim it
// (Universal Links on iOS, App Links on Android) and a browser without the
// app still gets the web app:
//
//   https://app.honmaruai.com/c/<channel>[?org=<orgId>]   a conversation
//   https://app.honmaruai.com/join/<code>                  an invitation
//
// The web app turns the path into its own hash route on load
// (`webHashFor`); the app's router has a screen at the same path.
//
// The domain and the prefixes are also in the Worker's
// `/.well-known/apple-app-site-association` and `assetlinks.json`
// (worker/src/wellKnown.js) and in apps/mobile/app.json — change them together.

/// The web app, where a link points.
export const APP_ORIGIN = 'https://app.honmaruai.com'
/// Every path a link can start with: what the app claims.
export const LINK_PATH_PREFIXES = ['/c/', '/join/'] as const

export type AppLink =
  | { kind: 'channel'; channel: string; orgId: string | null }
  | { kind: 'join'; code: string }

// The same shapes the web's hash routes accept (web-react/src/utils/route.ts).
const CHANNEL = /^(b|dm|g|ag):[^\s]{1,200}$/
const ORG = /^[\w:.@|+/-]{1,160}$/
const CODE = /^[0-9a-f]{16,64}$/i

export const isChannel = (value: string): boolean => CHANNEL.test(value)
export const isOrgId = (value: string): boolean => ORG.test(value)

function decode(part: string): string {
  try { return decodeURIComponent(part) } catch { return part }
}

/// Where a link goes, as a path and query: `/c/b%3Ageneral?org=team%3Aacme`.
export function linkPath(link: AppLink): string {
  if (link.kind === 'join') return `/join/${encodeURIComponent(link.code.toLowerCase())}`
  const org = link.orgId ? `?org=${encodeURIComponent(link.orgId)}` : ''
  return `/c/${encodeURIComponent(link.channel)}${org}`
}

/// A conversation, as a link to paste anywhere.
export function channelLink(channel: string, orgId?: string | null, origin: string = APP_ORIGIN): string {
  return `${origin.replace(/\/$/, '')}${linkPath({ kind: 'channel', channel, orgId: orgId || null })}`
}

/// An invitation, as a link.
export function joinLink(code: string, origin: string = APP_ORIGIN): string {
  return `${origin.replace(/\/$/, '')}${linkPath({ kind: 'join', code })}`
}

/// What a link opens, or null when it is not one of ours. Takes a whole URL
/// (any host — the caller decides which hosts it trusts; the operating system
/// only hands the app links for its own domain), a `honmaru://` URL, or a
/// bare path with its query.
export function parseAppLink(input: string): AppLink | null {
  const raw = String(input || '').trim()
  if (!raw) return null
  let path: string
  let search: string
  try {
    // A custom scheme puts the first segment in the host: honmaru://c/x.
    const url = new URL(raw, 'https://link.invalid')
    const custom = url.protocol !== 'https:' && url.protocol !== 'http:'
    path = custom ? `/${url.host}${url.pathname}` : url.pathname
    search = url.search
  } catch {
    return null
  }
  const parts = path.split('/').filter(Boolean)
  const [head, ...rest] = parts
  if (head === 'c' && rest.length) {
    const channel = decode(rest.join('/'))
    if (!CHANNEL.test(channel)) return null
    const org = new URLSearchParams(search).get('org')
    return { kind: 'channel', channel, orgId: org && ORG.test(org) ? org : null }
  }
  if (head === 'join' && rest.length === 1) {
    const code = decode(rest[0]).trim()
    return CODE.test(code) ? { kind: 'join', code: code.toLowerCase() } : null
  }
  return null
}

/// The web app's own hash route for a link: `#/c/<view>?org=<orgId>` or
/// `#/join/<code>`.
export function webHashFor(link: AppLink): string {
  if (link.kind === 'join') return `#/join/${encodeURIComponent(link.code)}`
  return `#/c/${encodeURIComponent(link.channel)}${link.orgId ? `?org=${encodeURIComponent(link.orgId)}` : ''}`
}
