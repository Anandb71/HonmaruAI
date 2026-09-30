// /.well-known/apple-app-site-association and /.well-known/assetlinks.json on
// the web app's own domain, from the Worker (src/utils/wellKnown.ts says why).
// Every other /.well-known/ path goes on to the static files.
//
// API_HOST (a Pages environment variable, optional) names the Worker; the
// production one otherwise.

import { proxyWellKnown } from '../../src/utils/wellKnown'

interface Context {
  params: { file?: string | string[] }
  env: { API_HOST?: string }
  next: () => Promise<Response>
}

export async function onRequestGet(context: Context): Promise<Response> {
  const file = Array.isArray(context.params.file) ? context.params.file.join('/') : context.params.file || ''
  return (await proxyWellKnown(file, context.env.API_HOST)) || context.next()
}
