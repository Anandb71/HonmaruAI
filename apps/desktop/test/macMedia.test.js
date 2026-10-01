import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Jam on a signed Mac build: the hardened runtime refuses the microphone and
// the camera unless the app claims them, and the system's prompt says what
// the usage descriptions say. Lose either and calls go silent, on a build
// only a release would show.
const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
const config = read('../electron-builder.yml')
const entitlements = read('../resources/entitlements.mac.plist')

const claims = (key) => new RegExp(`<key>${key.replace(/\./g, '\\.')}</key>\\s*<true/>`).test(entitlements)

describe('the Mac app under the hardened runtime', () => {
  it('signs with the entitlements file, for itself and its helpers', () => {
    expect(config).toMatch(/^\s+entitlements: resources\/entitlements\.mac\.plist$/m)
    expect(config).toMatch(/^\s+entitlementsInherit: resources\/entitlements\.mac\.plist$/m)
  })
  it('may use the microphone and the camera, and V8 may still run', () => {
    expect(claims('com.apple.security.device.audio-input')).toBe(true)
    expect(claims('com.apple.security.device.camera')).toBe(true)
    expect(claims('com.apple.security.cs.allow-jit')).toBe(true)
  })
  it('says why it asks', () => {
    expect(config).toMatch(/NSMicrophoneUsageDescription: \S.+/)
    expect(config).toMatch(/NSCameraUsageDescription: \S.+/)
  })
})
