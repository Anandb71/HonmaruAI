import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { SessionProvider, useSession } from '../lib/session'

function Screens() {
  const { ready, token } = useSession()
  if (!ready) return null
  return (
    <Stack>
      <Stack.Protected guard={Boolean(token)}>
        <Stack.Screen name="index" options={{ title: 'Channels' }} />
        <Stack.Screen name="c/[channel]" options={{ title: '' }} />
      </Stack.Protected>
      <Stack.Protected guard={!token}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
      {/* An invitation link, signed in or not (it sends you to sign in). */}
      <Stack.Screen name="join/[code]" options={{ title: 'Join' }} />
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="auto" />
        <Screens />
      </SessionProvider>
    </SafeAreaProvider>
  )
}
