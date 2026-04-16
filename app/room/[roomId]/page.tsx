'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { useParams, useRouter } from 'next/navigation'

import LabIcon from '@/components/LabIcon'
import { apiPost } from '@/lib/api'
import { supabase, type Node, type ProjectRoom } from '@/lib/supabase'
import { LAB_MAP, type LabId } from '@/types'

export default function RoomPage() {
  const params = useParams()
  const router = useRouter()
  const roomId = params.roomId as string

  const [room, setRoom] = useState<ProjectRoom | null>(null)
  const [originNode, setOriginNode] = useState<Node | null>(null)
  const [contributions, setContributions] = useState<Node[]>([])
  const [response, setResponse] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const lab = useMemo(
    () => (originNode ? LAB_MAP[originNode.lab as LabId] : null),
    [originNode]
  )

  useEffect(() => {
    let active = true

    async function loadRoom() {
      const { data: roomData } = await supabase
        .from('project_rooms')
        .select('*')
        .eq('id', roomId)
        .single()

      if (!active) {
        return
      }

      if (!roomData) {
        router.replace('/')
        return
      }

      const [originResult, contributionsResult] = await Promise.all([
        supabase
          .from('nodes')
          .select('*')
          .eq('id', roomData.origin_node_id)
          .single(),
        supabase
          .from('nodes')
          .select('*')
          .eq('parent_node_id', roomData.origin_node_id)
          .order('created_at', { ascending: true }),
      ])

      if (!active) {
        return
      }

      setRoom(roomData)
      setOriginNode(originResult.data ?? null)
      setContributions(contributionsResult.data ?? [])
      setLoading(false)
    }

    void loadRoom()

    return () => {
      active = false
    }
  }, [roomId, router])

  useEffect(() => {
    if (!room) {
      return
    }

    const channel = supabase
      .channel(`room-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'nodes',
          filter: `parent_node_id=eq.${room.origin_node_id}`,
        },
        (payload) => {
          setContributions((current) => {
            if (current.some((node) => node.id === payload.new.id)) {
              return current
            }

            return [...current, payload.new as Node]
          })
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [room, roomId])

  async function handleSubmit() {
    if (!response.trim() || !originNode) {
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const created = await apiPost<{ node: Node }>('/api/nodes', {
        content: response.trim(),
        lab: originNode.lab,
        parentNodeId: originNode.id,
      })

      setResponse('')
      setContributions((current) =>
        current.some((node) => node.id === created.node.id)
          ? current
          : [...current, created.node]
      )
      void apiPost('/api/embed', { nodeId: created.node.id }).catch(() => undefined)
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Failed to add contribution.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSubmit()
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[var(--dim)]">
        Loading the room...
      </div>
    )
  }

  if (!room || !originNode || !lab) {
    return null
  }

  return (
    <div className="page-shell flex min-h-screen flex-col">
      <div className="page-intro">
        <div>
          <p className="page-kicker">Project room</p>
          <h1 className="page-title">{room.title}</h1>
          <p className="page-description">
            Build around the origin node, keep the thread moving, and invite the right people in.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => router.back()}
            className="ghost-button px-3 py-2 text-xs"
          >
            Back
          </button>
          <span className="ghost-button px-3 py-2 text-xs text-[var(--positive)]">
            {room.status}
          </span>
          <span className="mono-label">
            {room.contributor_ids.length} contributors
          </span>
        </div>
      </div>

      <div className="flex w-full flex-1 flex-col">
        <div className="space-y-7">
          <div className="panel p-6 sm:p-7">
            <div className="mb-3 flex items-center gap-2">
              <p className="mono-label">Origin node</p>
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-2 py-0.5 text-xs"
                style={{ background: `${lab.color}22`, color: lab.color }}
              >
                <LabIcon labId={lab.id} className="h-3.5 w-3.5" />
                {lab.name}
              </span>
            </div>
            <p className="secondary-copy text-sm">{originNode.content}</p>
            <button
              onClick={() => router.push(`/node/${originNode.id}`)}
              className="mt-3 text-xs text-[var(--dim)] transition-colors hover:text-[var(--signal)]"
            >
              View full thread
            </button>
          </div>

          {room.direction ? (
            <div className="panel p-6 sm:p-7">
              <p className="mono-label mb-2">
                Direction
              </p>
              <p className="secondary-copy text-sm">{room.direction}</p>
            </div>
          ) : null}

          {room.roles_needed.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="mono-label">Looking for</p>
              {room.roles_needed.map((role) => (
                <span
                  key={role}
                  className="ghost-button px-3 py-1 text-xs text-[var(--muted)]"
                >
                  {role}
                </span>
              ))}
            </div>
          ) : null}

          {room.opening_question && contributions.length === 0 ? (
            <div className="panel panel-strong p-6 sm:p-7">
              <p className="signal-label mb-2">Opening question</p>
              <p className="reading-copy">{room.opening_question}</p>
            </div>
          ) : null}

          {contributions.length > 0 ? (
            <div className="space-y-4">
              <p className="mono-label">
                {contributions.length} contributions
              </p>
              {contributions.map((contribution) => (
                <div
                  key={contribution.id}
                  className="panel p-5"
                >
                  <p className="reading-copy text-sm">
                    {contribution.content}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="mono-label">
                      {formatDistanceToNow(new Date(contribution.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                    {contribution.origin === 'ai' ? (
                      <span className="signal-button rounded-full px-3 py-1 text-[10px] font-medium">
                        AI
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="sticky bottom-0 mt-8 border-t border-[var(--line)] bg-[rgba(5,5,5,0.92)] py-5 backdrop-blur-xl">
          {room.opening_question && contributions.length === 0 ? (
            <p className="mb-3 text-xs italic text-[var(--dim)]">
              &ldquo;{room.opening_question}&rdquo;
            </p>
          ) : null}
          <div className="relative">
            <textarea
              value={response}
              onChange={(event) => setResponse(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add your thinking..."
              rows={3}
              className="field w-full resize-none px-4 py-3 text-sm leading-7"
            />
            <button
              onClick={() => void handleSubmit()}
              disabled={submitting || !response.trim()}
              className="signal-button absolute bottom-3 right-3 px-4 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-30"
            >
              {submitting ? '...' : 'Add'}
            </button>
          </div>
          {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
        </div>
      </div>
    </div>
  )
}
