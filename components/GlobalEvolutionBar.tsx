'use client'

import { useEvolutionStatus } from '@/hooks/useEvolutionStatus'

function stateClasses(state: ReturnType<typeof useEvolutionStatus>['state']) {
  if (state === 'due_now') {
    return 'border-[var(--line-strong)] bg-[rgba(255,216,74,0.12)] shadow-[0_0_0_1px_rgba(255,216,74,0.18),0_10px_40px_rgba(255,216,74,0.12)]'
  }

  if (state === 'just_evolved') {
    return 'border-[rgba(115,216,162,0.35)] bg-[rgba(115,216,162,0.1)] shadow-[0_0_0_1px_rgba(115,216,162,0.12),0_10px_40px_rgba(115,216,162,0.08)]'
  }

  return 'border-[var(--line)] bg-[rgba(5,5,5,0.95)]'
}

export default function GlobalEvolutionBar() {
  const evolution = useEvolutionStatus()

  return (
    <div className={`relative z-30 border-b backdrop-blur-xl transition-all duration-300 ${stateClasses(evolution.state)}`}>
      <div className="shell flex min-h-[var(--evolution-bar-height)] flex-wrap items-center justify-between gap-3 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${
              evolution.state === 'due_now'
                ? 'animate-pulse bg-[var(--signal)]'
                : evolution.state === 'just_evolved'
                  ? 'animate-pulse bg-[var(--positive)]'
                  : 'bg-[var(--signal)]/80'
            }`}
          />
          <div className="min-w-0">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">
              Evolution event
            </p>
            <p className="truncate text-sm text-white">{evolution.headline}</p>
          </div>
        </div>
        <div className="shrink-0 rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.02)] px-3 py-1.5 text-[0.72rem] font-medium text-[var(--muted)]">
          {evolution.state === 'counting_down' ? (
            <>
              in <span className="font-mono text-white">{evolution.countdownLabel}</span>
            </>
          ) : (
            <span className="font-mono text-white">{evolution.countdownLabel || 'soon'}</span>
          )}
        </div>
      </div>
      <div className="h-[2px] w-full bg-white/[0.04]">
        <div
          className={`h-full transition-[width] duration-700 ${
            evolution.state === 'just_evolved'
              ? 'bg-[var(--positive)]'
              : 'bg-[var(--signal)]'
          }`}
          style={{ width: `${evolution.progress}%` }}
        />
      </div>
    </div>
  )
}
