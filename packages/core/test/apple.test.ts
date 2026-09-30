import { expect, test } from 'vitest'
import { Api } from '../src/api'

// Sign in with Apple sends the Worker everything it needs from the one
// sign-in: the identity token and nonce to sign in with, and the
// authorization code it trades for the refresh token it revokes when the
// account is deleted (worker/src/apple.js).
test('signInWithApple posts the identity token, the nonce and the authorization code', async () => {
  const calls: Array<{ method: string; path: string; body: unknown }> = []
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ method: init?.method || 'GET', path: new URL(String(input)).pathname, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    return new Response(JSON.stringify({ token: 't', userId: 'u', login: 'l', orgId: null }))
  }) as typeof fetch
  const api = new Api({ base: 'https://api.example.com', fetch: fetchFn })
  const signed = await api.signInWithApple({ identityToken: 'id.token.sig', nonce: 'n', authorizationCode: 'c-1' })
  expect(signed.token).toBe('t')
  expect(calls).toEqual([{ method: 'POST', path: '/auth/apple', body: { identityToken: 'id.token.sig', nonce: 'n', authorizationCode: 'c-1' } }])
})
