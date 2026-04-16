'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Props = {
  nodeId: string
}

export default function RoomIndicator({ nodeId }: Props) {
  const router = useRouter()
  const [rooms, setRooms] = useState<{ id: string; title: string }[]>([])

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('project_rooms')
        .select('id, title')
        .eq('origin_node_id', nodeId)
        .eq('status', 'open')
      if (data) setRooms(data)
    }
    load()
  }, [nodeId])

  if (rooms.length === 0) return null

  return (
    <button
      onClick={() => router.push(`/room/${rooms[0].id}`)}
      className="action-chip text-[var(--signal)]"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--signal)] animate-pulse" />
      {rooms.length === 1 ? '1 room open' : `${rooms.length} rooms open`}
    </button>
  )
}
