'use client'

import { useState } from 'react'
import { Flag } from 'lucide-react'

import { apiPost } from '@/lib/api'

type Props = {
  nodeId: string
  compact?: boolean
}

export default function ReportButton({ nodeId, compact = false }: Props) {
  const [reported, setReported] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleReport() {
    setSubmitting(true)

    try {
      await apiPost<{ success: boolean }>('/api/report', {
        nodeId,
      })
      setReported(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <button
      onClick={() => void handleReport()}
      disabled={submitting || reported}
      className={`transition-colors ${
        compact
          ? 'text-[var(--dim)] hover:text-[var(--signal)]'
          : 'action-chip'
      }`}
      title={reported ? 'Reported' : 'Report this node'}
    >
      <Flag className={compact ? 'h-3.5 w-3.5' : 'h-3.5 w-3.5'} />
      {compact ? null : reported ? 'Reported' : 'Report'}
    </button>
  )
}
