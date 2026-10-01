// Updates to the shell itself (the web app inside updates with every web
// deploy and needs none of this). electron-updater reads the feed that
// `npm run release` publishes to the repository's GitHub releases
// (electron-builder.yml `publish`), downloads a newer version in the
// background, checks it against the release's sha512 — and, on Windows and
// macOS, its code signature against the running app's — and installs it on
// the next quit, or at once if the person chooses to restart.
//
// Only an installed app built by the signed release scripts gets here
// (config.js updatesEnabled).

import { dialog } from 'electron'

/// How often a long-running app looks again.
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000

/// Starts checking. `beforeRestart` lets the window close instead of hiding
/// when the person chooses to restart into the new version.
export async function startUpdates({ appName, getWindow, beforeRestart }) {
  const { default: updater } = await import('electron-updater')
  const { autoUpdater } = updater
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  // A failed check (offline, GitHub down) is retried at the next interval;
  // it is not worth a dialog.
  autoUpdater.on('error', (error) => console.warn('Update check failed:', error?.message || error))

  let asked = false
  autoUpdater.on('update-downloaded', (info) => {
    if (asked) return
    asked = true
    const win = getWindow()
    const options = {
      type: 'info',
      title: appName,
      message: info?.version ? `${appName} ${info.version} is ready` : `A new version of ${appName} is ready`,
      detail: 'Restart now to use it, or it installs the next time you quit.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    }
    void (win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options)).then(({ response }) => {
      if (response !== 0) return
      beforeRestart()
      autoUpdater.quitAndInstall()
    })
  })

  const check = () => { autoUpdater.checkForUpdates().catch(() => { /* reported by 'error' */ }) }
  check()
  setInterval(check, CHECK_EVERY_MS).unref?.()
}
