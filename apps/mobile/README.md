# Honmaru mobile (Expo) — PoC-B

The React Native app for iOS and Android from
`docs/architecture/discord-model-platform-plan.md` §11–12. It shares its
logic with the web through `packages/core` (API client, channel sync,
@mention rules) and `packages/protocol` (the API's shapes); only the views are
its own.

What it does today: sign in with an emailed code or with Apple (iOS), the
workspace's channels with unread counts, and a channel's messages (FlashList
v2) with sending, older pages, and catching up when the app comes back to the
front — all over `/v2`, the per-workspace Durable Object (PoC-A). Links to the
web app open here (below).

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

Links and Sign in with Apple need native capabilities, so they work in a
development build (`npx expo run:ios|android` or `eas build --profile
development`), not in Expo Go.

## Links

A link is a real path on the web app, built and read by
`packages/core/src/links.ts` (the web uses the same rules):

| Link | Opens |
| --- | --- |
| `https://app.honmaruai.com/c/<channel>?org=<orgId>` | That channel (`src/app/c/[channel].tsx`), after switching to `<orgId>` when it is one of your workspaces; a workspace you are not in says so |
| `https://app.honmaruai.com/join/<code>` | The invitation (`src/app/join/[code].tsx`): redeemed when signed in, otherwise carried into sign-in |

`app.json` claims them — `ios.associatedDomains: applinks:app.honmaruai.com` and
an Android `intentFilters` entry with `autoVerify` for `/c/` and `/join/`.
`src/app/+native-intent.tsx` normalizes whatever the system hands over (an
`https://` link or `honmaru://c/…`) to the router's path.

The other half of the association is on the web domain:
`/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`,
made by the Worker (`worker/src/wellKnown.js`) from `APPLE_TEAM_ID` and
`ANDROID_CERT_SHA256`, served on app.honmaruai.com by a Pages Function
(`web-react/functions/.well-known/[file].ts`). Until those variables are set the
files are 404 and links open the web instead (docs/setup-secrets.md §4.7).

Try one on a device or simulator:

```sh
xcrun simctl openurl booted "https://app.honmaruai.com/c/b%3Ageneral"
adb shell am start -a android.intent.action.VIEW -c android.intent.category.BROWSABLE \
  -d "https://app.honmaruai.com/c/b%3Ageneral" com.honmaru.ai.poc
```

## Sign in with Apple

iOS only (`expo-apple-authentication`, `ios.usesAppleSignIn` and its config
plugin in `app.json`). The app hands Apple the SHA-256 of a random nonce and
sends the Worker the identity token with the nonce itself (`src/lib/apple.ts`);
`POST /auth/apple` checks the token against Apple's keys and signs the person
in — the account already linked to that Apple ID, the account with the same
proved address, or a new one (`worker/src/apple.js`). The App ID needs the
**Sign in with Apple** capability in the Apple Developer account (EAS Build adds
it from `usesAppleSignIn`).

## Not in this PoC yet

Push (APNs + FCM with a Notification Service Extension via config plugin),
Google sign-in on Android, RevenueCat, Jam, and the on-device measurements
PoC-B is judged by (cold start, 60 fps scroll on a low-end Android).
