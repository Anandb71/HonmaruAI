// Who is signed in, kept in the Keychain / Keystore (expo-secure-store), and
// the one API client every screen uses (packages/core).

import Constants from 'expo-constants'
import * as SecureStore from 'expo-secure-store'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Api } from '@honmaru/core'
import type { Me } from '@honmaru/protocol'

const TOKEN_KEY = 'honmaru.session'
const ORG_KEY = 'honmaru.org'

export const API_BASE: string = (Constants.expoConfig?.extra as { apiBase?: string } | undefined)?.apiBase
  || 'https://tiktokforwork.torubj0904.workers.dev'

interface SessionValue {
  ready: boolean
  api: Api
  token: string | null
  me: Me | null
  orgId: string | null
  /// `orgId`: where to land — the workspace an invitation just let them into.
  signIn: (token: string, orgId?: string | null) => Promise<void>
  signOut: () => Promise<void>
  chooseOrg: (orgId: string) => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const tokenRef = useRef<string | null>(null)
  const api = useMemo(() => new Api({ base: API_BASE, token: () => tokenRef.current }), [])
  const [ready, setReady] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)

  const load = useCallback(async (next: string | null) => {
    tokenRef.current = next
    setToken(next)
    if (!next) { setMe(null); return }
    try {
      const who = await api.me()
      setMe(who)
      const stored = await SecureStore.getItemAsync(ORG_KEY)
      const orgs = who.orgs || []
      setOrgId(orgs.some((o) => o.id === stored) ? stored : (who.orgId || orgs[0]?.id || null))
    } catch {
      // A session the server no longer knows: signed out.
      tokenRef.current = null
      setToken(null)
      await SecureStore.deleteItemAsync(TOKEN_KEY)
    }
  }, [api])

  useEffect(() => {
    void SecureStore.getItemAsync(TOKEN_KEY).then(load).finally(() => setReady(true))
  }, [load])

  const value: SessionValue = {
    ready, api, token, me, orgId,
    signIn: async (next, landIn) => {
      await SecureStore.setItemAsync(TOKEN_KEY, next)
      if (landIn) await SecureStore.setItemAsync(ORG_KEY, landIn)
      await load(next)
    },
    signOut: async () => {
      await SecureStore.deleteItemAsync(TOKEN_KEY)
      await SecureStore.deleteItemAsync(ORG_KEY)
      tokenRef.current = null
      setToken(null); setMe(null); setOrgId(null)
    },
    chooseOrg: async (next) => { await SecureStore.setItemAsync(ORG_KEY, next); setOrgId(next) },
  }
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession outside SessionProvider')
  return value
}
