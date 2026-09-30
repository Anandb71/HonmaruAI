import { describe, it, expect, vi } from 'vitest'
import type { ChannelMessage } from '../types/card'
import { arrive, echoOf, isTemp, keepTemps, markFailed, markPending, reconcile, refusedOutright, sendDeadline, sendTime, tempMessage, tempState } from './pendingSend'

const you = { name: 'Aiko', ref: 'm-aiko', avatar: null }
const at = new Date('2026-09-30T09:00:00.000Z')
const said = (id: string, body: string, extra: Partial<ChannelMessage> = {}): ChannelMessage => ({
  id, channel: 'b:hotel', kind: 'message', body, authorName: 'Aiko', authorRef: 'm-aiko',
  mine: true, cardId: null, createdAt: '2026-09-30T09:00:01.000Z', ...extra,
})
const ids = (list: ChannelMessage[]) => list.map((m) => m.id)

describe('a message on its way', () => {
  it('is yours, now, under a temporary id, and marked as on its way', () => {
    const m = tempMessage({ channel: 'b:hotel', body: 'Rooms are ready' }, you, at, () => 'abc')
    expect(m.id.startsWith('tmp-')).toBe(true)
    expect(m.id.endsWith('-abc')).toBe(true)
    expect(isTemp(m)).toBe(true)
    expect(m).toMatchObject({ channel: 'b:hotel', kind: 'message', body: 'Rooms are ready', mine: true, pending: true, authorName: 'Aiko', authorRef: 'm-aiko', createdAt: at.toISOString(), parentId: null, cardId: null })
    expect(m.files).toBeUndefined()
    expect(tempState(m)).toBe('pending')
  })

  it('carries its thread and its files', () => {
    const file = { id: 'f1', name: 'plan.pdf', type: 'application/pdf', size: 10, url: '/files/f1' }
    const m = tempMessage({ channel: 'b:hotel', body: '', parentId: 'p1', files: [file] }, you, at)
    expect(m.parentId).toBe('p1')
    expect(m.files).toEqual([file])
  })

  it('never takes the id of another sent in the same millisecond', () => {
    const a = tempMessage({ channel: 'b:hotel', body: 'one' }, you, at)
    const b = tempMessage({ channel: 'b:hotel', body: 'two' }, you, at)
    expect(a.id).not.toBe(b.id)
  })

  it('is drawn now, or after the newest message held when this clock is behind the server’s', () => {
    const now = new Date('2026-09-30T09:00:00.000Z')
    expect(sendTime([said('a', 'earlier', { createdAt: '2026-09-30T08:59:00.000Z' })], now)).toEqual(now)
    expect(sendTime(undefined, now)).toEqual(now)
    const ahead = [said('a', 'x', { createdAt: '2026-09-30T09:02:00.000Z' }), said('b', 'y', { createdAt: '2026-09-30T09:01:00.000Z' })]
    expect(sendTime(ahead, now).toISOString()).toBe('2026-09-30T09:02:00.001Z')
  })

  it('a message from the server is never taken for one of ours', () => {
    expect(isTemp(said('0f9c-uuid', 'hi'))).toBe(false)
    expect(tempState(said('0f9c-uuid', 'hi'))).toBeUndefined()
  })
})

describe('the answer to the send', () => {
  it('puts the server’s copy where ours was', () => {
    const temp = tempMessage({ channel: 'b:hotel', body: 'second' }, you, at, () => 't')
    const list = [said('a', 'first'), temp, said('b', 'from Ken', { mine: false })]
    const out = reconcile(list, temp.id, said('real-2', 'second'))
    expect(ids(out)).toEqual(['a', 'real-2', 'b'])
    expect(out[1].pending).toBeUndefined()
  })

  it('when the socket brought the server’s copy first, ours just goes — once, and the copy shown stays', () => {
    const temp = tempMessage({ channel: 'b:hotel', body: 'second' }, you, at, () => 't')
    const fromSocket = said('real-2', 'second', { reactions: [{ emoji: '👍', count: 1, refs: ['m-ken'], mine: false }] })
    const list = [said('a', 'first'), temp, fromSocket]
    const out = reconcile(list, temp.id, said('real-2', 'second'))
    expect(ids(out)).toEqual(['a', 'real-2'])
    expect(out[1]).toBe(fromSocket)
  })

  it('shows the server’s copy even when ours is no longer held', () => {
    const out = reconcile([said('a', 'first')], 'tmp-gone', said('real-2', 'second'))
    expect(ids(out)).toEqual(['a', 'real-2'])
  })

  it('changes nothing when the socket already put the server’s copy in ours’ place', () => {
    const list = [said('a', 'first'), said('real-2', 'second')]
    expect(reconcile(list, 'tmp-x', said('real-2', 'second'))).toBe(list)
  })
})

