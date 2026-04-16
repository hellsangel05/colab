'use client'

import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'

type UseUserState = {
  loading: boolean
  user: User | null
  session: Session | null
  userId: string
  email: string | null
  isAnonymous: boolean
  error: string | null
}

function normalizeAuthError(message: string) {
  const lower = message.toLowerCase()

  if (
    lower.includes('anonymous') ||
    lower.includes('signups not allowed') ||
    lower.includes('signup')
  ) {
    return 'Anonymous sign-in is failing. Enable anonymous auth in your Supabase project, or check whether signups are disabled.'
  }

  return message
}

export function useUser() {
  const [state, setState] = useState<UseUserState>({
    loading: true,
    user: null,
    session: null,
    userId: '',
    email: null,
    isAnonymous: true,
    error: null,
  })

  useEffect(() => {
    let mounted = true

    async function ensureSession() {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession()

      if (sessionError) {
        if (mounted) {
          setState((current) => ({
            ...current,
            loading: false,
            error: normalizeAuthError(sessionError.message),
          }))
        }
        return
      }

      if (!sessionData.session) {
        const { data: anonymousData, error: anonymousError } =
          await supabase.auth.signInAnonymously()

        if (anonymousError) {
          if (mounted) {
            setState((current) => ({
              ...current,
              loading: false,
              error: normalizeAuthError(anonymousError.message),
            }))
          }
          return
        }

        if (mounted) {
          const session = anonymousData.session
          setState({
            loading: false,
            user: session?.user ?? null,
            session,
            userId: session?.user.id ?? '',
            email: session?.user.email ?? null,
            isAnonymous: session?.user.is_anonymous ?? true,
            error: null,
          })
        }

        return
      }

      if (mounted) {
        setState({
          loading: false,
          user: sessionData.session.user,
          session: sessionData.session,
          userId: sessionData.session.user.id,
          email: sessionData.session.user.email ?? null,
          isAnonymous: sessionData.session.user.is_anonymous ?? true,
          error: null,
        })
      }
    }

    void ensureSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) {
        return
      }

      setState({
        loading: false,
        user: session?.user ?? null,
        session,
        userId: session?.user.id ?? '',
        email: session?.user.email ?? null,
        isAnonymous: session?.user.is_anonymous ?? true,
        error: null,
      })
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return state
}
