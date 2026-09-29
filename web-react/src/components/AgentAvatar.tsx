import React from 'react'

/// What an agent looks like wherever it appears: the picture somebody gave
/// it, else its emoji, else a robot. The box around it (its size, its
/// corners) is the caller's; a picture fills it.
export interface AgentLook { emoji?: string | null; avatarUrl?: string | null }

export const AgentAvatar: React.FC<{ agent?: AgentLook | null; className?: string; fallback?: string }> = ({ agent, className, fallback = '🤖' }) => (
  agent?.avatarUrl
    ? <span className={`${className || ''} agent-picture`.trim()} aria-hidden="true"><img src={agent.avatarUrl} alt="" loading="lazy" draggable={false} /></span>
    : <span className={className} aria-hidden="true">{agent?.emoji || fallback}</span>
)
