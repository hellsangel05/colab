'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import LabIcon from '@/components/LabIcon'
import RecentTicker from '@/components/RecentTicker'
import VisitSummaryCard from '@/components/VisitSummaryCard'
import { useVisitSummary } from '@/hooks/useVisitSummary'
import { LABS } from '@/types'
import { useUser } from '@/hooks/useUser'

export default function Home() {
  const router = useRouter()
  const { loading: authLoading, error: authError, userId } = useUser()

  const [thought, setThought] = useState('')
  const [classifying, setClassifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dismissedSummaryUntil, setDismissedSummaryUntil] = useState<string | null>(null)
  const [summaryDismissError, setSummaryDismissError] = useState<string | null>(null)
  const visitSummary = useVisitSummary({
    enabled: Boolean(userId) && !authLoading && !authError,
    limit: 5,
  })

  useEffect(() => {
    if (visitSummary.summary?.until && visitSummary.summary.until !== dismissedSummaryUntil) {
      setSummaryDismissError(null)
    }
  }, [dismissedSummaryUntil, visitSummary.summary?.until])

  async function handleSubmit() {
    const trimmedThought = thought.trim()
    if (!trimmedThought || authLoading) {
      return
    }

    setClassifying(true)
    setError(null)

    try {
      const response = await fetch('/api/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmedThought }),
      })
      const data = (await response.json()) as { lab?: string }
      const lab = data.lab ?? 'chaos'
      router.push(`/lab/${lab}?thought=${encodeURIComponent(trimmedThought)}`)
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Classification failed.'
      )
      router.push(`/lab/chaos?thought=${encodeURIComponent(trimmedThought)}`)
    } finally {
      setClassifying(false)
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSubmit()
    }
  }

  async function handleDismissSummary() {
    if (!visitSummary.summary) {
      return
    }

    setSummaryDismissError(null)

    try {
      await visitSummary.markRead(visitSummary.summary.until)
      setDismissedSummaryUntil(visitSummary.summary.until)
    } catch (dismissError) {
      setSummaryDismissError(
        dismissError instanceof Error
          ? dismissError.message
          : 'Unable to mark this summary as seen.'
      )
    }
  }

  const showVisitSummary =
    visitSummary.summary?.unread &&
    visitSummary.summary.items.length > 0 &&
    visitSummary.summary.until !== dismissedSummaryUntil

  return (
    <main className="page-shell">
      <div className="mx-auto flex flex-col">
        <RecentTicker className="mb-5 sm:mb-6" />

        {showVisitSummary && visitSummary.summary ? (
          <div className="mb-6 sm:mb-7">
            <VisitSummaryCard
              summary={visitSummary.summary}
              variant="compact"
              onDismiss={() => void handleDismissSummary()}
            />
            {summaryDismissError ? (
              <p className="mt-3 text-sm text-red-300">{summaryDismissError}</p>
            ) : null}
          </div>
        ) : null}

        <section className="panel panel-strong relative overflow-hidden px-6 py-8 sm:px-9 sm:py-10 lg:px-12 lg:py-12">
          <div className="absolute inset-y-0 right-0 hidden w-[38%] border-l border-[var(--line)] bg-[linear-gradient(180deg,rgba(255,216,74,0.08),transparent)] xl:block" />
          <div className="absolute -right-10 top-4 hidden text-[7rem] font-black leading-none tracking-[-0.08em] text-white/[0.03] xl:block">
            CO-LAB
          </div>
          <div className="absolute bottom-0 right-10 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(255,216,74,0.18),transparent_68%)] blur-3xl" />

          <div className="relative z-10 grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_320px] xl:items-end">
            <div>
              <p className="signal-label">Collective idea routing</p>
              <div className="mt-6 flex flex-wrap gap-2.5">
                <span className="ghost-button px-3 py-1 text-[11px]">Anonymous by default</span>
                <span className="ghost-button px-3 py-1 text-[11px]">Nine live labs</span>
                <span className="ghost-button px-3 py-1 text-[11px]">Realtime threads</span>
              </div>
              <h1 className="mt-8 max-w-4xl text-[clamp(3.75rem,11vw,6.5rem)] font-black leading-[0.88] tracking-[-0.08em] text-white">
                CO-LAB
              </h1>
              <p className="secondary-copy mt-5 max-w-2xl text-base sm:text-lg">
                Start with one sharp thought. Co-Lab routes it into the right lab,
                opens the thread, and lets the network build on it together.
              </p>

              <div className="writing-surface mt-8 overflow-hidden p-5 sm:p-6">
                <p className="mono-label mb-4">Start here</p>
                <textarea
                  value={thought}
                  onChange={(event) => setThought(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Start with the sharpest version of the thought."
                  rows={5}
                  autoFocus
                  className="w-full resize-none bg-transparent text-lg leading-8 text-white focus:outline-none sm:text-xl"
                />
                <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--line)] pt-5">
                  <p className="max-w-sm text-xs leading-relaxed text-[var(--dim)]">
                    Press Enter to route it. Shift+Enter adds a new line.
                  </p>
                  <button
                    onClick={() => void handleSubmit()}
                    disabled={classifying || authLoading || !thought.trim()}
                    className="signal-button px-5 py-3 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {classifying ? 'Routing...' : 'Route thought'}
                  </button>
                </div>
              </div>

              {error || authError || visitSummary.error ? (
                <p className="mt-5 text-sm text-red-300">
                  {error ?? authError ?? visitSummary.error}
                </p>
              ) : null}
            </div>

            <aside className="space-y-4">
              <div className="panel p-5">
                <p className="mono-label">Session status</p>
                <p className="secondary-copy mt-3 text-sm">
                  {authLoading
                    ? 'Starting your anonymous workspace.'
                    : 'Anonymous access is live. No account needed to begin.'}
                </p>
                <div className="stat-strip mt-6 border-t border-[var(--line)] pt-4">
                  {[
                    ['Labs', `${LABS.length} live routes`],
                    ['Threads', 'Replies update in place'],
                    ['Rooms', 'Spin up collaboration fast'],
                  ].map(([label, value]) => (
                    <div key={label} className="stat-row">
                      <span className="mono-label">{label}</span>
                      <span className="max-w-[10rem] text-right text-sm text-white">
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel p-5">
                <p className="mono-label">How it moves</p>
                <div className="mt-5 space-y-4">
                  {[
                    ['01', 'Route', 'The classifier sends the idea to the lab that fits best.'],
                    ['02', 'React', 'Votes, replies, and rooms turn single thoughts into live threads.'],
                    ['03', 'Connect', 'Embeddings stitch related nodes into a visible graph.'],
                  ].map(([index, title, copy]) => (
                    <div key={index} className="border-t border-[var(--line)] pt-4 first:border-t-0 first:pt-0">
                      <div className="flex items-center gap-3">
                        <span className="mono-label">{index}</span>
                        <h3 className="text-sm font-semibold text-white">{title}</h3>
                      </div>
                      <p className="secondary-copy mt-2 text-sm">{copy}</p>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_360px]">
          <div className="panel p-6 sm:p-7">
            <div className="page-intro mb-6">
              <div>
                <p className="signal-label">Browse labs</p>
                <h2 className="page-title text-[2rem] sm:text-[2.3rem]">Pick the room that fits</h2>
                <p className="page-description max-w-2xl">
                  Every lab is visible at launch. Jump straight into the lab that matches your idea,
                  or wander until the right angle clicks.
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {LABS.map((lab) => (
                <button
                  key={lab.id}
                  onClick={() => router.push(`/lab/${lab.id}`)}
                  className="panel panel-interactive w-full p-5 text-left"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div
                      className="inline-flex rounded-full border border-[var(--line)] p-2.5"
                      style={{ background: `${lab.color}22`, color: lab.color }}
                    >
                      <LabIcon labId={lab.id} className="h-4 w-4" />
                    </div>
                    <span className="mono-label">Open</span>
                  </div>
                  <h3 className="mt-5 text-xl font-semibold text-white">{lab.name}</h3>
                  <p className="secondary-copy mt-2 text-sm">{lab.description}</p>
                </button>
              ))}
            </div>
          </div>

          <aside className="space-y-6">
            <div className="panel p-6">
              <p className="signal-label">Launch note</p>
              <h3 className="mt-3 text-2xl font-black tracking-[-0.05em] text-white">
                One input, one route, one thread.
              </h3>
              <p className="secondary-copy mt-3 text-sm">
                The fastest way to understand Co-Lab is to drop in a real thought and
                watch the feed, graph, and room mechanics spin up around it.
              </p>
            </div>

            <div className="panel p-6">
              <p className="signal-label">Best first move</p>
              <p className="secondary-copy mt-3 text-sm">
                Start specific. Short, direct prompts tend to route better than broad summaries.
              </p>
              <button
                onClick={() => router.push('/lab/chaos')}
                className="ghost-button mt-5 px-4 py-2 text-xs text-[var(--signal)]"
              >
                Explore a live lab
              </button>
            </div>
          </aside>
        </section>
      </div>
    </main>
  )
}
