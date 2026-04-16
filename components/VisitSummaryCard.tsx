'use client'

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'

import { LAB_MAP, type LabId } from '@/types'
import type { VisitSummaryResponse } from '@/types/visit-summary'

type Props = {
  summary: VisitSummaryResponse
  variant: 'compact' | 'full'
  title?: string
  onDismiss?: () => void
}

function eventLabel(item: VisitSummaryResponse['items'][number]) {
  if (item.kind === 'reply') {
    return item.actor === 'ai' ? 'AI replied to your node' : 'Someone replied to your node'
  }

  return 'AI connected your node'
}

function eventDescription(item: VisitSummaryResponse['items'][number]) {
  if (item.kind === 'reply') {
    return item.relatedNodePreview ?? 'A new reply was added.'
  }

  const relationship = item.relationshipType?.replace(/_/g, ' ') ?? 'connected'
  const relatedPreview = item.relatedNodePreview ?? 'another node in the network'
  return `${relationship}: ${relatedPreview}`
}

export default function VisitSummaryCard({
  summary,
  variant,
  title = 'Since your last visit',
  onDismiss,
}: Props) {
  const isCompact = variant === 'compact'

  return (
    <section className={`panel ${isCompact ? 'p-5 sm:p-6' : 'p-6 sm:p-7'}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="signal-label">{title}</p>
          <h2 className="mt-3 text-2xl font-black tracking-[-0.05em] text-white">
            {summary.counts.replies + summary.counts.aiConnections === 0
              ? 'Nothing changed while you were away'
              : `${summary.counts.replies + summary.counts.aiConnections} updates found`}
          </h2>
          <p className="secondary-copy mt-3 max-w-2xl text-sm">
            {summary.counts.replies > 0
              ? `${summary.counts.replies} repl${summary.counts.replies === 1 ? 'y' : 'ies'}`
              : 'No new replies'}
            {' · '}
            {summary.counts.aiConnections > 0
              ? `${summary.counts.aiConnections} AI connection${
                  summary.counts.aiConnections === 1 ? '' : 's'
                }`
              : 'No new AI connections'}
          </p>
        </div>
        {isCompact && onDismiss ? (
          <button
            onClick={onDismiss}
            className="ghost-button px-4 py-2 text-xs text-[var(--signal)]"
          >
            Mark as seen
          </button>
        ) : null}
      </div>

      {summary.items.length > 0 ? (
        <div className={`mt-6 ${isCompact ? 'space-y-3' : 'space-y-4'}`}>
          {summary.items.map((item) => {
            const lab = LAB_MAP[item.lab as LabId]
            return (
              <Link
                key={item.id}
                href={`/node/${item.impactedNodeId}`}
                className={`panel panel-interactive block text-left ${
                  isCompact ? 'p-4' : 'p-5'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2.5">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-2.5 py-1 text-xs"
                    style={{ background: `${lab.color}22`, color: lab.color }}
                  >
                    {lab.name}
                  </span>
                  <span className="mono-label">{eventLabel(item)}</span>
                  <span className="ml-auto text-xs text-[var(--dim)]">
                    {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                  </span>
                </div>
                <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--dim)]">
                  Your node
                </p>
                <p className="secondary-copy mt-2 text-sm">{item.impactedNodePreview}</p>
                <p className="mt-4 text-xs uppercase tracking-[0.18em] text-[var(--dim)]">
                  What happened
                </p>
                <p className="reading-copy mt-2 text-sm">{eventDescription(item)}</p>
              </Link>
            )
          })}
        </div>
      ) : null}

      {summary.remainingCount > 0 ? (
        <p className="mt-5 text-sm text-[var(--dim)]">
          {summary.remainingCount} more update{summary.remainingCount === 1 ? '' : 's'} in your
          full activity window.
        </p>
      ) : null}

      {isCompact ? (
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
          <p className="text-xs text-[var(--dim)]">Want the full detail view?</p>
          <Link
            href="/profile"
            className="ghost-button px-4 py-2 text-xs text-[var(--signal)]"
          >
            Open profile
          </Link>
        </div>
      ) : null}
    </section>
  )
}
