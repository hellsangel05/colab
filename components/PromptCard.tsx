'use client'

import { useState } from 'react'

import type { Prompt } from '@/lib/supabase'

type Props = {
  prompt: Prompt
  onSubmit: (content: string, promptId: string) => Promise<void>
}

export default function PromptCard({ prompt, onSubmit }: Props) {
  const [openText, setOpenText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    const content = openText.trim()
    if (!content) {
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      await onSubmit(content, prompt.id)
      setSubmitted(true)
      setOpenText('')
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Failed to add your thought.'
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

  if (submitted) {
    return (
      <div className="panel p-7 text-center sm:p-8">
        <p className="text-base text-[var(--muted)]">Your thought is in the room.</p>
        <p className="mt-2 text-sm text-[var(--dim)]">The AI is connecting it now.</p>
      </div>
    )
  }

  return (
    <section className="panel panel-strong overflow-hidden p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {prompt.origin === 'ai' ? (
            <span className="signal-button inline-block px-3 py-1.5 text-[0.64rem] font-medium">
              AI prompt
            </span>
          ) : null}
          <p className="signal-label mt-4">Active question</p>
        </div>
        <p className="max-w-xs text-right text-xs text-[var(--dim)]">
          Answer directly to seed the room, or ignore it and follow the strongest feed thread instead.
        </p>
      </div>
      <p className="reading-copy mt-4 max-w-4xl text-[1.18rem] font-semibold leading-8">
        {prompt.content}
      </p>
      <div className="subtle-section relative mt-6 p-4">
        <textarea
          value={openText}
          onChange={(event) => setOpenText(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Say something..."
          rows={4}
          className="field w-full resize-none px-4 py-3.5 text-sm leading-7"
        />
        <button
          onClick={() => void handleSubmit()}
          disabled={submitting || !openText.trim()}
          className="signal-button absolute bottom-7 right-7 px-4 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-30"
        >
          {submitting ? '...' : 'Add'}
        </button>
      </div>
      <p className="mt-4 text-xs text-[var(--dim)]">
        Press Enter to submit. Use Shift+Enter for a new line.
      </p>
      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
    </section>
  )
}
