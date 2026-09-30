# Notifications

> The feed's promise is *open the app and the decision is already there*.
> That assumes you knew to open it. This is the part that tells you.

One hub, `worker/src/notify.js`, and three channels. Every place a card
changes hands — the relay, the 15-minute sync, the inbound email webhook —
calls the hub once and moves on. The hub decides who is told, in what
language, and on what.

| Channel | Reaches | Needs | File |
|---------|---------|-------|------|
| **APNs** | the iOS app | the App ID entitlement and four secrets ([push-notifications.md](push-notifications.md)) | `apns.js` |
| **Web Push** | any browser, Android, an iPhone with the site on its home screen (iOS 16.4+), a desktop shell around a browser | a VAPID key pair, three secrets | `webpush.js` |
| **Email** | anyone with an address, when nothing above delivered | Resend, one secret | `mailer.js` |

The first two are pushes. Email is the floor: it goes out only when no push
arrived — no device, no browser, or every one of them came back dead — and
the person has an address and has not switched it off. Nobody is told twice.

## In the reader's language

A notification is composed on the server, and the server knows what each
person reads. `users.locale` is:

- **seeded** on the first sign-in from `Accept-Language`, which URLSession
  and every browser send without being asked;
- **set** explicitly by the app's language toggle (`PUT /me {locale}`) and by
  the web client from `navigator.language`;
- **never overwritten** by anything else. Loading the org graph used to reset
  every teammate to English; `upsertUser` now keeps a stored locale unless a
  caller actually passes one.

Every string a notification can say is in `notifyCopy.js`, in English,
Japanese, Spanish, French and German, with English as the fallback for a
language we have not written. Adding one is adding a block.

The **card itself** is written by the router in the *sender's* language,
because the sender's app is the only thing the router knows. The relay is the
first place that knows the recipient too, so on `card_created` it translates
the title, summary and context into the recipient's language with one model
call (`localize.js`), stores the result on the card as `localized[locale]`,
and re-broadcasts it. The notification uses that title; the web client shows
it; the original fields are untouched, so the sender still reads their own
words and the "decided" alert they get back is in their language.

The translation is skipped whenever it would change nothing (same language,
already translated, no model configured) and is paid from the sender's AI
allowance, so a socket loop creating cards cannot run up a bill the meter
never saw.

## What is sent

| Trigger | Kind | Who is told |
|---------|------|-------------|
| A card is routed to you | `created` | you, unless you routed it to yourself |
| A card you sent is decided | `decided` | you, unless you decided it |
| The sender nudges | `nudged` | the recipient |
| A sync creates several cards | `digest` | you, once for the batch |

The body is the **title and the routing line only** — never the summary. A
lock screen is a public surface and a summary can carry a salary.
`apns-collapse-id` and the Web Push `Topic` are the card id, so a card
created and then decided collapses to one notification.

## Web Push — setup

```bash
cd worker
node scripts/vapid-keys.mjs           # prints a fresh pair
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT   # mailto:you@example.com
npx wrangler secret put APP_WEB_URL     # optional: where a tap or an email link opens
```

`GET /health` reports `webPush: true` once the three are set. The keys are in
the format `web-push` prints, so a pair generated with that tool works too.

The web client (`web-react/`) registers `public/sw.js`, shows a bell in the
top bar until notifications are on, and on a click asks permission,
subscribes, and posts the subscription to `POST /push/subscriptions`. The
Worker binds it to the session's login — never to a login the browser
claims — and encrypts every payload to the subscription's own keys
(RFC 8291, `aes128gcm`), so the push service in between relays bytes it
cannot read. Signing out unsubscribes and forgets it on the server.

On an iPhone the bell says the true thing instead: add the site to the home
screen first, because Safari only exposes push to an installed web app. The
manifest and `apple-mobile-web-app-capable` meta in `index.html` are what
make it installable.

### Chrome, Firefox, Edge, Safari: what the web client does

- **The prompt comes first.** Firefox and Safari only show a permission
  prompt while the click that asked for it still counts as the person's. A
  network wait before the prompt can use that up, and the prompt is then
  swallowed: Firefox shows a crossed-out bell in the address bar instead. So
  `enableWebPush` calls `requestPermission()` before any `await`. The VAPID
  key is fetched ahead of time, when the bell or the settings screen
  appears (`prefetchVapidKey`), or alongside the prompt, never before it.
- **Closed is not blocked.** A prompt dismissed without an answer
  (`default`) leaves the bell in place so the person can ask again. Only
  `denied` says "blocked in your browser settings".
- **Resubscribed on every open.** `resyncWebPush` hands the browser's
  existing subscription to `POST /push/subscriptions` again (an upsert). It
  makes a new one if the Worker's key changed, or if the browser dropped the
  subscription while push was on here. While push is on, the page keeps the
  Worker's key in the Cache API (`honmaru-push`), and turning push off
  forgets it.
- **Replaced by the browser.** `sw.js` handles `pushsubscriptionchange`. It
  subscribes again with the old subscription's key. Firefox for Android and
  Firefox before 137 don't say which subscription they dropped, so there it
  uses the kept key. Then it asks any open tab to hand the new subscription
  to the Worker. A failed resync shows the bell again only when the browser
  really has no subscription left. Being offline doesn't count.
- **Raster icons.** Notifications use `icon-192.png`, plus `badge-96.png`, a
  white-on-transparent mark that is the only badge format Android draws.
  Chrome does not reliably draw SVG notification icons.
- **One notification per conversation, still heard.** Message pushes carry the
  tag `<orgId>|<view>`, so a new message in the same conversation replaces the
  last one, with `renotify` so it still makes a sound. A card's tag is its id.
