// Links into the app: https://app.honmaruai.com/c/<channel>?org=<orgId> and
// /join/<code> (Universal Links / App Links, see app.json), or the same paths
// on the honmaru:// scheme. The link rules are shared with the web
// (packages/core/src/links.ts); this only normalizes the path the router
// sees — the channel screen switches workspace, the join screen redeems.

import { linkPath, parseAppLink } from '@honmaru/core'

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const link = parseAppLink(path)
    return link ? linkPath(link) : path
  } catch {
    // Never throw here: the app would not open.
    return '/'
  }
}
