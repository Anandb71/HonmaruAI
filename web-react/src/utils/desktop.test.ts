import { describe, it, expect, vi } from 'vitest'
import { desktopApp } from './desktop'

describe('the desktop app', () => {
  it('is known by its bridge', () => {
    const show = vi.fn()
    const bridge = desktopApp({ honmaruDesktop: { isDesktop: true, platform: 'darwin', show } })
    expect(bridge?.platform).toBe('darwin')
    bridge?.show()
    expect(show).toHaveBeenCalled()
  })
  it('is not a browser, nor a page that only claims to be it', () => {
    expect(desktopApp({})).toBeNull()
    expect(desktopApp(undefined)).toBeNull()
    expect(desktopApp({ honmaruDesktop: { isDesktop: 'yes', show: () => {} } })).toBeNull()
    expect(desktopApp({ honmaruDesktop: { isDesktop: true } })).toBeNull()
  })
})
