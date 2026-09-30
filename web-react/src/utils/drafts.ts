// A draft per conversation, kept in this browser: the box holds the one
// open now, and each conversation left keeps its own under draft:<org>:<view>.
//
// What was sent leaves the draft it was written in — but a send answers
// after you may have moved on, and by then the box holds another
// conversation's words.

/// Where a send from `sentFrom` clears its draft: the box, while that
/// conversation is still the one open; once you have moved on, only what it
/// kept in this browser — never the box, which holds the draft of the
/// conversation open now.
export const draftToClear = (sentFrom: string, open: string | undefined): 'box' | 'kept' =>
  open === sentFrom ? 'box' : 'kept'

/// The conversations with a draft kept, without `view`'s: the same map when
/// it had none, so nothing is drawn again for it.
export function withoutDraft(kept: Record<string, boolean>, view: string): Record<string, boolean> {
  if (!kept[view]) return kept
  const next = { ...kept }
  delete next[view]
  return next
}
