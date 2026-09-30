// An invitation link (https://app.honmaruai.com/join/<code>). Signed in: the
// code is redeemed and the app opens in that workspace. Signed out: on to
// sign-in with the code, which spends it on the way in.

import { Redirect, router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { ApiError } from '@honmaru/core'
import { useSession } from '../../lib/session'

export default function Join() {
  const { code } = useLocalSearchParams<{ code: string }>()
  const { api, token, chooseOrg } = useSession()
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!token || !code) return
    let live = true
    api.acceptInvite(code)
      .then(async (r) => {
        if (!live) return
        if (r.pending) { setMessage(r.message || 'An admin of this workspace needs to approve you.'); return }
        await chooseOrg(r.orgId)
        router.replace('/')
      })
      .catch((err) => { if (live) setMessage(err instanceof ApiError ? err.message : 'That invitation could not be used.') })
    return () => { live = false }
    // Once per code and session: `chooseOrg` is a new function every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, token, code])

  if (!token) return <Redirect href={{ pathname: '/sign-in', params: { invite: code } }} />
  return (
    <View style={styles.screen}>
      {message ? (
        <>
          <Text style={styles.text}>{message}</Text>
          <Pressable onPress={() => router.replace('/')}><Text style={styles.link}>Go to your channels</Text></Pressable>
        </>
      ) : <ActivityIndicator />}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  text: { fontSize: 17, textAlign: 'center' },
  link: { color: '#1f6feb', fontSize: 17 },
})