describe('a message that did not go', () => {
  it('stays where it was, with why, and goes again on Retry', () => {
    const temp = tempMessage({ channel: 'b:hotel', body: 'second' }, you, at, () => 't')
    const list = [said('a', 'first'), temp]
    const failed = markFailed(list, temp.id, 'That did not send. Try again.')
    expect(ids(failed)).toEqual(['a', temp.id])
    expect(failed[1]).toMatchObject({ body: 'second', pending: false, failed: 'That did not send. Try again.' })
    expect(tempState(failed[1])).toBe('failed')
    expect(failed[0]).toBe(list[0])
    const again = markPending(failed, temp.id)
    expect(again[1]).toMatchObject({ pending: true, failed: undefined })
    expect(tempState(again[1])).toBe('pending')
  })

  it('refused outright, is marked so — to be edited, not sent again as it is', () => {
    const temp = tempMessage({ channel: 'b:hotel', body: 'card 4242 4242 4242 4242' }, you, at, () => 't')
    const refused = markFailed([temp], temp.id, 'This can’t be sent here', true)
    expect(refused[0]).toMatchObject({ pending: false, failed: 'This can’t be sent here', refused: true })
    expect(tempState(refused[0])).toBe('failed')
    expect(markFailed([temp], temp.id, 'Timed out')[0].refused).toBeUndefined()
    expect(markPending(refused, temp.id)[0].refused).toBeUndefined()
  })

  it('is given up on when no answer comes in time, so what was sent after it can go', () => {
    vi.useFakeTimers()
    try {
      const ctrl = new AbortController()
      sendDeadline(ctrl, 25_000)
      vi.advanceTimersByTime(24_500)
      expect(ctrl.signal.aborted).toBe(false)
      vi.advanceTimersByTime(500)
      expect(ctrl.signal.aborted).toBe(true)

      // Answered in time: the clock stops, and nothing is aborted later.
      const answered = new AbortController()
      const stop = sendDeadline(answered, 25_000)
      vi.advanceTimersByTime(10_000)
      stop()
      vi.advanceTimersByTime(60_000)
      expect(answered.signal.aborted).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('is not given up on while the person is being asked, and has its full time after they answer', () => {
    vi.useFakeTimers()
    try {
      const ctrl = new AbortController()
      let asking = false
      sendDeadline(ctrl, 25_000, () => asking)
      vi.advanceTimersByTime(20_000)
      asking = true
      vi.advanceTimersByTime(120_000)
      expect(ctrl.signal.aborted).toBe(false)
      asking = false
      vi.advanceTimersByTime(24_500)
      expect(ctrl.signal.aborted).toBe(false)
      vi.advanceTimersByTime(500)
      expect(ctrl.signal.aborted).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('is refused outright when the server read it and said no, not when it could not answer', () => {
    // A data rule blocked it, or warned and "send it anyway" was declined;
    // the thread has gone; no right to post there.
    for (const status of [400, 401, 403, 404, 409, 413, 422]) expect(refusedOutright(status)).toBe(true)
    // Too slow, too many, or the server fell over: worth sending again.
    for (const status of [408, 429, 500, 502, 503, 504]) expect(refusedOutright(status)).toBe(false)
    expect(refusedOutright(201)).toBe(false)
  })
})

describe('the socket’s copy of a message', () => {
  it('changes the copy already held in place', () => {
    const list = [said('a', 'first'), said('b', 'second')]
    const out = arrive(list, said('a', 'first, edited', { editedAt: '2026-09-30T09:01:00.000Z' }))
    expect(ids(out)).toEqual(['a', 'b'])
    expect(out[0].body).toBe('first, edited')
  })

  it('takes the place of our own words still on their way, so they never show twice', () => {
    const temp = tempMessage({ channel: 'b:hotel', body: 'second\n' }, you, at, () => 't')
    const list = [said('a', 'first'), temp, said('k', 'from Ken', { mine: false })]
    const out = arrive(list, said('real-2', 'second'))
    expect(ids(out)).toEqual(['a', 'real-2', 'k'])
    // …and the answer to the send, after it, finds it already there.
    expect(ids(reconcile(out, temp.id, said('real-2', 'second')))).toEqual(['a', 'real-2', 'k'])
  })

  it('takes the place of ours that looked failed but did reach the server', () => {
    const temp = tempMessage({ channel: 'b:hotel', body: 'second' }, you, at, () => 't')
    const out = arrive(markFailed([temp], temp.id, 'Timed out'), said('real-2', 'second'))
    expect(ids(out)).toEqual(['real-2'])
    expect(out[0].failed).toBeUndefined()
  })

  it('is new, at the end, when it is somebody else’s, other words, another thread, or edited since', () => {
    const temp = tempMessage({ channel: 'b:hotel', body: 'ok' }, you, at, () => 't')
    const list = [temp]
    expect(ids(arrive(list, said('k', 'ok', { mine: false })))).toEqual([temp.id, 'k'])
    expect(ids(arrive(list, said('r', 'ok!')))).toEqual([temp.id, 'r'])
    expect(ids(arrive(list, said('r', 'ok', { parentId: 'p1' })))).toEqual([temp.id, 'r'])
    expect(ids(arrive(list, said('r', 'ok', { editedAt: '2026-09-30T09:01:00.000Z' })))).toEqual([temp.id, 'r'])
  })

  it('names the copy of ours it stands for, and only that one', () => {
    const one = tempMessage({ channel: 'b:hotel', body: 'one' }, you, at, () => 'a')
    const two = tempMessage({ channel: 'b:hotel', body: 'two' }, you, at, () => 'b')
    const list = [said('x', 'two'), one, two]
    expect(echoOf(list, said('real-2', 'two'))).toBe(two)
    expect(echoOf(list, said('x', 'two'))).toBeUndefined() // already held
    expect(echoOf(list, said('k', 'two', { mine: false }))).toBeUndefined()
    expect(echoOf(list, said('real-3', 'three'))).toBeUndefined()
  })

  it('stands for the one on its way, not an earlier one with the same words that failed', () => {
    const failed = markFailed([tempMessage({ channel: 'b:hotel', body: 'ok' }, you, at, () => 'a')], `tmp-${at.getTime().toString(36)}-a`, 'No')[0]
    const again = tempMessage({ channel: 'b:hotel', body: 'ok' }, you, at, () => 'b')
    expect(echoOf([failed, again], said('real', 'ok'))).toBe(again)
    expect(ids(arrive([failed, again], said('real', 'ok')))).toEqual([failed.id, 'real'])
  })

  it('matches a reply to ours in the same thread, files and all', () => {
    const file = { id: 'f1', name: 'plan.pdf', type: 'application/pdf', size: 10, url: '/files/f1' }
    const temp = tempMessage({ channel: 'b:hotel', body: '', parentId: 'p1', files: [file] }, you, at, () => 't')
    expect(ids(arrive([temp], said('r', '', { parentId: 'p1', files: [{ ...file, url: '/files/f1?sig=x' }] })))).toEqual(['r'])
    expect(ids(arrive([temp], said('r', '', { parentId: 'p1' })))).toEqual([temp.id, 'r'])
  })
})

describe('a reload from the server', () => {
  it('keeps what is still held only here, after what the server has', () => {
    const temp = tempMessage({ channel: 'b:hotel', body: 'second' }, you, at, () => 't')
    const failed = markFailed([tempMessage({ channel: 'b:hotel', body: 'third' }, you, at, () => 'u')], `tmp-${at.getTime().toString(36)}-u`, 'No')[0]
    const out = keepTemps([said('a', 'first'), said('b', 'from Ken', { mine: false })], [said('a', 'first'), temp, failed])
    expect(ids(out)).toEqual(['a', 'b', temp.id, failed.id])
    expect(out[3].failed).toBe('No')
  })

  it('is the server’s list as it came when nothing is held here', () => {
    const fresh = [said('a', 'first')]
    expect(keepTemps(fresh, undefined)).toBe(fresh)
    expect(keepTemps(fresh, [said('old', 'gone')])).toBe(fresh)
  })
})
