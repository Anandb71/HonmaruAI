// Metro finds packages/core and packages/protocol through the npm workspace
// at the repository root (expo/metro-config configures monorepos itself).
const { getDefaultConfig } = require('expo/metro-config')

module.exports = getDefaultConfig(__dirname)
