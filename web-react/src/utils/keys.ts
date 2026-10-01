// Keys typed through an input method — Japanese, Chinese, Korean. The Enter
// that confirms a conversion is not the Enter that sends: a message must not
// go out half-converted. Chrome and Edge (the browsers of most Windows
// offices) mark that keydown `isComposing`; Safari ends the composition first
// and only leaves keyCode 229 behind. Both are taken as "still composing".

interface KeyLike {
  key?: string
  keyCode?: number
  isComposing?: boolean
  nativeEvent?: { isComposing?: boolean; keyCode?: number }
}

export function composing(e: KeyLike): boolean {
  return Boolean(e.isComposing || e.nativeEvent?.isComposing || e.keyCode === 229 || e.nativeEvent?.keyCode === 229)
}

/// An Enter the person meant: not one that picked a conversion.
export const enterKey = (e: KeyLike): boolean => e.key === 'Enter' && !composing(e)
