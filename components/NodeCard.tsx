'use client'

import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Ellipsis, MessageSquareText, Pencil, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

import ReportButton from '@/components/ReportButton'
import RoomIndicator from '@/components/RoomIndicator'
import { apiDelete, apiPatch, apiPost } from '@/lib/api'
import { supabase, type Node } from '@/lib/supabase'
import type { NodeReferenceContext } from '@/types/feed'
import { LAB_MAP, type LabId } from '@/types'
import LabIcon from '@/components/LabIcon'

type Props = {
  node: Node
  userId: string
  referenceContext?: NodeReferenceContext
  isAdmin?: boolean
}

export default function NodeCard({
  node,
  userId,
  referenceContext,
  isAdmin = false,
}: Props) {
  const router = useRouter()
  const lab = LAB_MAP[node.lab as LabId]
  const isPromptReference = referenceContext?.kind === 'prompt'

  const [votes, setVotes] = useState(node.vote_count)
  const [voted, setVoted] = useState<number | null>(null)
  const [replyCount, setReplyCount] = useState(0)
  const [showReply, setShowReply] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [replySent, setReplySent] = useState(false)
  const [submittingReply, setSubmittingReply] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(node.content)
  const [displayContent, setDisplayContent] = useState(node.content)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function loadReplyCount() {
      const { count } = await supabase
        .from('nodes')
        .select('id', { count: 'exact', head: true })
        .eq('parent_node_id', node.id)
        .eq('status', 'active')

      if (mounted) {
        setReplyCount(count ?? 0)
      }
    }

    void loadReplyCount()

    return () => {
      mounted = false
    }
  }, [node.id])

  async function handleVote(value: 1 | -1) {
    if (!userId || voted === value) {
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
      setVotes(votes)
      setError(voteError instanceof Error ? voteError.message : 'Voting failed.')
    }
  }

  async function handleReplySubmit() {
    if (!replyText.trim() || !userId) {
      return
    }

    setSubmittingReply(true)
    setError(null)

    try {
      const response = await apiPost<{ node: Node }>('/api/nodes', {
        content: replyText.trim(),
        lab: node.lab,
        parentNodeId: node.id,
      })

      setReplyCount((current) => current + 1)
      setReplyText('')
      setReplySent(true)
      setShowReply(false)
      void apiPost('/api/embed', { nodeId: response.node.id }).catch(() => undefined)
    } catch (replyError) {
      setError(replyError instanceof Error ? replyError.message : 'Reply failed.')
    } finally {
      setSubmittingReply(false)
    }
  }

  async function handleDelete() {
    try {
      await apiDelete(`/api/admin/nodes/${node.id}`)
      setDeleted(true)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Delete failed.')
    }
  }

  async function handleEdit() {
    if (!editContent.trim()) {
      return
    }

    try {
      const response = await apiPatch<{ node: Node }>(`/api/admin/nodes/${node.id}`, {
        content: editContent.trim(),
      })
      setDisplayContent(response.node.content)
      setEditing(false)
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : 'Edit failed.')
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleReplySubmit()
    }
  }

  if (deleted) {
    return null
  }

  return (
    <article className="panel panel-interactive p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => router.push(`/lab/${node.lab}`)}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-3 py-1.5 text-[0.75rem] font-medium"
            style={{ background: `${lab.color}22`, color: lab.color }}
          >
            <LabIcon labId={lab.id} className="h-3.5 w-3.5" />
            {lab.name}
          </button>
          {node.origin === 'ai' ? (
            <span className="signal-button rounded-full px-3 py-1.5 text-[0.64rem] font-medium">
              AI
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2.5">
          <span className="mono-label whitespace-nowrap">
            {formatDistanceToNow(new Date(node.created_at), { addSuffix: true })}
          </span>
          {isAdmin ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setEditing((current) => !current)}
                className="ghost-button rounded-full p-2 text-[var(--muted)]"
                title="Edit node"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => void handleDelete()}
                className="rounded-full border border-[color:rgba(255,122,92,0.24)] bg-[rgba(255,122,92,0.08)] p-2 text-[var(--danger)] transition-colors hover:bg-[rgba(255,122,92,0.14)]"
                title="Delete node"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {editing ? (
        <div className="subtle-section mb-5 p-4">
          <textarea
            value={editContent}
            onChange={(event) => setEditContent(event.target.value)}
            rows={4}
            className="field w-full resize-none px-4 py-3.5 text-sm leading-7"
          />
          <div className="mt-3 flex gap-2.5">
            <button
              onClick={() => void handleEdit()}
              className="signal-button px-4 py-2 text-xs font-medium"
            >
              Save
            </button>
            <button
              onClick={() => {
                setEditing(false)
                setEditContent(displayContent)
              }}
              className="ghost-button px-4 py-2 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-5 space-y-3">
          {referenceContext ? (
            <button
              onClick={() => router.push(referenceContext.href)}
              className={`block w-full rounded-[20px] px-4 py-3.5 text-left transition-colors ${
                isPromptReference
                  ? 'border border-[var(--line-strong)] bg-[linear-gradient(180deg,rgba(255,216,74,0.12),rgba(255,216,74,0.04))] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] hover:bg-[linear-gradient(180deg,rgba(255,216,74,0.16),rgba(255,216,74,0.06))]'
                  : 'subtle-section hover:border-[var(--line-strong)]'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                {isPromptReference ? (
                  <span className="signal-button px-2.5 py-1 text-[0.58rem] font-medium">
                    AI prompt
                  </span>
                ) : null}
                <p className="mono-label text-[0.62rem]">{referenceContext.label}</p>
              </div>
              <p
                className={`mt-2 text-sm leading-relaxed ${
                  isPromptReference ? 'text-[var(--text)]' : 'text-[var(--muted)]'
                }`}
              >
                {referenceContext.preview}
              </p>
            </button>
          ) : null}
          <button
            onClick={() => router.push(`/node/${node.id}`)}
            className="subtle-section reading-copy block w-full px-5 py-4 text-left transition-colors hover:border-[var(--line-strong)] hover:text-white"
          >
            {displayContent}
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5 border-t border-[var(--line)] pt-4">
        <button
          onClick={() => void handleVote(1)}
          className={`action-chip ${
            voted === 1 ? 'action-chip-active' : ''
          }`}
        >
          Upvote
          <span className="font-mono text-[0.72rem]">{votes > 0 ? votes : 0}</span>
        </button>
        <button
          onClick={() => void handleVote(-1)}
          className={`action-chip ${
            voted === -1 ? 'action-chip-active text-white' : ''
          }`}
        >
          Downvote
        </button>
        <button
          onClick={() => setShowReply((current) => !current)}
          className={`action-chip ${
            showReply ? 'action-chip-active' : ''
          }`}
        >
          <MessageSquareText className="h-3.5 w-3.5" />
          {replySent ? 'Replied' : replyCount > 0 ? `${replyCount} replies` : 'Reply'}
        </button>
        <div className="ml-auto flex items-center gap-2">
          <RoomIndicator nodeId={node.id} />
          <div className="relative">
            <button
              onClick={() => setShowMoreMenu((current) => !current)}
              className="action-chip"
            >
              <Ellipsis className="h-3.5 w-3.5" />
              More
            </button>
            {showMoreMenu ? (
              <div className="menu-panel absolute right-0 top-[calc(100%+0.65rem)] z-20 w-52 p-2">
                <div className="space-y-1">
                  <button
                    onClick={() => router.push(`/room/new?nodeId=${node.id}`)}
                    className="menu-item w-full text-left"
                  >
                    <span className="menu-item-icon">R</span>
                    <span>
                      <span className="block text-sm font-semibold text-white">Open a room</span>
                      <span className="mt-1 block text-xs text-[var(--dim)]">
                        Turn this node into a collaboration room
                      </span>
                    </span>
                  </button>
                  <button
                    onClick={() => router.push(`/node/${node.id}`)}
                    className="menu-item w-full text-left"
                  >
                    <span className="menu-item-icon">T</span>
                    <span>
                      <span className="block text-sm font-semibold text-white">Open thread</span>
                      <span className="mt-1 block text-xs text-[var(--dim)]">
                        Read the full conversation chain
                      </span>
                    </span>
                  </button>
                  <div className="menu-item">
                    <span className="menu-item-icon">!</span>
                    <div className="text-left">
                      <span className="block text-sm font-semibold text-white">Report</span>
                      <span className="mt-1 block text-xs text-[var(--dim)]">
                        Flag this node for moderation review
                      </span>
                      <div className="mt-2">
                        <ReportButton nodeId={node.id} compact />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          <button
            onClick={() => router.push(`/node/${node.id}`)}
            className="action-chip"
          >
            Thread
          </button>
        </div>
      </div>

      {showReply ? (
        <div className="subtle-section mt-4 p-4">
          <div className="relative">
            <textarea
              value={replyText}
              onChange={(event) => setReplyText(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add your thinking..."
              rows={3}
              autoFocus
              className="field w-full resize-none px-4 py-3.5 text-sm leading-7"
            />
            <button
              onClick={() => void handleReplySubmit()}
              disabled={submittingReply || !replyText.trim()}
              className="signal-button absolute bottom-2.5 right-2.5 px-3.5 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-30"
            >
              {submittingReply ? '...' : 'Reply'}
            </button>
          </div>
          <p className="mt-3 text-xs text-[var(--dim)]">
            Enter to submit. Shift+Enter for a new line.
          </p>
        </div>
      ) : null}

      {error ? <p className="mt-4 text-xs text-red-300">{error}</p> : null}
    </article>
  )
}
