import { describe, it, expect } from 'vitest'
import { signingProblems } from '../scripts/signing.mjs'

describe('building installers', () => {
  it('is refused on a Mac without a certificate and notarization', () => {
    expect(signingProblems({}, 'darwin')).toHaveLength(2)
    expect(signingProblems({ CSC_LINK: 'cert.p12' }, 'darwin')).toHaveLength(1)
    expect(signingProblems({ APPLE_ID: 'a', APPLE_APP_SPECIFIC_PASSWORD: 'b', APPLE_TEAM_ID: 'c' }, 'darwin')).toHaveLength(1)
    // Half of a set of notarization credentials is not enough.
    expect(signingProblems({ CSC_LINK: 'cert.p12', APPLE_ID: 'a', APPLE_TEAM_ID: 'c' }, 'darwin')).toHaveLength(1)
    // Blank values count as unset.
    expect(signingProblems({ CSC_LINK: ' ', APPLE_ID: 'a', APPLE_APP_SPECIFIC_PASSWORD: 'b', APPLE_TEAM_ID: 'c' }, 'darwin')).toHaveLength(1)
  })

  it('goes ahead on a Mac with a Developer ID and any one way to notarize', () => {
    expect(signingProblems({ CSC_LINK: 'cert.p12', APPLE_ID: 'a', APPLE_APP_SPECIFIC_PASSWORD: 'b', APPLE_TEAM_ID: 'c' }, 'darwin')).toEqual([])
    expect(signingProblems({ CSC_NAME: 'Developer ID Application: Honmaru', APPLE_API_KEY: 'k.p8', APPLE_API_KEY_ID: 'i', APPLE_API_ISSUER: 'u' }, 'darwin')).toEqual([])
    expect(signingProblems({ CSC_LINK: 'cert.p12', APPLE_KEYCHAIN: 'k', APPLE_KEYCHAIN_PROFILE: 'p' }, 'darwin')).toEqual([])
  })

  it('needs a certificate on Windows', () => {
    expect(signingProblems({}, 'win32')).toHaveLength(1)
    expect(signingProblems({ WIN_CSC_LINK: 'cert.pfx' }, 'win32')).toEqual([])
    expect(signingProblems({ CSC_LINK: 'cert.pfx' }, 'win32')).toEqual([])
  })

  it('has nothing to sign on Linux', () => {
    expect(signingProblems({}, 'linux')).toEqual([])
  })
})
