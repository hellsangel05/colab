'use client'

import { formatDistanceStrict } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'

import { APP_LIMITS } from '@/lib/config'
import { supabase } from '@/lib/supabase'

type EvolutionStatusState = 'idle' | 'counting_down' | 'due_now' | 'just_evolved'

type LatestEvolutionLog = {
  id: string
  ran_at: string
  next_run_at: string | null
}

type EvolutionStatus = {
  latestLog: LatestEvolutionLog | null
  nextRunAt: Date | null
  ranAt: Date | null
  countdownLabel: string
  headline: string
  state: EvolutionStatusState
  progress: number
}

const JUST_EVOLVED_WINDOW_MS = 15_000
const REFRESH_INTERVAL_MS = 30_000
export const EVOLUTION_REFRESH_EVENT = 'colab:evolution-refresh'

async function fetchLatestEvolutionLog() {
  const { data, error } = await supabase
    .from('evolution_log')
    .select('id, ran_at, next_run_at')
    .order('ran_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? null) as LatestEvolutionLog | null
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function useEvolutionStatus(): EvolutionStatus {
  const [latestLog, setLatestLog] = useState<LatestEvolutionLog | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let active = true

    async function refresh() {
      try {
        const latest = await fetchLatestEvolutionLog()
        if (active) {
          setLatestLog(latest)
        }
      } catch {
        if (active) {
          setLatestLog(null)
        }
      }
    }

    void refresh()

    const channel = supabase
      .channel('global-evolution-status')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'evolution_log',
        },
        (payload) => {
          if (!active) {
            return
          }

          setLatestLog(payload.new as LatestEvolutionLog)
          setNow(Date.now())
        }
      )
      .subscribe()

    const refreshInterval = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    const fetchInterval = window.setInterval(() => {
      void refresh()
    }, REFRESH_INTERVAL_MS)

    function handleManualRefresh() {
      setNow(Date.now())
      void refresh()
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        setNow(Date.now())
        void refresh()
      }
    }

    window.addEventListener(EVOLUTION_REFRESH_EVENT, handleManualRefresh)
    window.addEventListener('focus', handleVisibilityChange)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      active = false
      window.clearInterval(refreshInterval)
      window.clearInterval(fetchInterval)
      window.removeEventListener(EVOLUTION_REFRESH_EVENT, handleManualRefresh)
      window.removeEventListener('focus', handleVisibilityChange)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      void supabase.removeChannel(channel)
    }
  }, [])

  return useMemo(() => {
    const nextRunAt = latestLog?.next_run_at ? new Date(latestLog.next_run_at) : null
    const ranAt = latestLog?.ran_at ? new Date(latestLog.ran_at) : null

    if (!latestLog || !nextRunAt || Number.isNaN(nextRunAt.getTime())) {
      return {
        latestLog,
        nextRunAt: null,
        ranAt,
        countdownLabel: '',
        headline: 'Evolution warming up',
        state: 'idle' as const,
        progress: 0,
      }
    }

    const currentTime = now
    const nextRunMs = nextRunAt.getTime()
    const ranAtMs = ranAt?.getTime() ?? nextRunMs - APP_LIMITS.evolutionIntervalMinutes * 60 * 1000

    const justEvolved = ranAt ? currentTime - ranAtMs < JUST_EVOLVED_WINDOW_MS : false
    const dueNow = nextRunMs <= currentTime

    const progress = clamp(
      ((currentTime - ranAtMs) /
        (APP_LIMITS.evolutionIntervalMinutes * 60 * 1000)) *
        100,
      0,
      100
    )

    if (justEvolved) {
      return {
        latestLog,
        nextRunAt,
        ranAt,
        countdownLabel: 'just now',
        headline: 'Evolution just rippled through the network',
        state: 'just_evolved' as const,
        progress: 100,
      }
    }

    if (dueNow) {
      return {
        latestLog,
        nextRunAt,
        ranAt,
        countdownLabel: 'Due now',
        headline: 'Evolution is due',
        state: 'due_now' as const,
        progress: 100,
      }
    }

    return {
      latestLog,
      nextRunAt,
      ranAt,
      countdownLabel: formatDistanceStrict(nextRunAt, currentTime, {
        roundingMethod: 'floor',
      }),
      headline: 'Next evolution in',
      state: 'counting_down' as const,
      progress,
    }
  }, [latestLog, now])
}
