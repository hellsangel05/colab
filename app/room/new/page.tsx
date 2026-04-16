'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { apiPost } from '@/lib/api'
import { supabase, type Node, type ProjectRoom } from '@/lib/supabase'
import { ROOM_ROLE_OPTIONS } from '@/types'
import { useUser } from '@/hooks/useUser'

export default function NewRoomPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { loading: userLoading } = useUser()
  const nodeId = searchParams.get('nodeId')

  const [originNode, setOriginNode] = useState<Node | null>(null)
  const [title, setTitle] = useState('')
  const [direction, setDirection] = useState('')
  const [openingQuestion, setOpeningQuestion] = useState('')
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadOriginNode() {
      if (!nodeId) {
        router.replace('/')
        return
      }

      const { data } = await supabase
        .from('nodes')
        .select('*')
        .eq('id', nodeId)
        .single()

      if (!active) {
        return
      }

      if (!data) {
        router.replace('/')
        return
      }

      setOriginNode(data)
      setLoading(false)
    }

    void loadOriginNode()

    return () => {
      active = false
    }
  }, [nodeId, router])

  function toggleRole(role: string) {
    setSelectedRoles((current) =>
      current.includes(role)
        ? current.filter((item) => item !== role)
        : [...current, role]
    )
  }

  async function handleSubmit() {
    if (!title.trim() || !nodeId || userLoading) {
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const response = await apiPost<{ room: ProjectRoom }>('/api/project-rooms', {
        originNodeId: nodeId,
        title: title.trim(),
        direction: direction.trim() || null,
        openingQuestion: openingQuestion.trim() || null,
        rolesNeeded: selectedRoles,
      })
      router.push(`/room/${response.room.id}`)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create room.')
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[var(--dim)]">
        Loading...
      </div>
    )
  }

  return (
    <div className="page-shell">
      <div className="page-intro max-w-3xl">
        <div>
          <p className="page-kicker">New room</p>
          <h1 className="page-title">Open a project room</h1>
          <p className="page-description">
            Turn a strong node into a collaborative room with a clear direction and the right roles.
          </p>
        </div>
        <button
          onClick={() => router.back()}
          className="ghost-button px-3 py-2 text-xs"
        >
          Cancel
        </button>
      </div>

      <div className="shell max-w-3xl space-y-6 px-0 py-0">
        {originNode ? (
          <div className="panel p-5">
            <p className="mono-label mb-3">
              This room branches from
            </p>
            <p className="text-sm leading-relaxed text-[var(--muted)]">{originNode.content}</p>
            <p className="mt-2 text-xs text-[var(--dim)]">Origin credit is locked in automatically.</p>
          </div>
        ) : null}

        <div className="space-y-2">
          <label className="text-sm font-medium text-white">Room title</label>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What are you building or exploring?"
            className="field px-4 py-3 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-white">Direction</label>
          <textarea
            value={direction}
            onChange={(event) => setDirection(event.target.value)}
            placeholder="What would a useful outcome look like?"
            rows={3}
            className="field w-full resize-none px-4 py-3 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-white">Opening question</label>
          <textarea
            value={openingQuestion}
            onChange={(event) => setOpeningQuestion(event.target.value)}
            placeholder="What do you most need another brain on?"
            rows={2}
            className="field w-full resize-none px-4 py-3 text-sm"
          />
        </div>

        <div className="space-y-3">
          <label className="text-sm font-medium text-white">Roles needed</label>
          <div className="flex flex-wrap gap-2">
            {ROOM_ROLE_OPTIONS.map((role) => (
              <button
                key={role}
                onClick={() => toggleRole(role)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-all ${
                  selectedRoles.includes(role)
                    ? 'border-[var(--line-strong)] bg-[rgba(255,216,74,0.12)] text-white'
                    : 'border-[var(--line)] bg-[rgba(255,216,74,0.04)] text-[var(--muted)] hover:border-[var(--line-strong)] hover:text-white'
                }`}
              >
                {role}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => void handleSubmit()}
          disabled={submitting || !title.trim()}
          className="signal-button w-full py-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-30"
        >
          {submitting ? 'Opening the room...' : 'Open the room'}
        </button>

        {error ? <p className="text-sm text-red-300">{error}</p> : null}
      </div>
    </div>
  )
}
