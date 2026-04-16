'use client'

import { useState } from 'react'

import { apiDelete, apiPatch, apiPost } from '@/lib/api'
import type { Node } from '@/lib/supabase'
import type { EvolutionCycleResult } from '@/types/evolution'

export default function AdminPanel() {
  const [open, setOpen] = useState(false)
  const [nodeId, setNodeId] = useState('')
  const [message, setMessage] = useState('')
  const [running, setRunning] = useState(false)

  if (process.env.NODE_ENV !== 'development') {
    return null
  }

  function notify(nextMessage: string) {
    setMessage(nextMessage)
    window.setTimeout(() => setMessage(''), 3000)
  }

  async function handleDelete() {
    if (!nodeId.trim()) {
      return
    }

    try {
      await apiDelete<{ success: boolean }>(`/api/admin/nodes/${nodeId.trim()}`)
      notify('Node deleted.')
      setNodeId('')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Delete failed.')
    }
  }

  async function handleDormant() {
    if (!nodeId.trim()) {
      return
    }

    try {
      await apiPatch<{ node: Node }>(`/api/admin/nodes/${nodeId.trim()}`, {
        status: 'dormant',
      })
      notify('Node marked dormant.')
      setNodeId('')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Update failed.')
    }
  }

  async function handleEvolution() {
    setRunning(true)

    try {
      const response = await apiPost<EvolutionCycleResult>('/api/admin/evolution')
      if (response.skipped) {
        notify(response.reason ?? 'Evolution skipped because it is not due yet.')
      } else if (response.errors.length > 0) {
        notify(
          `Evolution ran with issues: ${response.errors
            .map((issue) => `${issue.lab}`)
            .join(', ')}.`
        )
      } else {
        notify(
          `Evolution ran. Seeded ${response.nodesSeeded} nodes and ${response.promptsGenerated} prompts.`
        )
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Evolution failed.')
    } finally {
      setRunning(false)
    }
  }

  if (!open) {
    return (
      <div className="fixed bottom-6 right-6 z-[99999]">
        <button
          onClick={() => setOpen(true)}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E94560] text-white shadow-[0_10px_30px_rgba(0,0,0,0.45)]"
        >
          Dev
        </button>
      </div>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 z-[99999] w-80 rounded-2xl border border-white/20 bg-[#0F0F1A] shadow-[0_16px_48px_rgba(0,0,0,0.65)]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="text-sm font-medium text-white">Dev Controls</span>
        <button
          onClick={() => setOpen(false)}
          className="text-sm text-[#555570] transition-colors hover:text-white"
        >
          Close
        </button>
      </div>

      <div className="space-y-4 p-4">
        {message ? (
          <div className="rounded-lg border border-[#10b981]/20 bg-[#10b981]/10 px-3 py-2 text-xs text-[#10b981]">
            {message}
          </div>
        ) : null}

        <button
          onClick={() => void handleEvolution()}
          disabled={running}
          className="w-full rounded-lg border border-[#f59e0b]/30 bg-[#f59e0b]/10 py-2 text-xs text-[#f59e0b] transition-colors hover:bg-[#f59e0b]/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {running ? 'Running evolution...' : 'Run Evolution'}
        </button>

        <div className="space-y-2 border-t border-white/10 pt-4">
          <label className="text-xs uppercase tracking-wider text-[#555570]">
            Node ID
          </label>
          <input
            value={nodeId}
            onChange={(event) => setNodeId(event.target.value)}
            placeholder="Paste node ID..."
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder-[#444460] focus:border-white/20 focus:outline-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => void handleDormant()}
              disabled={!nodeId.trim()}
              className="rounded-lg border border-white/10 bg-white/5 py-2 text-xs text-[#AAAACC] transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Mark dormant
            </button>
            <button
              onClick={() => void handleDelete()}
              disabled={!nodeId.trim()}
              className="rounded-lg border border-red-700/30 bg-red-900/20 py-2 text-xs text-red-300 transition-colors hover:bg-red-900/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Delete node
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
