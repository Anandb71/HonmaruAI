// Sign in with a code sent by email (the same /auth/otp routes the web and
// the iPhone app use).

import { useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { ApiError } from '@honmaru/core'
import { useSession } from '../lib/session'

export default function SignIn() {
  const { api, signIn } = useSession()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (task: () => Promise<void>) => {
    setBusy(true); setError(null)
    try { await task() } catch (err) { setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.') }
    finally { setBusy(false) }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.card}>
        <Text style={styles.title}>Honmaru</Text>
        {!sent ? (
          <>
            <TextInput
              style={styles.input} placeholder="you@company.com" autoCapitalize="none" autoComplete="email"
              keyboardType="email-address" textContentType="emailAddress" value={email} onChangeText={setEmail}
            />
            <Pressable style={styles.button} disabled={busy || !email.includes('@')}
              onPress={() => run(async () => { await api.requestCode({ email: email.trim() }); setSent(true) })}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send code</Text>}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.hint}>We sent a code to {email.trim()}.</Text>
            <TextInput
              style={styles.input} placeholder="123456" keyboardType="number-pad" textContentType="oneTimeCode"
              autoComplete="one-time-code" value={code} onChangeText={setCode}
            />
            <Pressable style={styles.button} disabled={busy || code.trim().length < 4}
              onPress={() => run(async () => { const r = await api.verifyCode({ email: email.trim(), code: code.trim() }); await signIn(r.token) })}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
            </Pressable>
            <Pressable onPress={() => { setSent(false); setCode('') }}><Text style={styles.link}>Use another address</Text></Pressable>
          </>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: 24 },
  card: { gap: 12 },
  title: { fontSize: 32, fontWeight: '700', marginBottom: 12 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#999', borderRadius: 10, padding: 14, fontSize: 17 },
  button: { backgroundColor: '#1f6feb', borderRadius: 10, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  hint: { fontSize: 15, color: '#666' },
  link: { color: '#1f6feb', textAlign: 'center', padding: 8 },
  error: { color: '#d1242f' },
})
