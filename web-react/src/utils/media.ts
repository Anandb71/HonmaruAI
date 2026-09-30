// What a file in a message is shown as: a picture, a video or a song played
// where it is, or a card that downloads.
//
// The types are the ones the Worker serves to be shown (SHOWN in
// worker/src/files.js). Anything else comes back as bytes to save, which a
// player could not be trusted to play in every browser, so it stays a card.

export type MediaKind = 'image' | 'video' | 'audio' | 'file'

const PICTURE = /^image\/(png|jpeg|gif|webp|avif)$/
const VIDEO = /^video\/(mp4|webm|quicktime)$/
const AUDIO = /^audio\/(mpeg|mp4|ogg|wav|webm|x-m4a|aac|flac|x-wav)$/
/// A name that says sound, though its type says a video's container.
const SOUND = /\.(m4a|weba|mp3|aac|flac|wav|oga|opus)$/i

/// What a file is shown as, from its type (its parameters and case aside)
/// and, for a video's container, its name: an .m4a or a .weba typed as
/// video has no picture, and gets a player bar instead of a black box.
export function mediaKind(mime: string, name = ''): MediaKind {
  const type = String(mime || '').split(';')[0].trim().toLowerCase()
  if (PICTURE.test(type)) return 'image'
  if (AUDIO.test(type)) return 'audio'
  if (VIDEO.test(type)) return SOUND.test(name.trim()) ? 'audio' : 'video'
  return 'file'
}
