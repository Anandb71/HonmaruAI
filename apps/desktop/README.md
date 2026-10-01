# Honmaru AI — desktop

The web app (`web-react/`, deployed at https://app.honmaruai.com) in its own
window on Windows, macOS and Linux. It adds what a browser tab can't do:

| | |
|---|---|
| **Stays running** | Closing the window hides it to the tray (Windows, Linux) or the dock (macOS), as Discord does, so notifications keep arriving. Quit from the tray or the menu (Ctrl+Q). |
| **Unread count** | The count in the page title (`(3) Honmaru AI`) appears as a red dot on the Windows taskbar, as the dock or launcher badge on macOS and Linux, and in the tray tooltip. When it goes up while the window is in the background, the taskbar flashes or the dock bounces once. |
| **Notifications** | Native, through the web app's own notifications. Windows needs the app identity `com.honmaru.ai`, which is set. |
| **`honmaru://` links** | `honmaru://c/<channel>?org=<orgId>` opens a conversation and `honmaru://join/<code>` an invitation. These are the same paths as the web links (`packages/core/src/links.ts`). A second launch hands its link to the running app. |
| **Remembers its place** | Size, position and maximized state. If that screen is gone, the window opens on the main one. |
| **Always current** | It loads the deployed web app, so a web deploy updates it. Only the shell itself needs an installer. |

## Run it

```bash
cd apps/desktop
npm install
npm start                 # against https://app.honmaruai.com
npm run dev               # against the web dev server on http://localhost:3000
npm test                  # the rules: links, navigation, the count, window placement
npm run dist              # installers in dist/ (unsigned for now)
```

While developing (`npm start`, `npm run dev`), `HONMARU_APP_URL` or
`--app-url=<url>` points it at another web build, and `HONMARU_API_ORIGINS`
(comma-separated) adds that build's API. Each must be https; plain http is
accepted only for `localhost`. An installed app ignores all three: it always
loads https://app.honmaruai.com and its API, so nothing on the command line or
in the environment can point a signed app at another site.

## Security

Following the baseline in `docs/architecture/discord-model-platform-plan.md` §11.4:

- `contextIsolation`, `sandbox` and no `nodeIntegration`. The preload exposes
  only `window.honmaruDesktop = { isDesktop, platform, show() }`.
- A strict Content-Security-Policy on the app's pages, added by the shell to
  every response from the app's origin (`src/csp.js`): scripts only from the
  app itself plus the one inline theme script in `web-react/index.html`,
  allowed by its sha256 hash (change that script and `test/csp.test.js`
  fails until the hash in `src/csp.js` is updated); connections only to the
  app, the API and its wss relay; images also from any https site (avatars,
  link previews); frames only YouTube's player; no plugins, and no framing
  by other sites. It is sent beside any policy the server sends, so it can
  only narrow what the page may do. The dev policy adds what Vite's hot
  reload needs, and only when pointed at a local http server.
- Permissions (notifications, microphone and camera for Jam, full screen,
  clipboard write) are granted only to the app's own origin.
- The window stays on the app, its API and GitHub. A sign-in that the API
  sends elsewhere (a company's identity provider) may load https pages for
  up to 10 minutes and ends as soon as the window is back on the app. Every
  other link opens in the default browser, and only `http(s)` and `mailto`
  links are handed to the system. `<webview>` is refused.
- A page that opens a blank window to point it at a tool's sign-in (Tools,
  Smithery apps) gets a hidden window whose first navigation goes to the
  browser.

The rules live in pure modules (`src/links.js`, `src/config.js`,
`src/badge.js`, `src/windowState.js`) with tests. `src/main.js` only wires
them to Electron.

## Not yet

- Code signing and notarization (Apple Developer ID, Azure Trusted Signing)
  and auto-update (`electron-updater`) need the certificates and a release
  feed.
- The web app does not yet know it is running in the desktop app. Once it
  reads `window.honmaruDesktop`, it will hide the Web Push bell (there is no
  push service inside Electron, and the tray keeps the socket open instead)
  and use `honmaruDesktop.show()` when a notification is clicked.
