// app.json is the app's configuration. This adds the one thing that is not
// in the repository: Firebase's google-services.json, which Android needs for
// an FCM token (push, src/lib/push.ts). On EAS it is a file environment
// variable, GOOGLE_SERVICES_JSON, holding the path EAS wrote it to; on a
// laptop it is ./google-services.json, git-ignored. Without either the app
// still builds, and Android simply gets no pushes.

const fs = require('fs')
const path = require('path')

module.exports = ({ config }) => {
  const local = path.join(__dirname, 'google-services.json')
  const file = process.env.GOOGLE_SERVICES_JSON || (fs.existsSync(local) ? './google-services.json' : undefined)
  if (!file) return config
  return { ...config, android: { ...config.android, googleServicesFile: file } }
}
