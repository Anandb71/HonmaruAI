import { describe, it, expect } from 'vitest'
import { isMacPlatform, formatCombo } from './keys'

// ⌘ on a Mac, Ctrl everywhere else: what the shortcuts sheet, the search
// button and the workspace menu print.
describe('which keyboard this is', () => {
  it('knows a Mac, an iPad and an iPhone by what the browser says', () => {
    expect(isMacPlatform({ platform: 'MacIntel' })).toBe(true)
    expect(isMacPlatform({ platform: 'iPad' })).toBe(true)
    expect(isMacPlatform({ platform: 'iPhone' })).toBe(true)
    expect(isMacPlatform({ userAgentData: { platform: 'macOS' }, platform: '' })).toBe(true)
    // No platform at all: the user agent still names the machine.
    expect(isMacPlatform({ platform: '', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)' })).toBe(true)
  })
  it('is not a Mac on Windows, Linux, Android or with nothing to go on', () => {
    expect(isMacPlatform({ platform: 'Win32' })).toBe(false)
    expect(isMacPlatform({ userAgentData: { platform: 'Windows' }, platform: 'Win32' })).toBe(false)
    expect(isMacPlatform({ platform: 'Linux x86_64' })).toBe(false)
    expect(isMacPlatform({ platform: 'Linux armv8l', userAgent: 'Mozilla/5.0 (Linux; Android 14)' })).toBe(false)
    expect(isMacPlatform({})).toBe(false)
    expect(isMacPlatform(null)).toBe(false)
  })
  it('reads the newer platform before the old one', () => {
    expect(isMacPlatform({ userAgentData: { platform: 'Windows' }, platform: 'MacIntel' })).toBe(false)
  })
})

describe('a combo as the keyboard prints it', () => {
  it('writes glyphs together on a Mac', () => {
    expect(formatCombo('Mod+Shift+A', true)).toBe('⌘⇧A')
    expect(formatCombo('Mod+K', true)).toBe('⌘K')
    expect(formatCombo('Shift+Esc', true)).toBe('⇧Esc')
    expect(formatCombo('Alt+Shift+Down', true)).toBe('⌥⇧↓')
    expect(formatCombo('Ctrl+Alt+Left', true)).toBe('⌃⌥←')
  })
  it('writes words joined with + everywhere else', () => {
    expect(formatCombo('Mod+Shift+A', false)).toBe('Ctrl+Shift+A')
    expect(formatCombo('Mod+/', false)).toBe('Ctrl+/')
    expect(formatCombo('Shift+Esc', false)).toBe('Shift+Esc')
    expect(formatCombo('Alt+Up', false)).toBe('Alt+↑')
  })
  it('keeps alternatives apart and leaves keys it has no name for alone', () => {
    expect(formatCombo('Alt+Up / Alt+Down', true)).toBe('⌥↑ / ⌥↓')
    expect(formatCombo('Alt+Up / Alt+Down', false)).toBe('Alt+↑ / Alt+↓')
    expect(formatCombo('Mod+1–9', true)).toBe('⌘1–9')
    expect(formatCombo('Mod+1–9', false)).toBe('Ctrl+1–9')
    expect(formatCombo('N', false)).toBe('N')
    expect(formatCombo('J / K', true)).toBe('J / K')
    expect(formatCombo('Enter', true)).toBe('Enter')
    // A key named like something on Object's prototype is still just a key.
    expect(formatCombo('Mod+constructor', false)).toBe('Ctrl+constructor')
  })
})
