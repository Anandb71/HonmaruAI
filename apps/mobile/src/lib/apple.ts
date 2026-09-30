// Sign in with Apple (iOS). Apple is handed the SHA-256 of a random string
// as the nonce; the Worker is sent the string itself and checks that the
// token's nonce is its hash (worker/src/apple.js), so a token lifted from
// somewhere else is no use on its own.

import * as AppleAuthentication from 'expo-apple-authentication'
import * as Crypto from 'expo-crypto'
import { Platform } from 'react-native'
import type { Api } from '@honmaru/core'
import type { SignedIn } from '@honmaru/protocol'

export async function appleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false
  try { return await AppleAuthentication.isAvailableAsync() } catch { return false }
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

/// Signed in, or null when the person closed Apple's sheet.
export async function signInWithApple(api: Api, inviteCode?: string): Promise<SignedIn | null> {
  const nonce = hex(Crypto.getRandomBytes(32))
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce)
  let credential: AppleAuthentication.AppleAuthenticationCredential
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashed,
    })
  } catch (err) {
    if ((err as { code?: string } | null)?.code === 'ERR_REQUEST_CANCELED') return null
    throw err
  }
  if (!credential.identityToken) throw new Error('Apple did not return a sign-in token.')
  // Apple gives the name the first time only; the Worker uses it for a new account.
  const name = credential.fullName ? AppleAuthentication.formatFullName(credential.fullName).trim() : ''
  return api.signInWithApple({ identityToken: credential.identityToken, nonce, name: name || undefined, inviteCode: inviteCode || undefined })
}
