'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

import LabIcon from '@/components/LabIcon'
import NodeCard from '@/components/NodeCard'
import PromptCard from '@/components/PromptCard'
import { apiPost } from '@/lib/api'
import { APP_LIMITS } from '@/lib/config'
import { supabase, type Node, type Prompt } from '@/lib/supabase'
import type { NodeReferenceContext } from '@/types/feed'
import { LAB_MAP, isLabId, type LabId } from '@/types'
import { useUser } from '@/hooks/useUser'

type FeedNodeItem = {
  node: Node
  referenceContext?: NodeReferenceContext
}

function previewContent(content: string, maxLength = 140) {
  const normalized = content.replace(/\s+/g, ' ').trim()

  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength).trimEnd()}...`
}

function createParentReferenceContext(node: Node, parentContent?: string): NodeReferenceContext {
  return {
    kind: 'parent_node',
    id: node.parent_node_id!,
    preview: parentContent
      ? previewContent(parentContent)
      : 'Original message unavailable.',
    href: `/node/${node.parent_node_id}`,
    label: 'Replying to',
  }
}

function createPromptReferenceContext(options: {
  node: Pick<Node, 'lab' | 'prompt_id'>
  promptContent?: string | null
  promptLab?: string | null
}): NodeReferenceContext {
  const hasPromptContent = Boolean(options.promptContent?.trim())

  return {
    kind: 'prompt',
    id: options.node.prompt_id!,
    preview: hasPromptContent
      ? previewContent(options.promptContent!)
      : 'This response came from an earlier lab prompt.',
    href: `/lab/${options.promptLab ?? options.node.lab}`,
    label: hasPromptContent ? 'Answering prompt' : 'Answering earlier prompt',
  }
}

async function buildReferenceContexts(nodes: Node[]) {
  const parentNodeIds = Array.from(
    new Set(
      nodes
        .map((node) => node.parent_node_id)
        .filter((value): value is string => Boolean(value))
    )
  )
  const promptIds = Array.from(
    new Set(
      nodes
        .map((node) => node.prompt_id)
        .filter((value): value is string => Boolean(value))
    )
  )

  const [parentNodesResult, promptsResult] = await Promise.all([
    parentNodeIds.length > 0
      ? supabase.from('nodes').select('id, content').in('id', parentNodeIds)
      : Promise.resolve({ data: [], error: null }),
    promptIds.length > 0
      ? supabase.from('prompts').select('id, content, lab').in('id', promptIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (parentNodesResult.error) {
    throw new Error(parentNodesResult.error.message)
  }

  if (promptsResult.error) {
    throw new Error(promptsResult.error.message)
  }

  const parentNodeMap = new Map(
    (parentNodesResult.data ?? []).map((node) => [node.id, node])
  )
  const promptMap = new Map(
    (promptsResult.data ?? []).map((prompt) => [prompt.id, prompt])
  )

  const entries: Array<[string, NodeReferenceContext]> = []

  for (const node of nodes) {
    if (node.parent_node_id) {
      const parentNode = parentNodeMap.get(node.parent_node_id)
      entries.push([
        node.id,
        createParentReferenceContext(node, parentNode?.content),
      ])
      continue
    }

    if (node.prompt_id) {
      const prompt = promptMap.get(node.prompt_id)
      entries.push([
        node.id,
        createPromptReferenceContext({
          node,
          promptContent: prompt?.content,
          promptLab: prompt?.lab,
        }),
      ])
    }
  }

  return new Map<string, NodeReferenceContext>(entries)
}

async function buildFeedItems(nodes: Node[]): Promise<FeedNodeItem[]> {
  const referenceContexts = await buildReferenceContexts(nodes)

  return nodes.map((node) => ({
    node,
    referenceContext: referenceContexts.get(node.id),
  }))
}

async function fetchLabState(labId: LabId) {
  const [nodeResult, promptResult] = await Promise.all([
    supabase
      .from('nodes')
      .select('*')
      .eq('lab', labId)
      .eq('status', 'active')
      .order('vote_count', { ascending: false })
      .limit(APP_LIMITS.feedNodeLimit),
    supabase
      .from('prompts')
      .select('*')
      .eq('lab', labId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (nodeResult.error) {
    throw new Error(nodeResult.error.message)
  }

  if (promptResult.error) {
    throw new Error(promptResult.error.message)
  }

  return {
    nodes: await buildFeedItems(nodeResult.data ?? []),
    prompt: promptResult.data ?? null,
  }
}

export default function LabPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { userId, loading: userLoading } = useUser()

  const labId = params.labId as string
  const lab = useMemo(() => (isLabId(labId) ? LAB_MAP[labId] : null), [labId])

  const [nodes, setNodes] = useState<FeedNodeItem[]>([])
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const handledThought = useRef<string | null>(null)

  async function loadLabState(activeLabId: LabId) {
    setLoading(true)

    try {
      const state = await fetchLabState(activeLabId)
      setNodes(state.nodes)
      setPrompt(state.prompt)
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load the lab.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!lab) {
      router.replace('/')
      return
    }

    let active = true

    void loadLabState(lab.id).then(() => {
      if (!active) {
        return
      }
    })

    return () => {
      active = false
    }
  }, [lab, router])

  useEffect(() => {
    if (!lab) {
      return
    }

    const activeLab = lab
    const thought = searchParams.get('thought')

    if (!thought || !userId || userLoading || handledThought.current === thought) {
      return
    }

    handledThought.current = thought

    async function submitThought() {
      try {
        const response = await apiPost<{ node: Node }>('/api/nodes', {
          content: thought,
          lab: activeLab.id,
        })

        setNodes((current) => [{ node: response.node }, ...current].slice(0, APP_LIMITS.feedNodeLimit))
        void apiPost('/api/embed', { nodeId: response.node.id }).catch(() => undefined)
      } catch (submitError) {
        setError(
          submitError instanceof Error ? submitError.message : 'Failed to add your thought.'
        )
      } finally {
        router.replace(`/lab/${activeLab.id}`)
      }
    }

    void submitThought()
  }, [lab, router, searchParams, userId, userLoading])

  useEffect(() => {
    if (!lab) {
      return
    }

    const activeLab = lab

    const channel = supabase
      .channel(`lab-${activeLab.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'nodes',
          filter: `lab=eq.${activeLab.id}`,
        },
        async (payload) => {
          const insertedNode = payload.new as Node
          let referenceContext: NodeReferenceContext | undefined

          try {
            const referenceContexts = await buildReferenceContexts([insertedNode])
            referenceContext = referenceContexts.get(insertedNode.id)
          } catch {
            referenceContext = undefined
          }

          setNodes((current) => {
            if (current.some((item) => item.node.id === insertedNode.id)) {
              return current
            }

            return [
              {
                node: insertedNode,
                referenceContext,
              },
              ...current,
            ].slice(0, APP_LIMITS.feedNodeLimit)
          })
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [lab])

  async function handlePromptSubmit(content: string, promptId: string) {
    if (!lab) {
      return
    }

    const activePrompt = prompt
    const response = await apiPost<{ node: Node }>('/api/nodes', {
      content,
      lab: lab.id,
      promptId,
    })

    const referenceContext = createPromptReferenceContext({
      node: {
        lab: lab.id,
        prompt_id: promptId,
      } as Pick<Node, 'lab' | 'prompt_id'>,
      promptContent: activePrompt?.content,
      promptLab: lab.id,
    })

    setNodes((current) => [
      {
        node: response.node,
        referenceContext,
      },
      ...current,
    ].slice(0, APP_LIMITS.feedNodeLimit))

    void apiPost('/api/embed', { nodeId: response.node.id }).catch(() => undefined)
    setPrompt(null)
  }

  if (!lab) {
    return null
  }

  return (
    <div className="page-shell">
      <div className="page-intro">
        <div>
          <p className="page-kicker">Live lab feed</p>
          <h1 className="page-title">{lab.name}</h1>
          <p className="page-description">
            Answer the active prompt or react to the strongest ideas already moving through the room.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-3.5 py-2 text-sm font-medium"
            style={{ background: `${lab.color}22`, color: lab.color }}
          >
            <LabIcon labId={lab.id} className="h-4 w-4" />
            {lab.name}
          </span>
          <button
            onClick={() => router.push(`/graph?labs=${lab.id}`)}
            className="ghost-button px-3 py-2 text-xs"
          >
            Open graph
          </button>
        </div>
      </div>

      <div>
        {prompt ? (
          <div>
            <PromptCard prompt={prompt} onSubmit={handlePromptSubmit} />
          </div>
        ) : (
          <section className="panel p-6 sm:p-7">
            <p className="signal-label">AI prompt</p>
            <p className="mt-3 text-lg font-semibold text-white">No active question right now.</p>
            <p className="secondary-copy mt-2 text-sm">
              The feed is still live below, and the next evolution cycle will drop a new prompt in here.
            </p>
          </section>
        )}

        <div className="feed-list mt-6">
          {loading ? (
            <div className="panel py-20 text-center text-[var(--dim)]">Loading the room...</div>
          ) : nodes.length === 0 ? (
            <div className="panel p-12 text-center">
              <p className="text-sm text-[var(--muted)]">The room is quiet.</p>
              <p className="mt-1 text-xs text-[var(--dim)]">Be the first to say something.</p>
            </div>
          ) : (
            nodes.map((item) => (
              <NodeCard
                key={item.node.id}
                node={item.node}
                userId={userId}
                referenceContext={item.referenceContext}
                isAdmin={process.env.NODE_ENV === 'development'}
              />
            ))
          )}
        </div>
        {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
      </div>
    </div>
  )
}
