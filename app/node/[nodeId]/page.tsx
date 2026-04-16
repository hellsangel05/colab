'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { useParams, useRouter } from 'next/navigation'

import LabIcon from '@/components/LabIcon'
import NodeCard from '@/components/NodeCard'
import ReportButton from '@/components/ReportButton'
import RoomIndicator from '@/components/RoomIndicator'
import { apiPost } from '@/lib/api'
import { supabase, type Edge, type Node } from '@/lib/supabase'
import { LAB_MAP, type LabId } from '@/types'
import { useUser } from '@/hooks/useUser'

export default function NodePage() {
  const params = useParams()
  const router = useRouter()
  const { userId } = useUser()
  const nodeId = params.nodeId as string

  const [node, setNode] = useState<Node | null>(null)
  const [ancestors, setAncestors] = useState<Node[]>([])
  const [children, setChildren] = useState<Node[]>([])
  const [connectedNodes, setConnectedNodes] = useState<Array<{ node: Node; relationship: string }>>([])
  const [loading, setLoading] = useState(true)
  const [votes, setVotes] = useState(0)
  const [voted, setVoted] = useState<number | null>(null)
  const [replyText, setReplyText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lab = useMemo(
    () => (node ? LAB_MAP[node.lab as LabId] : null),
    [node]
  )

  useEffect(() => {
    let active = true

    async function loadNodeState() {
      setLoading(true)

      const { data: nodeData } = await supabase
        .from('nodes')
        .select('*')
        .eq('id', nodeId)
        .single()

      if (!active) {
        return
      }

      if (!nodeData) {
        setNode(null)
        setLoading(false)
        return
      }

      setNode(nodeData)
      setVotes(nodeData.vote_count)

      const nextAncestors: Node[] = []
      let currentParentId = nodeData.parent_node_id

      while (currentParentId) {
        const { data: parentNode } = await supabase
          .from('nodes')
          .select('*')
          .eq('id', currentParentId)
          .single()

        if (!parentNode) {
          break
        }

        nextAncestors.unshift(parentNode)
        currentParentId = parentNode.parent_node_id
      }

      const { data: childNodes } = await supabase
        .from('nodes')
        .select('*')
        .eq('parent_node_id', nodeId)
        .eq('status', 'active')
        .order('vote_count', { ascending: false })

      const { data: relatedEdges } = await supabase
        .from('edges')
        .select('*')
        .or(`source_node_id.eq.${nodeId},target_node_id.eq.${nodeId}`)
        .order('confidence_score', { ascending: false })
        .limit(5)

      let nextConnectedNodes: Array<{ node: Node; relationship: string }> = []
      if (relatedEdges && relatedEdges.length > 0) {
        const connectedIds = relatedEdges.map((edge) =>
          edge.source_node_id === nodeId ? edge.target_node_id : edge.source_node_id
        )

        const { data: connected } = await supabase
          .from('nodes')
          .select('*')
          .in('id', connectedIds)

        nextConnectedNodes = (connected ?? []).map((connectedNode) => ({
          node: connectedNode,
          relationship:
            relatedEdges.find(
              (edge: Edge) =>
                edge.source_node_id === connectedNode.id ||
                edge.target_node_id === connectedNode.id
            )?.relationship_type ?? 'expands',
        }))
      }

      if (active) {
        setAncestors(nextAncestors)
        setChildren(childNodes ?? [])
        setConnectedNodes(nextConnectedNodes)
        setLoading(false)
      }
    }

    void loadNodeState()

    return () => {
      active = false
    }
  }, [nodeId])

  useEffect(() => {
    const channel = supabase
      .channel(`node-replies-${nodeId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'nodes',
          filter: `parent_node_id=eq.${nodeId}`,
        },
        (payload) => {
          setChildren((current) => {
            if (current.some((child) => child.id === payload.new.id)) {
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
  }, [nodeId])

  async function handleVote(value: 1 | -1) {
    if (!node || voted === value) {
      return
    }

    const previousValue = voted ?? 0
    const optimisticVotes = votes + value - previousValue
    setVoted(value)
    setVotes(optimisticVotes)

    try {
      const response = await apiPost<{ voteCount: number }>('/api/votes', {
        targetId: node.id,
        targetType: 'node',
        value,
      })
      setVotes(response.voteCount)
    } catch (voteError) {
      setVoted(previousValue === 0 ? null : previousValue)
      setVotes(node.vote_count)
      setError(voteError instanceof Error ? voteError.message : 'Voting failed.')
    }
  }

  async function handleReply() {
    if (!replyText.trim() || !node) {
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const response = await apiPost<{ node: Node }>('/api/nodes', {
        content: replyText.trim(),
        lab: node.lab,
        parentNodeId: node.id,
      })
      setReplyText('')
      setChildren((current) =>
        current.some((child) => child.id === response.node.id)
          ? current
          : [...current, response.node]
      )
      void apiPost('/api/embed', { nodeId: response.node.id }).catch(() => undefined)
    } catch (replyError) {
      setError(replyError instanceof Error ? replyError.message : 'Reply failed.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleReply()
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[var(--dim)]">
        Loading...
      </div>
    )
  }

  if (!node || !lab) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[var(--dim)]">
        This node is unavailable.
      </div>
    )
  }

  return (
    <div className="page-shell">
      <div className="page-intro">
        <div>
          <p className="page-kicker">Thread view</p>
          <h1 className="page-title">Conversation thread</h1>
          <p className="page-description">
            Follow the origin chain, reply in context, and open the strongest node into a room.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => router.back()}
            className="ghost-button px-3 py-2 text-xs"
          >
            Back
          </button>
          <span
            className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-3 py-2 text-xs"
            style={{ background: `${lab.color}22`, color: lab.color }}
          >
            <LabIcon labId={lab.id} className="h-4 w-4" />
            {lab.name}
          </span>
        </div>
      </div>

      <div>
        {ancestors.length > 0 ? (
          <div className="panel mb-7 p-6 sm:p-7">
            <p className="mono-label">
              Origin chain
            </p>
            <div className="mt-5 divide-y divide-[var(--line)]">
              {ancestors.map((ancestor) => (
                <button
                  key={ancestor.id}
                  onClick={() => router.push(`/node/${ancestor.id}`)}
                  className="flex w-full items-start gap-4 py-4 text-left first:pt-0 last:pb-0"
                >
                  <span className="mt-2 h-2 w-2 rounded-full bg-[var(--signal)]" />
                  <span className="secondary-copy text-sm transition-colors hover:text-white">
                    {ancestor.content}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="panel panel-strong p-6 sm:p-7">
          <div className="mb-5 flex flex-wrap items-center gap-2.5">
            <span
              className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-3 py-1 text-xs"
              style={{ background: `${lab.color}22`, color: lab.color }}
            >
              <LabIcon labId={lab.id} className="h-4 w-4" />
              {lab.name}
            </span>
            {node.origin === 'ai' ? (
              <span className="signal-button rounded-full px-3 py-1 text-[10px] font-medium">
                AI
              </span>
            ) : null}
            {node.is_seed ? (
              <span className="ghost-button px-3 py-1 text-[10px]">
                Seed
              </span>
            ) : null}
            <span className="ml-auto mono-label">
              {formatDistanceToNow(new Date(node.created_at), { addSuffix: true })}
            </span>
          </div>

          <p className="reading-copy mb-7">{node.content}</p>

          <div className="flex flex-wrap items-center gap-3.5 border-t border-[var(--line)] pt-5">
            <button
              onClick={() => void handleVote(1)}
              className={`text-sm transition-colors ${
                voted === 1 ? 'text-[var(--signal)]' : 'text-[var(--dim)] hover:text-white'
              }`}
            >
              Up {votes > 0 ? votes : ''}
            </button>
            <button
              onClick={() => void handleVote(-1)}
              className={`text-sm transition-colors ${
                voted === -1 ? 'text-white' : 'text-[var(--dim)] hover:text-white'
              }`}
            >
              Down
            </button>
            <button
              onClick={() => router.push(`/room/new?nodeId=${node.id}`)}
              className="text-xs text-[var(--dim)] transition-colors hover:text-[var(--signal)]"
            >
              Open a room
            </button>
            <ReportButton nodeId={node.id} />
            <div className="ml-auto">
              <RoomIndicator nodeId={node.id} />
            </div>
          </div>
        </div>

        <div className="panel mt-7 p-6 sm:p-7">
          <p className="mono-label mb-3">
            {children.length > 0
              ? `${children.length} ${children.length === 1 ? 'reply' : 'replies'}`
              : 'Be the first to reply'}
          </p>
          <div className="relative">
            <textarea
              value={replyText}
              onChange={(event) => setReplyText(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add your thinking..."
              rows={3}
              className="field w-full resize-none px-4 py-3 text-sm leading-7"
            />
            <button
              onClick={() => void handleReply()}
              disabled={submitting || !replyText.trim()}
              className="signal-button absolute bottom-3 right-3 px-4 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-30"
            >
              {submitting ? '...' : 'Reply'}
            </button>
          </div>
          <p className="mt-2 text-xs text-[var(--dim)]">
            Enter submits. Shift+Enter creates a new line.
          </p>
        </div>

        {children.length > 0 ? (
          <div className="mt-7 space-y-4">
            {children.map((child) => (
              <NodeCard key={child.id} node={child} userId={userId} />
            ))}
          </div>
        ) : null}

        {connectedNodes.length > 0 ? (
          <div className="panel mt-8 p-6 sm:p-7">
            <p className="mono-label">
              AI connections
            </p>
            <div className="mt-5 space-y-4">
              {connectedNodes.map(({ node: connectedNode, relationship }) => (
                <button
                  key={connectedNode.id}
                  onClick={() => router.push(`/node/${connectedNode.id}`)}
                  className="panel panel-interactive flex w-full items-start gap-4 p-5 text-left"
                >
                  <span className="ghost-button mt-0.5 px-3 py-1 text-[10px] capitalize">
                    {relationship.replace(/_/g, ' ')}
                  </span>
                  <span className="secondary-copy text-sm">
                    {connectedNode.content}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {error ? <p className="mt-5 text-sm text-red-300">{error}</p> : null}
      </div>
    </div>
  )
}
