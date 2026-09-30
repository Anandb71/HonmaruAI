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

const originOf = (value) => {
  try {
    const url = new URL(String(value).trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null
  } catch {
    return null
  }
}

/// `--app-url=<url>` or HONMARU_APP_URL (a local dev server, a staging build),
/// else the production web app. A value that is not an http(s) URL is ignored.
export function appUrlFrom(env = {}, argv = []) {
  const flag = argv.find((arg) => typeof arg === 'string' && arg.startsWith('--app-url='))
  const wanted = flag ? flag.slice('--app-url='.length) : env.HONMARU_APP_URL
  if (wanted && originOf(wanted)) return new URL(wanted).toString()
  return DEFAULT_APP_URL
}

const list = (value) => String(value || '').split(',').map(originOf).filter(Boolean)

/// The API origins: the production Worker, plus HONMARU_API_ORIGINS
/// (comma-separated) for another deployment.
export function apiOriginsFrom(env = {}) {
  return [...new Set([...DEFAULT_API_ORIGINS, ...list(env.HONMARU_API_ORIGINS)])]
}

/// Every origin the window may show without a sign-in in progress.
export function allowedOrigins(appUrl, env = {}) {
  return [...new Set([originOf(appUrl), ...apiOriginsFrom(env), ...SIGN_IN_ORIGINS].filter(Boolean))]
}
