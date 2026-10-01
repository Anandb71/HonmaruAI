import React from 'react'
import { Icon } from './Icon'
import { useT } from '../utils/i18n'
import type { t as Translate } from '../utils/i18n'
import { focusAfterJump } from '../utils/chatScroll'

/// "Jump to present", held at the foot of a conversation while the reader is
/// further up it, with how many new messages wait below. Its own component
/// so what it draws can be tested without the whole list around it.

/// How many new messages wait below, in words: the pill's count and what a
/// screen reader is told of it say the same.
export function newBelowLabel(n: number, t: typeof Translate): string {
  return n === 1 ? t('1 new message') : t('{n} new messages', { n })
}

/// `onJump` is told whether to hand the focus on to the composer.
export const JumpToPresent: React.FC<{ count: number; onJump: (handOn: boolean) => void }> = ({ count, onJump }) => {
  const t = useT()
  return (
    <div className="slk-present">
      <button type="button" aria-keyshortcuts="Shift+PageDown" onClick={(e) => onJump(focusAfterJump({
        held: document.activeElement === e.currentTarget,
        detail: e.detail,
        pointerType: (e.nativeEvent as Partial<PointerEvent>).pointerType,
      }))}>
        {count > 0 && <b>{newBelowLabel(count, t)}</b>}
        <span>{t('Jump to present')}</span>
        <Icon name="chevron-down" size={14} />
      </button>
    </div>
  )
}
