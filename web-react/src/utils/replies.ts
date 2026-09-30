import type { ChannelMessage, ReplyQuote } from '../types/card'

// Discord's inline reply, in the browser: the quote a reply shows of the
// message it answers. The Worker writes that quote whenever it hands a
// message out (channels.js quoteOf); this writes the same one here, for the
// "Replying to" bar over the composer and for a quote whose original is
// edited or unsent while the reply is on screen.

/// What a spoiler hides in a quote — the Worker's SPOILER_MASK.
export const SPOILER_MASK = '████'
const QUOTE_CHARS = 120

/// A message's first words, as a reply quotes them — the Worker's
/// replyExcerpt, character for character: one line, each ||spoiler||
/// hidden before anything is cut, bars inside `code` left as code, a file
/// named when there are no words.
export function replyExcerpt(body: string | null | undefined, fileName: string | null = null, max = QUOTE_CHARS): string {
  const flat = String(body || '').replace(/\u0000/g, '').replace(/\s+/g, ' ').trim()
  const code: string[] = []
  const held = flat.replace(/```[\s\S]*?```|`[^`]*`/g, (c) => `\u0000${code.push(c) - 1}\u0000`)
  const text = held.replace(/\|\|[\s\S]+?\|\|/g, SPOILER_MASK).replace(/\u0000(\d+)\u0000/g, (_, i) => code[Number(i)])
    || (fileName ? `📎 ${fileName}` : '')
  const chars = Array.from(text)
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : text
}

/// The quote of a message on screen, as a reply to it carries it.
export function quoteOf(m: ChannelMessage): ReplyQuote {
  if (m.deleted) return { id: m.id, kind: null, authorName: null, authorRef: null, excerpt: '', deleted: true }
  return {
    id: m.id,
    kind: m.kind,
    authorName: m.kind === 'ai' ? null : m.authorName,
    authorRef: m.authorRef,
    excerpt: replyExcerpt(m.body, m.files?.[0]?.name || null),
    deleted: false,
  }
}

/// A message changed — edited, or unsent — and every reply in `list` that
/// quotes it quotes it as it is now. The same list back when none does, so
/// nothing redraws for it.
export function refreshQuotes(list: ChannelMessage[], changed: ChannelMessage): ChannelMessage[] {
  if (!list.some((x) => x.replyTo?.id === changed.id)) return list
  const quote = quoteOf(changed)
  return list.map((x) => (x.replyTo?.id === changed.id ? { ...x, replyTo: quote } : x))
}

/// An excerpt in pieces to draw: its words, and null where a spoiler was
/// hidden — drawn as a bar a screen reader can name.
export function excerptParts(excerpt: string): Array<string | null> {
  const out: Array<string | null> = []
  excerpt.split(SPOILER_MASK).forEach((part, i) => {
    if (i > 0) out.push(null)
    if (part) out.push(part)
  })
  return out
}
