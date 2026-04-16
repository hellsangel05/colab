'use client'

import { supabase } from '@/lib/supabase'

type ApiRequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function apiRequest<T>(
  input: string,
  options: ApiRequestOptions = {}
) {
  const headers = new Headers(options.headers)
  const { data } = await supabase.auth.getSession()

  if (data.session?.access_token) {
    headers.set('Authorization', `Bearer ${data.session.access_token}`)
  }

  let body = options.body
  if (body !== undefined && !(body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(body)
  }

  const response = await fetch(input, {
    ...options,
    headers,
    body: body as BodyInit | null | undefined,
  })

  const contentType = response.headers.get('content-type')
  const payload = contentType?.includes('application/json')
    ? ((await response.json()) as T & { error?: string })
    : null

  if (!response.ok) {
    throw new ApiError(
      payload?.error ?? `Request failed with status ${response.status}.`,
      response.status
    )
  }

  return payload as T
}

export async function apiPost<T>(input: string, body?: unknown) {
  return apiRequest<T>(input, {
    method: 'POST',
    body,
  })
}

export async function apiPatch<T>(input: string, body?: unknown) {
  return apiRequest<T>(input, {
    method: 'PATCH',
    body,
  })
}

export async function apiDelete<T>(input: string, body?: unknown) {
  return apiRequest<T>(input, {
    method: 'DELETE',
    body,
  })
}
