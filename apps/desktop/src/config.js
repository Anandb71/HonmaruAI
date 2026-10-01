// What the desktop app loads, and which origins are its own.
//
// Pure: no Electron here (test/config.test.js).

/// The web app the window shows. The same build people use in a browser, so
/// the desktop app is always the current version without an update.
export const DEFAULT_APP_URL = 'https://app.honmaruai.com'
/// The Worker the web app talks to, where sign-in starts.
export const DEFAULT_API_ORIGINS = ['https://tiktokforwork.torubj0904.workers.dev']
/// Sign in with GitHub happens on github.com.
const SIGN_IN_ORIGINS = ['https://github.com']

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/// The origin of a URL the app may be pointed at, or null. Only https, except
/// a dev server on this machine over http — and that only while developing:
/// an installed app is never pointed at plain http.
export function trustedOrigin(value, { packaged = true } = {}) {
  try {
    const url = new URL(String(value).trim())
    if (url.protocol === 'https:') return url.origin
    if (url.protocol === 'http:' && !packaged && LOCAL_HOSTS.has(url.hostname)) return url.origin
    return null
  } catch {
    return null
  }
}

/// `--app-url=<url>` or HONMARU_APP_URL (a local dev server, a staging build),
/// else the production web app. Both are for development only: an installed
/// (packaged) app ignores them, so nothing on the command line or in the
/// environment can point a signed app at another site. A value that is not
/// https (or http on localhost, in development) is ignored too.
export function appUrlFrom(env = {}, argv = [], { packaged = true } = {}) {
  if (packaged) return DEFAULT_APP_URL
  const flag = argv.find((arg) => typeof arg === 'string' && arg.startsWith('--app-url='))
  const wanted = flag ? flag.slice('--app-url='.length) : env.HONMARU_APP_URL
  if (wanted && trustedOrigin(wanted, { packaged })) return new URL(wanted).toString()
  return DEFAULT_APP_URL
}

const list = (value, options) => String(value || '').split(',').map((item) => trustedOrigin(item, options)).filter(Boolean)

/// The API origins: the production Worker, plus HONMARU_API_ORIGINS
/// (comma-separated) for another deployment — in development only, like the
/// app's address.
export function apiOriginsFrom(env = {}, { packaged = true } = {}) {
  if (packaged) return [...DEFAULT_API_ORIGINS]
  return [...new Set([...DEFAULT_API_ORIGINS, ...list(env.HONMARU_API_ORIGINS, { packaged })])]
}

/// Every origin the window may show without a sign-in in progress.
export function allowedOrigins(appUrl, env = {}, { packaged = true } = {}) {
  return [...new Set([trustedOrigin(appUrl, { packaged }), ...apiOriginsFrom(env, { packaged }), ...SIGN_IN_ORIGINS].filter(Boolean))]
}

/// Whether this build checks for updates: only an installed app built by
/// `npm run dist` or `npm run release`, which refuse to build unless signing
/// is configured (scripts/signing.mjs) and then mark the app's package.json
/// with `honmaruUpdates`. `npm start` and `npm run dist:dir` never check.
export function updatesEnabled({ packaged = false, metadata = {} } = {}) {
  const flag = metadata?.honmaruUpdates
  return packaged === true && (flag === true || flag === 'true')
}
