import { describe, expect, it } from 'vitest'
import { mediaKind } from './media'

// What a file in a message is drawn as.
describe('mediaKind', () => {
  it('shows the pictures a browser can draw, and no others', () => {
    for (const t of ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']) expect(mediaKind(t, 'a')).toBe('image')
    expect(mediaKind('image/heic', 'IMG_1.heic')).toBe('file')
    expect(mediaKind('image/svg+xml', 'logo.svg')).toBe('file')
  })
  it('plays the videos the Worker serves to be shown', () => {
    expect(mediaKind('video/mp4', 'clip.mp4')).toBe('video')
    expect(mediaKind('video/webm', 'screen.webm')).toBe('video')
    expect(mediaKind('video/quicktime', 'IMG_2.MOV')).toBe('video')
    expect(mediaKind('video/x-matroska', 'film.mkv')).toBe('file')
    expect(mediaKind('video/ogg', 'old.ogv')).toBe('file')
  })
  it('plays sound, under every name browsers give it', () => {
    for (const t of ['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/x-m4a', 'audio/aac', 'audio/flac', 'audio/x-wav']) {
      expect(mediaKind(t, 'memo')).toBe('audio')
    }
    expect(mediaKind('audio/midi', 'song.mid')).toBe('file')
  })
  it('reads a type with parameters or capitals as the type it is', () => {
    expect(mediaKind('audio/webm;codecs=opus', 'voice.webm')).toBe('audio')
    expect(mediaKind('Video/MP4', 'clip.mp4')).toBe('video')
    expect(mediaKind(' image/png ', 'a.png')).toBe('image')
  })
  it('takes a video container named as sound for sound', () => {
    expect(mediaKind('video/mp4', 'Voice Memo.m4a')).toBe('audio')
    expect(mediaKind('video/webm', 'note.WEBA')).toBe('audio')
    expect(mediaKind('video/mp4', 'mp3.mp4')).toBe('video')
  })
  it('never plays what the Worker sends as a download, whatever its name', () => {
    expect(mediaKind('application/octet-stream', 'clip.mp4')).toBe('file')
    expect(mediaKind('', 'song.mp3')).toBe('file')
    expect(mediaKind('text/html', 'page.mp4')).toBe('file')
    expect(mediaKind('application/pdf')).toBe('file')
  })
})