- **In-tab notifications.** A direct message, an @mention (a person's message
  or an agent's answer, as the Worker would push) or a new decision is shown
  at once through the service worker (`utils/notifications.ts`). This happens
  only while nobody is looking at that workspace: tabs say whether they are
  in front on a `BroadcastChannel`. One tab per workspace shows them, the one
  holding the Web Lock `honmaru-notify:<orgId>`, so a tab on another
  workspace never silences it. Quiet hours and muted conversations apply as
  they do for sounds. The mute levels in effect are the last ones the server
  sent, never an empty map.
- **The push that follows.** The Worker's push for the same message arrives
  about a minute later with the same tag and the message's server time
  (`at`). `sw.js` replaces an in-tab notification of the same message
  without a second sound. It never rolls a conversation back: if a later
  message is already on screen, that one is shown again, quietly.
- **Counts.** The tab title (`(3) Honmaru AI`), the tab's icon (a red count)
  and an installed app's icon (`navigator.setAppBadge`) show decisions
  waiting plus mentions that arrived while away. The mentions clear when the
  tab is looked at again.
- **Taken down when read, or unsent.** Opening a conversation closes its
  notifications in this browser. So does unsending a message, since a message
  taken back must not stay on the lock screen. A card that stops waiting on
  you (decided anywhere) closes its notification too.
- **Clicks go to the right place.** A click focuses the app window that is in
  front or visible (never `privacy.html`) and opens the message in its own
  workspace (`#/m/<id>/<orgId>`). With no window open, it opens a new one on
  that address.
- **Spoilers stay hidden.** In message pushes (`pushPreview` in
  `worker/src/pushes.js`) and in-tab notifications, a `||spoiler||` within a
  line becomes `▇▇▇`. If a translation lost the marks, the push uses the words
  as written, masked (`pushWords`).

## Email — setup

**Resend.** One API key: no domain, no DNS records, and a free tier that is a
free tier rather than a trial — the right shape for a channel that is a
fallback and a sign-in code rather than the product.

```bash
npx wrangler secret put RESEND_API_KEY     # https://resend.com/api-keys
npx wrangler secret put NOTIFY_EMAIL_FROM  # optional; without it, Resend's shared sender
```

Without a From line, mail goes out as Resend's shared sender
(`onboarding@resend.dev`), which needs nothing set up and delivers **only to
the address that owns the Resend account**. That is a real limit and the
difference between working in two minutes and working after a DNS change;
verify a domain at Resend and set `NOTIFY_EMAIL_FROM` when you want to reach
anyone else.

Or run `./worker/scripts/setup-email.sh`, which asks for the key, deploys —
the endpoints and the `login_codes` table only exist in a deployed build — and
then sends a real code, so a wrong key is found there rather than by whoever
was waiting for one.

A refusal carries what Resend said, in `npx -y wrangler@4 tail --format
pretty`. The usual causes — wrong key, unverified From domain, a recipient the
shared sender may not reach — are indistinguishable from outside, and every one
of them is a sentence in the response body.

The same key carries the **sign-in code** (`POST /auth/otp/request`), which is
the only way in for someone without GitHub — see [screens.md](screens.md).

> Mail arriving *inbound* (messages becoming decisions,
> `worker/src/connectors/email.js`) is a separate feature on Mailgun's webhook,
> with its own secrets (`MAILGUN_WEBHOOK_SIGNING_KEY`, `INBOUND_EMAIL_DOMAIN`)
> and no bearing on sending.

Email accounts sign in with their address. A GitHub account adds one under
⋯ → **Email** in the web client (`PUT /me {email}`), and either can switch
the channel off there (`PUT /me {notifyEmail: false}`).

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/me` | login, locale, whether email is on, the supported locales |
| PUT | `/me` | `{ locale?, email?, notifyEmail? }` — a BCP 47 tag is reduced to its language; `email` only for accounts that do not sign in with one |
| GET | `/push/vapid` | the public key a browser subscribes with (503 when unconfigured) |
| POST | `/push/subscriptions` | a `PushSubscription.toJSON()` body, bound to the session |
| DELETE | `/push/subscriptions` | `{ endpoint }` |

## Tests

```
worker/test/notify.test.js     who is told, in what language, on what; email as the floor
worker/test/webpush.test.js    VAPID JWT verified with the public half; encrypt → decrypt with the subscriber's key
worker/test/localize.test.js   language detection; the translation call, its cost, and its absence
worker/test/me.test.js         the locale sticks; Accept-Language seeds a new account
worker/test/push.test.js       the APNs channel, unchanged
```

The Web Push test does what a browser does: generates its own ECDH pair and
auth secret, subscribes, then decrypts what the Worker sent and checks it is
the message — rather than trusting that the derivation is right because it
did not throw.

## Debugging

| Symptom | Cause |
|---------|-------|
| `/health` says `webPush: false` | one of `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` is missing |
| The bell only shows a hint on an iPhone | the site is open in Safari, not from the home screen |
| The bell says notifications are blocked | the browser's site permission is "Block"; only the browser settings can undo that |
| A push arrives in the wrong language | check `GET /me` — the app toggle and the browser both write it; the last one wins |
| A subscription stops delivering after a while | the push service answered 404/410 and the row was deleted; the client hands its subscription over again on the next visit (`resyncWebPush`) |
| Firefox shows a crossed-out bell in the address bar and no prompt | the prompt was not tied to a click; `enableWebPush` must reach `requestPermission()` before any `await` |
| Pushes stopped after the VAPID keys were rotated | the push service refuses sends signed with the new key for subscriptions made with the old one; the client compares `subscription.options.applicationServerKey` and resubscribes on the next visit |
| Email arrives alongside a push | the push failed (not "was not registered"): APNs or the push service answered with an error |
| No email at all | `RESEND_API_KEY` unset, the person has no `email`, or `notifyEmail` is off |
