import { describe, it, expect } from 'vitest'
import { draftToClear, withoutDraft } from './drafts'

describe('the draft a send clears', () => {
  it('is the box while the conversation it was sent from is still open', () => {
    expect(draftToClear('b:front-desk', 'b:front-desk')).toBe('box')
  })

  it('sent in #a, then on to #b before it went: only what #a kept goes, never the box holding #b’s words', () => {
    expect(draftToClear('b:a', 'b:b')).toBe('kept')
    expect(draftToClear('b:a', undefined)).toBe('kept')
    const kept = { 'b:a': true, 'b:b': true }
    expect(withoutDraft(kept, 'b:a')).toEqual({ 'b:b': true })
    // #b's own flag, and the map #b is drawn from, are left as they were.
    expect(kept).toEqual({ 'b:a': true, 'b:b': true })
  })

  it('changes nothing when that conversation kept no draft', () => {
    const kept = { 'b:b': true }
    expect(withoutDraft(kept, 'b:a')).toBe(kept)
  })
})
