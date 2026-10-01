import React from 'react'
import { Icon } from './Icon'
import { useT } from '../utils/i18n'

/// One section of the sidebar: a header that folds it, the rows under it,
/// and whatever the header's own button opened. Folded, the header counts
/// what its rows still call for.

interface Props {
  id: string
  label: string
  shut: boolean
  onFold: () => void
  /// What a folded header says of its rows, as sectionBadge() counts it.
  badge: { cards: number; mentions: number; fresh: boolean }
  /// The rows to draw: all of them open, the ones that call for you folded.
  rows: React.ReactNode[]
  /// Said when it is open and holds nothing.
  empty: string
  /// The header's own button: "+", or ✕ on a section of your own.
  action?: React.ReactNode
  /// What that button opened — the new-channel box, the agents to pick
  /// from. Null until asked for.
  below?: React.ReactNode
}

export const SidebarSection: React.FC<Props> = ({ id, label, shut, onFold, badge, rows, empty, action, below }) => {
  const t = useT()
  return (
    <section className={`cl-section${shut ? ' folded' : ''}`} data-section={id}>
      <h2>
        <button className="cl-fold" onClick={onFold} aria-expanded={!shut}>
          <span className="cl-caret" aria-hidden="true"><Icon name={shut ? 'chevron-right' : 'chevron-down'} size={12} /></span>
          {label}
          {shut && badge.mentions > 0 && <><span className="cl-badge mention" aria-hidden="true">@{badge.mentions}</span><span className="sr-only">{t('Mentions: {n}', { n: badge.mentions })}</span></>}
          {shut && badge.cards > 0 && <><span className="cl-badge" aria-hidden="true">{badge.cards}</span><span className="sr-only">{t('{n} waiting on you', { n: badge.cards })}</span></>}
          {shut && !badge.mentions && !badge.cards && badge.fresh && <span className="cl-fresh" role="img" aria-label={t('New messages')} />}
        </button>
        {action}
      </h2>
      {!shut && rows.length === 0 && <p className="cl-empty">{empty}</p>}
      {rows.length > 0 && <ul>{rows}</ul>}
      {!shut && below}
    </section>
  )
}
