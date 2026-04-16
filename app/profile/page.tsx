'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { useRouter } from 'next/navigation'

import LabIcon from '@/components/LabIcon'
import VisitSummaryCard from '@/components/VisitSummaryCard'
import { useVisitSummary } from '@/hooks/useVisitSummary'
import { apiDelete, apiPost, apiRequest } from '@/lib/api'
import { supabase, type CoLabUser, type Node } from '@/lib/supabase'
import { LAB_MAP, type LabId } from '@/types'
import { useUser } from '@/hooks/useUser'

export default function ProfilePage() {
  const router = useRouter()
  const {
    userId,
    email: authEmail,
    isAnonymous,
    loading: userLoading,
    error: authError,
  } = useUser()
  const visitSummary = useVisitSummary({
    enabled: Boolean(userId) && !userLoading && !authError,
    limit: 20,
  })
  const markedSummaryUntilRef = useRef<string | null>(null)
  const visitSummaryData = visitSummary.summary
  const visitSummaryError = visitSummary.error
  const markVisitSummaryRead = visitSummary.markRead
  const visitSummaryUntil = visitSummaryData?.until ?? null
  const visitSummaryUnread = visitSummaryData?.unread ?? false

  const [user, setUser] = useState<CoLabUser | null>(null)
  const [nodes, setNodes] = useState<Node[]>([])
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [email, setEmail] = useState(authEmail ?? '')
  const [username, setUsername] = useState('')
  const [showClaimForm, setShowClaimForm] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadProfile() {
      if (!userId) {
        setLoading(false)
        return
      }

      if (!active) {
        return
      }

      try {
        const response = await apiRequest<{ user: CoLabUser; nodes: Node[] }>('/api/profile')

        if (!active) {
          return
        }

        setUser(response.user)
        setNodes(response.nodes)
        setUsername(response.user.username ?? '')
        setEmail(response.user.email ?? authEmail ?? '')
        setLoading(false)
      } catch (loadError) {
        if (!active) {
          return
        }

        setError(
          loadError instanceof Error ? loadError.message : 'Failed to load profile.'
        )
        setLoading(false)
      }
    }

    if (!userLoading) {
      void loadProfile()
    }

    return () => {
      active = false
    }
  }, [authEmail, userId, userLoading])

  useEffect(() => {
    async function markSummarySeen() {
      if (
        !visitSummaryUnread ||
        !visitSummaryUntil ||
        markedSummaryUntilRef.current === visitSummaryUntil
      ) {
        return
      }

      markedSummaryUntilRef.current = visitSummaryUntil

      try {
        await markVisitSummaryRead(visitSummaryUntil, {
          clearLocal: false,
        })
      } catch {
        markedSummaryUntilRef.current = null
      }
    }

    void markSummarySeen()
  }, [markVisitSummaryRead, visitSummaryUnread, visitSummaryUntil])

  const totalVotes = useMemo(
    () => nodes.reduce((sum, node) => sum + node.vote_count, 0),
    [nodes]
  )
  const uniqueLabs = useMemo(() => new Set(nodes.map((node) => node.lab)).size, [nodes])

  async function handleClaim() {
    if (!username.trim() || !email.trim()) {
      return
    }

    setClaiming(true)
    setError(null)

    try {
      const response = await apiPost<{ user: CoLabUser }>('/api/profile/claim', {
        username: username.trim(),
        email: email.trim(),
      })
      setUser(response.user)
      setSaved(true)
      setShowClaimForm(false)
      window.setTimeout(() => setSaved(false), 2500)
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : 'Claim failed.')
    } finally {
      setClaiming(false)
    }
  }

  async function handleDeleteAccount() {
    if (!confirm('Delete your account and all associated content?')) {
      return
    }

    setDeleting(true)
    setError(null)

    try {
      await apiDelete<{ success: boolean }>('/api/profile')
      await supabase.auth.signOut()
      router.push('/')
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : 'Account deletion failed.'
      )
      setDeleting(false)
    }
  }

  if (loading || userLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[var(--dim)]">
        Loading...
      </div>
    )
  }

  return (
    <div className="page-shell">
      <div className="page-intro">
        <div>
          <p className="page-kicker">Profile</p>
          <h1 className="page-title">Your activity</h1>
          <p className="page-description">
            Keep track of your contributions, claim the profile when you are ready, and see what shifted while you were away.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => router.back()}
            className="ghost-button px-3 py-2 text-xs"
          >
            Back
          </button>
          {saved ? <span className="text-xs text-[var(--positive)]">Saved</span> : null}
        </div>
      </div>

      <div className="space-y-7">
        {visitSummaryData ? (
          visitSummaryData.items.length > 0 ? (
            <VisitSummaryCard summary={visitSummaryData} variant="full" />
          ) : (
            <section className="panel p-6 sm:p-7">
              <p className="signal-label">Since your last visit</p>
              <h2 className="mt-3 text-2xl font-black tracking-[-0.05em] text-white">
                Nothing moved around your work
              </h2>
              <p className="secondary-copy mt-3 text-sm">
                When someone replies to one of your contributions or the AI connects
                one of your nodes, it will show up here.
              </p>
            </section>
          )
        ) : null}

        <div className="panel p-6 sm:p-7">
          <div className="mb-6 flex items-start justify-between gap-5">
            <div>
              <p className="signal-label">Identity</p>
              <h1 className="mt-3 text-2xl font-black tracking-[-0.05em] text-white">
                {user?.username || 'Anonymous Contributor'}
              </h1>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {user?.email || authEmail || 'Contributions not yet claimed'}
              </p>
              <p className="mt-2 text-xs text-[var(--dim)]">
                {isAnonymous ? 'Anonymous session active' : 'Claimed profile'}
              </p>
            </div>
            {user?.username ? null : (
              <button
                onClick={() => setShowClaimForm((current) => !current)}
                className="ghost-button px-4 py-2 text-sm text-[var(--signal)]"
              >
                Claim Profile
              </button>
            )}
          </div>

          {showClaimForm ? (
            <div className="mb-5 border-t border-[var(--line)] pt-5">
              <p className="mb-3 text-sm text-[var(--muted)]">
                Add a username and email to preserve this anonymous contribution history.
              </p>
              <div className="space-y-4">
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Username"
                  className="field px-4 py-2.5 text-sm"
                />
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Email"
                  type="email"
                  className="field px-4 py-2.5 text-sm"
                />
                <button
                  onClick={() => void handleClaim()}
                  disabled={claiming || !email.trim() || !username.trim()}
                  className="signal-button w-full py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {claiming ? 'Claiming...' : 'Claim my contributions'}
                </button>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-5 border-t border-[var(--line)] pt-5">
            {[
              ['Nodes', nodes.length],
              ['Total Votes', totalVotes],
              ['Labs', uniqueLabs],
            ].map(([label, value]) => (
              <div key={String(label)} className="text-center">
                <div className="text-2xl font-bold text-white">{value}</div>
                <div className="mt-1 text-xs text-[var(--dim)]">{label}</div>
              </div>
            ))}
          </div>

          <button
            onClick={() => void handleDeleteAccount()}
            disabled={deleting}
            className="mt-7 rounded-full border border-[color:rgba(255,122,92,0.24)] bg-[rgba(255,122,92,0.08)] px-4 py-2 text-sm text-[var(--danger)] transition-colors hover:bg-[rgba(255,122,92,0.14)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {deleting ? 'Deleting account...' : 'Delete account'}
          </button>
        </div>

        <div>
          <p className="signal-label">Your contributions</p>
          <h2 className="mb-5 mt-3 text-2xl font-black tracking-[-0.05em] text-white">
            Activity
          </h2>
          {nodes.length === 0 ? (
            <div className="panel py-14 text-center text-sm text-[var(--dim)]">
              No contributions yet.{' '}
              <button
                onClick={() => router.push('/')}
                className="text-[var(--signal)] transition-colors hover:text-white"
              >
                Go say something.
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {nodes.map((node) => {
                const lab = LAB_MAP[node.lab as LabId]
                return (
                  <button
                    key={node.id}
                    onClick={() => router.push(`/node/${node.id}`)}
                    className="panel panel-interactive w-full p-5 text-left"
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-2 py-0.5 text-xs"
                        style={{ background: `${lab.color}22`, color: lab.color }}
                      >
                        <LabIcon labId={lab.id} className="h-3.5 w-3.5" />
                        {lab.name}
                      </span>
                      <span className="mono-label">
                        {formatDistanceToNow(new Date(node.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-[var(--muted)]">{node.content}</p>
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <span className="text-[var(--signal)]">Up {node.vote_count}</span>
                      <span className="text-[var(--line)]">/</span>
                      <span className="capitalize text-[var(--dim)]">{node.status}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        {authError ? <p className="text-sm text-red-300">{authError}</p> : null}
        {visitSummaryError ? <p className="text-sm text-red-300">{visitSummaryError}</p> : null}
      </div>
    </div>
  )
}
