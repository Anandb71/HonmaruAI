import { describe, expect, it } from 'vitest'
import { mediaKind, videoBox, downloadUrl, firstFrameUrl } from './media'

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

describe('videoBox', () => {
  it('draws a measured video at its own shape, inside 400 by 360', () => {
    expect(videoBox(1920, 1080)).toEqual({ ratio: 16 / 9, width: 400 })
    expect(videoBox(1080, 1920)).toEqual({ ratio: 1080 / 1920, width: 203 })
    expect(videoBox(640, 480)).toEqual({ ratio: 4 / 3, width: 400 })
    expect(videoBox(500, 500)).toEqual({ ratio: 1, width: 360 })
  })
  it('is widescreen when nothing was measured', () => {
    expect(videoBox()).toEqual({ ratio: 16 / 9, width: 400 })
    expect(videoBox(null, null)).toEqual({ ratio: 16 / 9, width: 400 })
    expect(videoBox(1920, 0)).toEqual({ ratio: 16 / 9, width: 400 })
    expect(videoBox(-4, 3)).toEqual({ ratio: 16 / 9, width: 400 })
  })
  it('letterboxes a shape too tall or too wide', () => {
    expect(videoBox(100, 1000)).toEqual({ ratio: 0.5, width: 180 })
    expect(videoBox(4000, 100)).toEqual({ ratio: 2.4, width: 400 })
  })
})

describe('downloadUrl', () => {
  it('asks a signed address to be saved', () => {
    expect(downloadUrl('https://api.example/files/f_1?e=1&s=2')).toBe('https://api.example/files/f_1?e=1&s=2&download=1')
    expect(downloadUrl('/files/f_1')).toBe('/files/f_1?download=1')
  })
})

describe('firstFrameUrl', () => {
  it('asks for a moment just past the start, and leaves the signed address as it is', () => {
    expect(firstFrameUrl('https://api.example/files/f_1?e=1&s=2')).toBe('https://api.example/files/f_1?e=1&s=2#t=0.001')
    expect(new URL(firstFrameUrl('https://api.example/files/f_1?e=1&s=2')).search).toBe('?e=1&s=2')
  })
})
