import { describe, expect, it } from 'vitest'
import { composing, enterKey } from './keys'

describe('keys typed through an input method', () => {
  it('a plain Enter sends', () => {
    expect(enterKey({ key: 'Enter', keyCode: 13, nativeEvent: { isComposing: false } })).toBe(true)
  })
  it('the Enter that confirms a conversion in Chrome or Edge does not', () => {
    expect(enterKey({ key: 'Enter', keyCode: 229, nativeEvent: { isComposing: true } })).toBe(false)
  })
  it('nor does the one Safari leaves behind after the composition ends', () => {
    expect(enterKey({ key: 'Enter', keyCode: 229, nativeEvent: { isComposing: false } })).toBe(false)
  })
  it('reads a DOM event as well as a React one', () => {
    expect(composing({ key: 'Enter', isComposing: true })).toBe(true)
    expect(composing({ key: 'a', keyCode: 65 })).toBe(false)
  })
})
