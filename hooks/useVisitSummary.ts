'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { apiPost, apiRequest } from '@/lib/api'
import type { VisitSummaryResponse } from '@/types/visit-summary'

type UseVisitSummaryOptions = {
  enabled: boolean
  limit: number
}

type UseVisitSummaryState = {
  summary: VisitSummaryResponse | null
  loading: boolean
  error: string | null
}

export function useVisitSummary({ enabled, limit }: UseVisitSummaryOptions) {
  const [state, setState] = useState<UseVisitSummaryState>({
    summary: null,
    loading: enabled,
    error: null,
  })
  const activeRequest = useRef(0)

  const load = useCallback(async () => {
    if (!enabled) {
      setState({
        summary: null,
        loading: false,
        error: null,
      })
      return null
    }

    const requestId = activeRequest.current + 1
    activeRequest.current = requestId
    setState((current) => ({
      ...current,
      loading: true,
      error: null,
    }))

    try {
      const summary = await apiRequest<VisitSummaryResponse>(
        `/api/visit-summary?limit=${limit}`
      )

      if (activeRequest.current !== requestId) {
        return null
      }

      setState({
        summary,
        loading: false,
        error: null,
      })
      return summary
    } catch (error) {
      if (activeRequest.current !== requestId) {
        return null
      }

      setState({
        summary: null,
        loading: false,
        error:
          error instanceof Error ? error.message : 'Unable to load your visit summary.',
      })
      return null
    }
  }, [enabled, limit])

  const markRead = useCallback(
    async (
      seenThrough: string,
      options: {
        clearLocal?: boolean
      } = {}
    ) => {
      if (!enabled) {
        return null
      }

      const { clearLocal = true } = options

      const response = await apiPost<{
        success: true
        lastVisitSummarySeenAt: string
      }>('/api/visit-summary/read', {
        seenThrough,
      })

      setState((current) =>
        current.summary
          ? {
              ...current,
              summary: {
                ...current.summary,
                since: response.lastVisitSummarySeenAt,
                unread: false,
                counts: clearLocal
                  ? {
                      replies: 0,
                      aiConnections: 0,
                    }
                  : current.summary.counts,
                items: clearLocal ? [] : current.summary.items,
                remainingCount: clearLocal ? 0 : current.summary.remainingCount,
              },
            }
          : current
      )

      return response
    },
    [enabled]
  )

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load()
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [load])

  return {
    ...state,
    reload: load,
    markRead,
  }
}
