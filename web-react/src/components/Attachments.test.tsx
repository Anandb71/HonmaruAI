import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MessageFiles } from './Attachments'
import type { FileRef } from '../types/card'

const BASE = 'https://api.example'
const file = (id: string, name: string, type: string, extra: Partial<FileRef> = {}): FileRef =>
  ({ id, name, type, size: 2048, url: `/files/${id}?e=1&s=abc`, ...extra })
const html = (files: FileRef[]) => renderToStaticMarkup(<MessageFiles files={files} base={BASE} />)

// A message's files, as they are drawn before anyone touches them.
describe('MessageFiles', () => {
  it('plays a video where it is, at the shape it was measured at', () => {
    const out = html([file('f_v', 'clip.mp4', 'video/mp4', { width: 1080, height: 1920 })])
    expect(out).toContain(`<video src="${BASE}/files/f_v?e=1&amp;s=abc" controls="" preload="metadata" playsinline="" aria-label="clip.mp4" style="aspect-ratio:0.5625"></video>`)
    expect(out).toMatch(/<figure class="att-media video" style="width:min\(100%, 203px\)"/)
    expect(out).not.toContain('att-pic')
  })

  it('draws a video nobody measured widescreen', () => {
    const out = html([file('f_v', 'screen.webm', 'video/webm')])
    expect(out).toContain('style="aspect-ratio:1.7777777777777777"')
    expect(out).toContain('style="width:min(100%, 400px)"')
  })

  it('plays a song with nothing loaded until it is played', () => {
    const out = html([file('f_a', 'memo.m4a', 'audio/x-m4a')])
    expect(out).toContain(`<audio src="${BASE}/files/f_a?e=1&amp;s=abc" controls="" preload="none" aria-label="memo.m4a"></audio>`)
    expect(out).toContain('class="att-media audio"')
    expect(out).not.toContain('<video')
  })

  it('names each player and gives a way to save it, labelled', () => {
    const out = html([file('f_v', 'clip.mp4', 'video/mp4')])
    expect(out).toContain('<figcaption class="att-media-about">')
    expect(out).toContain('<span class="att-media-name">clip.mp4</span><small>2 KB</small>')
    expect(out).toContain(`href="${BASE}/files/f_v?e=1&amp;s=abc&amp;download=1"`)
    expect(out).toContain('aria-label="Download clip.mp4"')
    expect(out).toContain('title="Download"')
  })

  it('keeps pictures in their grid and every other file a card, in the order sent', () => {
    const out = html([
      file('f_d', 'notes.pdf', 'application/pdf'),
      file('f_p', 'photo.png', 'image/png', { width: 640, height: 480 }),
      file('f_s', 'song.mp3', 'audio/mpeg'),
      file('f_v', 'clip.mov', 'video/quicktime'),
    ])
    expect(out).toContain('class="att-pics n1"')
    expect(out).toContain('aria-label="Open photo.png"')
    expect(out).toContain(`<a class="att-file" href="${BASE}/files/f_d?e=1&amp;s=abc" target="_blank" rel="noopener noreferrer" data-file="notes.pdf">`)
    const at = (s: string) => out.indexOf(s)
    expect(at('data-file="notes.pdf"')).toBeLessThan(at('data-file="song.mp3"'))
    expect(at('data-file="song.mp3"')).toBeLessThan(at('data-file="clip.mov"'))
  })

  it('never puts a player on what is served as a download', () => {
    const out = html([file('f_x', 'clip.mp4', 'application/octet-stream'), file('f_k', 'film.mkv', 'video/x-matroska')])
    expect(out).not.toContain('<video')
    expect(out).not.toContain('<audio')
    expect(out.match(/class="att-file"/g)).toHaveLength(2)
  })

  it('draws nothing for a message with no files', () => {
    expect(html([])).toBe('')
  })
})
