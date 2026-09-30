# Honmaru mobile (Expo) — PoC-B

The React Native app for iOS and Android from
`docs/architecture/discord-model-platform-plan.md` §11–12. It shares its
logic with the web through `packages/core` (API client, channel sync,
@mention rules) and `packages/protocol` (the API's shapes); only the views are
its own.

What it does today: sign in with an emailed code, the workspace's channels
with unread counts, and a channel's messages (FlashList v2) with sending,
older pages, and catching up when the app comes back to the front — all over
`/v2`, the per-workspace Durable Object (PoC-A).

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

## Not in this PoC yet

Push (APNs + FCM with a Notification Service Extension via config plugin),
universal links, Sign in with Apple, RevenueCat, Jam, and the on-device
measurements PoC-B is judged by (cold start, 60 fps scroll on a low-end
Android).
