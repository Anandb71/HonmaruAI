// One channel: messages from the workspace's Durable Object through the
// shared ChannelSync (packages/core), drawn with FlashList v2.
//
// Also where a link opens (https://app.honmaruai.com/c/<channel>?org=<orgId>,
// see +native-intent.tsx): the link's workspace is switched to when it is
// one of yours; a link to a workspace you are not in says so.

import { FlashList } from '@shopify/flash-list'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AppState, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChannelSync, splitMentions, type ChannelState } from '@honmaru/core'
import type { Message } from '@honmaru/protocol'
import { useSession } from '../../lib/session'
import { loadDraft, saveDraft } from '../../lib/drafts'

export default function Channel() {
  const { channel, name, org } = useLocalSearchParams<{ channel: string; name?: string; org?: string }>()
  const { api, orgId, me, chooseOrg } = useSession()
  const linkedOrg = typeof org === 'string' && org ? org : null
  const foreign = Boolean(linkedOrg && me && !(me.orgs || []).some((o) => o.id === linkedOrg))
  // Until the link's workspace is the current one, nothing is opened.
  const here = !linkedOrg || foreign ? orgId : (orgId === linkedOrg ? orgId : null)
  useEffect(() => {
    if (linkedOrg && !foreign && me && orgId !== linkedOrg) void chooseOrg(linkedOrg)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedOrg, foreign, me, orgId])
  const sync = useMemo(() => new ChannelSync(api, here || '', channel), [api, here, channel])
  const [state, setState] = useState<ChannelState>(sync.snapshot)
  const [draft, setDraft] = useState('')
  const insets = useSafeAreaInsets()
  // What was half-written here is back in the box, and kept as it changes.
  // Nothing is written until what was kept has been read.
  const draftFor = useRef<string | null>(null)
  useEffect(() => {
    draftFor.current = null
    if (!here) return
    const at = `${here}|${channel}`
    let live = true
    void loadDraft(here, channel).then((kept) => {
      if (!live) return
      draftFor.current = at
      setDraft(kept)
    })
    return () => { live = false }
  }, [here, channel])
  useEffect(() => {
    if (!here || draftFor.current !== `${here}|${channel}`) return
    void saveDraft(here, channel, draft)
  }, [draft, here, channel])

  useEffect(() => {
    if (!here || foreign) return
    const off = sync.subscribe(setState)
    void sync.open().then(() => sync.markRead())
    // Back to the front: whatever was said meanwhile, and no more.
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void sync.catchUp().then(() => sync.markRead()) })
    return () => { off(); sub.remove() }
  }, [sync, here, foreign])

  const send = () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    void sync.send(text, me?.login || '').then(() => sync.markRead()).catch(() => setDraft(text))
  }

  // Newest at the bottom, kept in view as messages arrive (FlashList v2).
  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: name ? `# ${name}` : channel }} />
      {foreign ? <Text style={styles.error}>This link is to a workspace you are not in.</Text> : null}
      <FlashList
        data={state.messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <Row message={item} />}
        maintainVisibleContentPosition={{ autoscrollToBottomThreshold: 0.2, startRenderingFromBottom: true }}
        onStartReached={() => { void sync.loadOlder() }}
        ListEmptyComponent={state.loading ? null : <Text style={styles.empty}>No messages yet.</Text>}
      />
      {state.error ? <Text style={styles.error}>{state.error}</Text> : null}
      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <TextInput style={styles.input} value={draft} onChangeText={setDraft} placeholder="Message" multiline />
        <Pressable onPress={send} disabled={!draft.trim()} style={styles.send}><Text style={styles.sendText}>Send</Text></Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

function Row({ message }: { message: Message }) {
  const pending = message.id.startsWith('pending:')
  return (
    <View style={[styles.row, pending ? styles.pending : null]}>
      <Text style={styles.author}>{message.author || 'Someone'}</Text>
      <Text style={styles.body}>
        {message.deletedAt ? <Text style={styles.deleted}>This message was deleted.</Text>
          : splitMentions(message.body).map((part, i) => (
            <Text key={i} style={part.mention ? styles.mention : null}>{part.text}</Text>
          ))}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  row: { paddingHorizontal: 16, paddingVertical: 8 },
  pending: { opacity: 0.5 },
  author: { fontWeight: '700', fontSize: 15, marginBottom: 2 },
  body: { fontSize: 16, lineHeight: 22 },
  mention: { color: '#1f6feb', fontWeight: '600' },
  deleted: { fontStyle: 'italic', color: '#888' },
  empty: { textAlign: 'center', color: '#888', padding: 32 },
  error: { color: '#d1242f', paddingHorizontal: 16 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#ccc' },
  input: { flex: 1, minHeight: 40, maxHeight: 140, borderWidth: StyleSheet.hairlineWidth, borderColor: '#999', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16 },
  send: { paddingHorizontal: 12, paddingVertical: 10 },
  sendText: { color: '#1f6feb', fontWeight: '700', fontSize: 16 },
})
