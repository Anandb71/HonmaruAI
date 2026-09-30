// The two files the phone apps check before they open links to this site
// (docs/architecture/discord-model-platform-plan.md §11.3):
//
//   /.well-known/apple-app-site-association   iOS Universal Links
//   /.well-known/assetlinks.json              Android App Links
//
// The Worker makes them from its variables (worker/src/wellKnown.js: the
// Apple Team ID and the Android signing fingerprints are not in the
// repository). A Pages Function (functions/.well-known/[file].ts) answers
// them on this domain by asking the Worker, and hands back the body as
// JSON with no redirect — Apple and Google follow none.

export const WELL_KNOWN_FILES = ['apple-app-site-association', 'assetlinks.json'] as const
export const DEFAULT_API_HOST = 'tiktokforwork.torubj0904.workers.dev'

/// The file from the Worker at `apiHost`, or null for a name that is not one of the two.
export async function proxyWellKnown(file: string, apiHost: string | undefined, doFetch: typeof fetch = fetch): Promise<Response | null> {
  if (!(WELL_KNOWN_FILES as readonly string[]).includes(file)) return null
  const host = (apiHost || DEFAULT_API_HOST).trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
  let upstream: Response
  try {
    upstream = await doFetch(`https://${host}/.well-known/${file}`, { headers: { accept: 'application/json' }, redirect: 'manual' })
  } catch {
    return new Response('{"message":"Not available right now."}', { status: 502, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
  }
  const ok = upstream.status === 200
  return new Response(ok ? await upstream.text() : '{"message":"Not configured."}', {
    status: ok ? 200 : upstream.status >= 500 ? 502 : 404,
    headers: {
      'content-type': 'application/json',
      'cache-control': ok ? 'public, max-age=3600' : 'no-store',
    },
  })
}
