// Run before `npm run dist` and `npm run release`: installers are built only
// when they will be signed (docs/architecture/discord-model-platform-plan.md
// §11.4). An unsigned installer runs behind the operating system's warning,
// teaches people to click through it, and cannot be updated safely — so the
// release scripts refuse to make one. `npm run dist:dir` still builds an
// unpacked app to try locally.
//
// The check is for the platform being built on, which is the one
// electron-builder builds for: a Mac installer is signed and notarized on a
// Mac, a Windows one on Windows.

import { pathToFileURL } from 'node:url'

const has = (env, name) => typeof env[name] === 'string' && env[name].trim() !== ''
const all = (env, names) => names.every((name) => has(env, name))

/// What is missing to sign (and, on a Mac, notarize) on `platform`, as
/// sentences to print; empty when the build may go ahead.
export function signingProblems(env = {}, platform = process.platform) {
  if (platform === 'darwin') {
    const problems = []
    if (!has(env, 'CSC_LINK') && !has(env, 'CSC_NAME')) {
      problems.push('No Developer ID Application certificate: set CSC_LINK (the .p12, as a path or base64) and CSC_KEY_PASSWORD, or CSC_NAME for one already in the keychain.')
    }
    const notarize = all(env, ['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER'])
      || all(env, ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'])
      || all(env, ['APPLE_KEYCHAIN', 'APPLE_KEYCHAIN_PROFILE'])
    if (!notarize) {
      problems.push('No notarization credentials: set APPLE_API_KEY, APPLE_API_KEY_ID and APPLE_API_ISSUER (preferred), or APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID.')
    }
    return problems
  }
  if (platform === 'win32') {
    if (has(env, 'WIN_CSC_LINK') || has(env, 'CSC_LINK')) return []
    return ['No code-signing certificate: set WIN_CSC_LINK (or CSC_LINK) to the .pfx, as a path or base64, and CSC_KEY_PASSWORD. (Azure Trusted Signing needs win.azureSignOptions in electron-builder.yml first.)']
  }
  // Linux: an AppImage is not code-signed; updates are checked against the
  // release's sha512 instead.
  return []
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problems = signingProblems(process.env, process.platform)
  if (problems.length) {
    console.error('Refusing to build installers that would not be signed.\n')
    for (const problem of problems) console.error(`  - ${problem}`)
    console.error('\nSee apps/desktop/README.md ("Releasing"). To try the app locally, `npm run dist:dir` builds it unpacked.')
    process.exit(1)
  }
}
