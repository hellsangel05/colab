'use client'

import { useEffect, useState } from 'react'

import { APP_LIMITS } from '@/lib/config'
import { supabase, type Node } from '@/lib/supabase'
import { LAB_MAP, type LabId } from '@/types'

type Props = {
  className?: string
}

type TickerNode = Pick<Node, 'id' | 'content' | 'lab' | 'created_at'>

export default function RecentTicker({ className }: Props) {
  const [nodes, setNodes] = useState<TickerNode[]>([])

  useEffect(() => {
    let mounted = true

    async function loadNodes() {
      const { data } = await supabase
        .from('nodes')
        .select('id, content, lab, created_at')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(APP_LIMITS.tickerNodeLimit)

      if (mounted && data) {
        setNodes(data as TickerNode[])
      }
    }

    void loadNodes()

    const channel = supabase
      .channel('landing-ticker')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'nodes',
        },
        (payload) => {
          setNodes((current) => {
            if (current.some((node) => node.id === payload.new.id)) {
              return current
            }

            return [payload.new as TickerNode, ...current].slice(0, APP_LIMITS.tickerNodeLimit)
          })
        }
      )
      .subscribe()

    return () => {
      mounted = false
      void supabase.removeChannel(channel)
    }
  }, [])

  if (nodes.length === 0) {
    return null
  }

  const items = [...nodes, ...nodes]

  return (
    <div className={className}>
      <div className="panel flex items-center gap-3 overflow-hidden rounded-full px-3 py-2.5">
        <span className="signal-button px-3 py-1 text-[10px] font-medium">
          Live Signal
        </span>
        <div className="ticker-mask min-w-0 flex-1">
          <div className="ticker-track flex min-w-max items-center gap-6">
            {items.map((node, index) => {
              const lab = LAB_MAP[node.lab as LabId]
              return (
                <div
                  key={`${node.id}-${index}`}
                  className="flex items-center gap-2 text-xs text-[var(--muted)]"
                >
                  <span
                    className="rounded-full border border-[var(--line)] px-2 py-0.5"
                    style={{ background: `${lab.color}22`, color: lab.color }}
                  >
                    {lab.name}
                  </span>
                  <span className="max-w-[24rem] truncate">{node.content}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
