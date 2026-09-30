# Honmaru mobile (Expo) — PoC-B

The React Native app for iOS and Android from
`docs/architecture/discord-model-platform-plan.md` §11–12. It shares its
logic with the web through `packages/core` (API client, channel sync,
@mention rules) and `packages/protocol` (the API's shapes); only the views are
its own.

What it does today: sign in with an emailed code, the workspace's channels
with unread counts, and a channel's messages (FlashList v2) with sending,
older pages, and catching up when the app comes back to the front — all over
`/v2`, the per-workspace Durable Object (PoC-A). And push: see below.

`/v2` is off in production unless `WORKSPACE_V2` names the workspace. Point
`expo.extra.apiBase` in `app.json` at staging, or enable a test workspace.

## Run it

From the repository root (npm workspaces: `apps/*`, `packages/*`):

```sh
npm install
cd apps/mobile
npx expo start            # Expo Go is enough for this PoC
npx tsc --noEmit          # typecheck
CI=1 npx expo export --platform ios --platform android   # what CI bundles
```

The PoC bundle id is `com.honmaru.ai.poc`, so it installs beside the App Store
app. It takes over `com.honmaru.ai` only when it reaches parity (plan §11.3).

## Push

`src/lib/push.ts`. On sign-in (and every launch after) the app asks for
permission, takes the phone's **native** token from
`getDevicePushTokenAsync` — APNs on an iPhone, FCM on Android, not the Expo
push service — and registers it with `POST /devices` and its `platform`.
Signing out deletes it first. The Worker sends to Apple and Google itself
(`worker/src/apns.js`, `worker/src/fcm.js`). Tapping a message notification
opens `/c/[channel]` in its workspace (`pushTarget` in `packages/core` reads
the payload on either platform). An iPhone groups a conversation's
notifications by `thread-id` `orgId|channel`; on Android the same key is the
tag, so the newest message in a conversation replaces the last.

What it needs, beyond a development build (Expo Go on Android has no remote
push, and a simulator has no token):

- **Android**: a Firebase project with this package name. Its
  `google-services.json` goes in the EAS file variable `GOOGLE_SERVICES_JSON`
  or at `apps/mobile/google-services.json` (git-ignored; `app.config.js` picks
  either up). The Worker needs the project's service account in the
  `FCM_SERVICE_ACCOUNT` secret (`docs/setup-secrets.md` §2b). Without the file
  the app builds and simply registers nothing.
- **iPhone**: the Worker sends as `APNS_TOPIC` (`com.honmaru.ai`), so the PoC
  bundle id receives nothing until it takes over that id, or until the Worker
  is given the PoC's topic. A development build's token is a sandbox token and
  only works while `APNS_ENVIRONMENT` is `sandbox`.

Not yet: clearing a notification when it is read elsewhere (the Worker's
silent push goes to iPhones only, and the app does not handle it yet), and
the Notification Service Extension (sender avatars, payload decryption).

## Not in this PoC yet

The Notification Service Extension and read-clearing above, universal links,
Sign in with Apple, RevenueCat, Jam, and the on-device measurements PoC-B is
judged by (cold start, 60 fps scroll on a low-end Android).
