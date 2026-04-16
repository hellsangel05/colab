'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronDown, Home, Menu, Network, UserCircle2, X } from 'lucide-react'

import LabIcon from '@/components/LabIcon'
import { apiPost } from '@/lib/api'
import { EVOLUTION_REFRESH_EVENT, useEvolutionStatus } from '@/hooks/useEvolutionStatus'
import { LAB_MAP, LABS, isLabId } from '@/types'
import type { EvolutionCycleResult } from '@/types/evolution'
import { useUser } from '@/hooks/useUser'

function evolutionStateClasses(state: ReturnType<typeof useEvolutionStatus>['state']) {
  if (state === 'due_now') {
    return 'border-[var(--line-strong)] bg-[rgba(255,216,74,0.12)]'
  }

  if (state === 'just_evolved') {
    return 'border-[rgba(115,216,162,0.35)] bg-[rgba(115,216,162,0.1)]'
  }

  return 'border-[var(--line)] bg-[rgba(5,5,5,0.96)]'
}

export default function AppChrome() {
  const router = useRouter()
  const pathname = usePathname()
  const evolution = useEvolutionStatus()
  const { loading, isAnonymous } = useUser()

  const [labsOpenPath, setLabsOpenPath] = useState<string | null>(null)
  const [mobileOpenPath, setMobileOpenPath] = useState<string | null>(null)
  const [evolving, setEvolving] = useState(false)
  const [evolutionNotice, setEvolutionNotice] = useState<string | null>(null)
  const [evolutionError, setEvolutionError] = useState<string | null>(null)

  const currentLab = useMemo(() => {
    const segments = pathname.split('/').filter(Boolean)
    const candidate = segments[0] === 'lab' ? segments[1] : null

    return candidate && isLabId(candidate) ? LAB_MAP[candidate] : null
  }, [pathname])

  const labsOpen = labsOpenPath === pathname
  const mobileOpen = mobileOpenPath === pathname

  function goHome() {
    setLabsOpenPath(null)
    setMobileOpenPath(null)
    router.push('/')
  }

  function goProfile() {
    setLabsOpenPath(null)
    setMobileOpenPath(null)
    router.push('/profile')
  }

  function goGraph() {
    setLabsOpenPath(null)
    setMobileOpenPath(null)
    router.push('/graph')
  }

  async function handleEvolve() {
    setEvolutionError(null)
    setEvolutionNotice(null)
    setEvolving(true)

    try {
      const response = await apiPost<EvolutionCycleResult>('/api/admin/evolution')

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(EVOLUTION_REFRESH_EVENT))
      }

      if (response.errors.length > 0) {
        setEvolutionNotice('Evolution ran with issues.')
      } else if (response.skipped) {
        setEvolutionNotice(response.reason ?? 'Evolution skipped.')
      } else {
        setEvolutionNotice('Evolution complete.')
      }
    } catch (error) {
      setEvolutionError(
        error instanceof Error ? error.message : 'Evolution request failed.'
      )
    } finally {
      setEvolving(false)
    }
  }

  const graphActive = pathname.startsWith('/graph')
  const evolutionSubline = evolutionError ?? evolutionNotice ?? evolution.headline

  return (
    <div className="sticky top-0 z-[60] border-b border-[var(--line)] bg-[rgba(5,5,5,0.82)] backdrop-blur-2xl">
      <div className={`border-b transition-colors duration-300 ${evolutionStateClasses(evolution.state)}`}>
        <div className="shell flex min-h-[2.6rem] flex-wrap items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <p className="mono-label text-[0.62rem] text-[var(--muted)]">Evolution event</p>
            <p className={`truncate text-sm ${evolutionError ? 'text-red-300' : 'text-white'}`}>
              {evolutionSubline}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.03)] px-3 py-1 text-[0.72rem] text-[var(--muted)]">
              {evolution.state === 'counting_down' ? (
                <>
                  in <span className="font-mono text-white">{evolution.countdownLabel}</span>
                </>
              ) : (
                <span className="font-mono text-white">{evolution.countdownLabel || 'soon'}</span>
              )}
            </div>
            {process.env.NODE_ENV === 'development' ? (
              <button
                onClick={() => void handleEvolve()}
                disabled={evolving}
                className="signal-button px-3 py-1.5 text-[0.68rem] font-medium disabled:cursor-not-allowed disabled:opacity-40"
              >
                {evolving ? 'Evolving...' : 'Evolve'}
              </button>
            ) : null}
          </div>
        </div>
        <div className="h-[2px] w-full bg-white/[0.04]">
          <div
            className={`h-full transition-[width] duration-700 ${
              evolution.state === 'just_evolved' ? 'bg-[var(--positive)]' : 'bg-[var(--signal)]'
            }`}
            style={{ width: `${evolution.progress}%` }}
          />
        </div>
      </div>

      <div className="shell flex items-center justify-between gap-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={goHome}
            className="text-left transition-transform duration-200 hover:-translate-y-[1px]"
            aria-label="Go to home"
          >
            <p className="text-[1.1rem] font-black tracking-[-0.08em] text-white sm:text-[1.35rem]">
              CO-LAB
            </p>
            <p className="hidden text-[0.7rem] text-[var(--dim)] sm:block">
              Collective idea routing
            </p>
          </button>

          {currentLab ? (
            <span
              className="hidden items-center gap-2 rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-medium sm:inline-flex"
              style={{ background: `${currentLab.color}22`, color: currentLab.color }}
            >
              <LabIcon labId={currentLab.id} className="h-3.5 w-3.5" />
              {currentLab.name}
            </span>
          ) : null}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <button onClick={goHome} className="ghost-button px-3 py-2 text-xs">
            Home
          </button>

          <div className="relative">
            <button
              onClick={() => setLabsOpenPath((current) => (current === pathname ? null : pathname))}
              className="ghost-button inline-flex items-center gap-2 px-3 py-2 text-xs"
            >
              Browse labs
              <ChevronDown className="h-3.5 w-3.5" />
            </button>

            {labsOpen ? (
              <div className="menu-panel absolute right-0 top-[calc(100%+0.75rem)] w-[22rem] p-3">
                <div className="menu-grid">
                  {LABS.map((lab) => (
                    <button
                      key={lab.id}
                      onClick={() => {
                        setLabsOpenPath(null)
                        setMobileOpenPath(null)
                        router.push(`/lab/${lab.id}`)
                      }}
                      className="menu-item text-left"
                    >
                      <span
                        className="menu-item-icon"
                        style={{ background: `${lab.color}22`, color: lab.color }}
                      >
                        <LabIcon labId={lab.id} className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-white">{lab.name}</span>
                        <span className="mt-1 block text-xs text-[var(--dim)]">
                          {lab.description}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <button
            onClick={goGraph}
            className={`ghost-button inline-flex items-center gap-2 px-3 py-2 text-xs ${
              graphActive ? 'text-[var(--signal)]' : ''
            }`}
          >
            <Network className="h-3.5 w-3.5" />
            Graph
          </button>

          <button
            onClick={goProfile}
            className="ghost-button inline-flex items-center gap-2 px-3 py-2 text-xs"
          >
            <UserCircle2 className="h-3.5 w-3.5" />
            Profile
          </button>

          <span className="rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-[0.72rem] text-[var(--muted)]">
            {loading ? 'Starting session...' : isAnonymous ? 'Anonymous live' : 'Profile live'}
          </span>
        </div>

        <button
          onClick={() =>
            setMobileOpenPath((current) => (current === pathname ? null : pathname))
          }
          className="ghost-button inline-flex items-center gap-2 px-3 py-2 text-xs md:hidden"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        >
          {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          Menu
        </button>
      </div>

      {mobileOpen ? (
        <div className="shell border-t border-[var(--line)] py-4 md:hidden">
          <div className="space-y-3">
            <button onClick={goHome} className="menu-item w-full text-left">
              <span className="menu-item-icon">
                <Home className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-white">Home</span>
                <span className="mt-1 block text-xs text-[var(--dim)]">
                  Start from the main routing surface
                </span>
              </span>
            </button>

            <button onClick={goGraph} className="menu-item w-full text-left">
              <span className="menu-item-icon">
                <Network className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-white">Graph</span>
                <span className="mt-1 block text-xs text-[var(--dim)]">
                  Open the full all-labs network map
                </span>
              </span>
            </button>

            <button onClick={goProfile} className="menu-item w-full text-left">
              <span className="menu-item-icon">
                <UserCircle2 className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-white">Profile</span>
                <span className="mt-1 block text-xs text-[var(--dim)]">
                  {loading ? 'Starting session...' : isAnonymous ? 'Anonymous live' : 'Claimed profile'}
                </span>
              </span>
            </button>

            <div className="menu-panel p-3">
              <p className="mono-label mb-3">Labs</p>
              <div className="space-y-2">
                {LABS.map((lab) => (
                  <button
                    key={lab.id}
                    onClick={() => {
                      setLabsOpenPath(null)
                      setMobileOpenPath(null)
                      router.push(`/lab/${lab.id}`)
                    }}
                    className="menu-item w-full text-left"
                  >
                    <span
                      className="menu-item-icon"
                      style={{ background: `${lab.color}22`, color: lab.color }}
                    >
                      <LabIcon labId={lab.id} className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-white">{lab.name}</span>
                      <span className="mt-1 block text-xs text-[var(--dim)]">{lab.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
