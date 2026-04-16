'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import ReactFlow, {
  Background,
  BaseEdge,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlowProvider,
  getBezierPath,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from 'reactflow'
import 'reactflow/dist/style.css'

import LabIcon from '@/components/LabIcon'
import { supabase, type Edge as EdgeRecord, type Node as NodeRecord } from '@/lib/supabase'
import {
  LABS,
  LAB_MAP,
  RELATIONSHIP_COLORS,
  RELATIONSHIP_TYPES,
  type LabId,
  isLabId,
} from '@/types'

type GraphNodeData = {
  id: string
  labId: LabId
  content: string
  isAi: boolean
  selected: boolean
  connected: boolean
  dimmed: boolean
  bridge: boolean
  connectionScore: number
}

type GraphEdgeData = {
  edgeId: string
  primaryColor: string
  haloColor: string
  strokeWidth: number
  haloWidth: number
  opacity: number
  crossLab: boolean
  selected: boolean
  hovered: boolean
  dimmed: boolean
  animated: boolean
  confidencePercent: number
  relationshipType: string
  sourceLab: LabId
  targetLab: LabId
}

type ConnectionDetail = {
  edge: EdgeRecord
  node: NodeRecord
  confidence: number
}

type EdgeDetail = {
  edge: EdgeRecord
  sourceNode: NodeRecord
  targetNode: NodeRecord
  confidence: number
}

type LayoutPoint = {
  x: number
  y: number
}

type GraphBuildResult = {
  reactNodes: Node<GraphNodeData>[]
  reactEdges: Edge<GraphEdgeData>[]
  visibleNodeCount: number
  visibleEdgeCount: number
  crossLabPathCount: number
}

const GRAPH_NODE_LIMIT = 720
const LAB_NODE_CAP = 36
const SELECTED_NEIGHBOR_CAP = 18
const CROSS_LAB_EDGE_FETCH_LIMIT = 180
const CROSS_LAB_VISIBLE_EDGE_CAP = 48
const NODE_WIDTH = 244
const NODE_HEIGHT = 152
const MAP_WIDTH = 2640
const MAP_HEIGHT = 1880
const DISTRICT_RADIUS_X = 250
const DISTRICT_RADIUS_Y = 220
const LAYOUT_ITERATIONS = 22

const DISTRICT_ANCHORS: Record<LabId, LayoutPoint> = {
  startup: { x: 360, y: 360 },
  story: { x: 1220, y: 270 },
  problem: { x: 2210, y: 410 },
  music: { x: 560, y: 960 },
  invention: { x: 1370, y: 920 },
  marketing: { x: 2220, y: 920 },
  popculture: { x: 390, y: 1500 },
  research: { x: 1290, y: 1570 },
  chaos: { x: 2250, y: 1450 },
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function previewContent(content: string, maxLength = 160) {
  const normalized = content.replace(/\s+/g, ' ').trim()
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1).trimEnd()}...`
    : normalized
}

function parseRequestedLabIds(raw: string | null) {
  if (!raw) {
    return LABS.map((lab) => lab.id)
  }

  const requested = raw
    .split(',')
    .map((value) => value.trim())
    .filter(isLabId)

  return requested.length > 0 ? requested : LABS.map((lab) => lab.id)
}

function hashString(value: string) {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return Math.abs(hash >>> 0)
}

function randomFromSeed(seed: number) {
  return ((seed % 10000) + 1) / 10001
}

function normalizeConfidence(
  confidence: number,
  minConfidence: number,
  maxConfidence: number
) {
  if (Number.isNaN(confidence)) {
    return 0.35
  }

  if (maxConfidence <= minConfidence) {
    return clamp(confidence, 0, 1)
  }

  return clamp((confidence - minConfidence) / (maxConfidence - minConfidence), 0, 1)
}

function computeNodeScoreMap(nodes: NodeRecord[], edges: EdgeRecord[]) {
  const confidenceValues = edges.map((edge) => edge.confidence_score)
  const minConfidence = confidenceValues.length > 0 ? Math.min(...confidenceValues) : 0
  const maxConfidence = confidenceValues.length > 0 ? Math.max(...confidenceValues) : 1
  const scores = new Map<string, number>()

  nodes.forEach((node) => {
    scores.set(node.id, node.vote_count * 0.16)
  })

  edges.forEach((edge) => {
    const strength = normalizeConfidence(edge.confidence_score, minConfidence, maxConfidence)
    const weight = 0.8 + strength * 2.8 + (edge.is_cross_lab ? 0.7 : 0)

    scores.set(edge.source_node_id, (scores.get(edge.source_node_id) ?? 0) + weight)
    scores.set(edge.target_node_id, (scores.get(edge.target_node_id) ?? 0) + weight)
  })

  return scores
}

function getDistrictAnchor(labId: LabId) {
  return DISTRICT_ANCHORS[labId]
}

function createDistrictSeedPosition(node: NodeRecord, nodeScore: number) {
  const anchor = getDistrictAnchor(node.lab as LabId)
  const angleSeed = randomFromSeed(hashString(`${node.id}-angle`))
  const radiusSeed = randomFromSeed(hashString(`${node.id}-radius`))
  const scoreBias = clamp(nodeScore / 8, 0, 1)
  const angle = angleSeed * Math.PI * 2
  const radiusScale = 0.34 + radiusSeed * 0.66
  const radiusX = 48 + radiusScale * DISTRICT_RADIUS_X * (0.92 - scoreBias * 0.28)
  const radiusY = 42 + radiusScale * DISTRICT_RADIUS_Y * (0.92 - scoreBias * 0.28)

  return {
    x: anchor.x + Math.cos(angle) * radiusX,
    y: anchor.y + Math.sin(angle) * radiusY,
  }
}

function clampPointToDistrict(point: LayoutPoint, labId: LabId) {
  const anchor = getDistrictAnchor(labId)
  const dx = point.x - anchor.x
  const dy = point.y - anchor.y
  const ellipseValue =
    (dx * dx) / (DISTRICT_RADIUS_X * DISTRICT_RADIUS_X) +
    (dy * dy) / (DISTRICT_RADIUS_Y * DISTRICT_RADIUS_Y)

  if (ellipseValue <= 1) {
    return point
  }

  const scale = 1 / Math.sqrt(ellipseValue)

  return {
    x: anchor.x + dx * scale,
    y: anchor.y + dy * scale,
  }
}

function createDistrictLayout(
  nodes: NodeRecord[],
  nodeScoreMap: Map<string, number>
) {
  const positions = new Map<string, LayoutPoint>()
  const deltas = new Map<string, LayoutPoint>()

  nodes.forEach((node) => {
    positions.set(node.id, createDistrictSeedPosition(node, nodeScoreMap.get(node.id) ?? 0))
    deltas.set(node.id, { x: 0, y: 0 })
  })

  for (let iteration = 0; iteration < LAYOUT_ITERATIONS; iteration += 1) {
    nodes.forEach((node) => {
      const current = positions.get(node.id)!
      const anchor = getDistrictAnchor(node.lab as LabId)

      deltas.set(node.id, {
        x: (anchor.x - current.x) * 0.04,
        y: (anchor.y - current.y) * 0.04,
      })
    })

    for (let firstIndex = 0; firstIndex < nodes.length; firstIndex += 1) {
      const first = nodes[firstIndex]
      const firstPosition = positions.get(first.id)!

      for (let secondIndex = firstIndex + 1; secondIndex < nodes.length; secondIndex += 1) {
        const second = nodes[secondIndex]
        const secondPosition = positions.get(second.id)!
        const dx = secondPosition.x - firstPosition.x
        const dy = secondPosition.y - firstPosition.y
        const distanceSquared = Math.max(dx * dx + dy * dy, 1)
        const distance = Math.sqrt(distanceSquared)
        const sameLab = first.lab === second.lab
        const threshold = sameLab ? 168 : 132

        if (distance > threshold) {
          continue
        }

        const nx = dx / distance
        const ny = dy / distance
        const repulsion = ((threshold - distance) / threshold) * (sameLab ? 28 : 12)
        const firstDelta = deltas.get(first.id)!
        const secondDelta = deltas.get(second.id)!

        firstDelta.x -= nx * repulsion
        firstDelta.y -= ny * repulsion
        secondDelta.x += nx * repulsion
        secondDelta.y += ny * repulsion
      }
    }

    nodes.forEach((node) => {
      const current = positions.get(node.id)!
      const delta = deltas.get(node.id)!
      const nextPoint = {
        x: clamp(current.x + clamp(delta.x, -20, 20), 140, MAP_WIDTH - 140),
        y: clamp(current.y + clamp(delta.y, -20, 20), 140, MAP_HEIGHT - 140),
      }

      positions.set(node.id, clampPointToDistrict(nextPoint, node.lab as LabId))
    })
  }

  return positions
}

function GraphNodeCard({ data }: NodeProps<GraphNodeData>) {
  const lab = LAB_MAP[data.labId]

  return (
    <div
      className={`graph-node-card w-[15.25rem] rounded-[22px] border p-4 shadow-[0_18px_40px_rgba(0,0,0,0.3)] transition-all ${
        data.selected
          ? 'border-[var(--line-strong)] bg-[rgba(18,18,18,0.99)]'
          : data.connected
            ? 'border-[rgba(255,255,255,0.12)] bg-[rgba(12,12,12,0.95)]'
            : 'border-[rgba(255,255,255,0.08)] bg-[rgba(10,10,10,0.88)]'
      }`}
      style={{
        opacity: data.dimmed ? 0.4 : 1,
        transform: data.selected ? 'scale(1.02)' : undefined,
        boxShadow: data.selected
          ? `0 0 0 1px ${lab.color}88, 0 20px 52px rgba(0, 0, 0, 0.44)`
          : data.connected
            ? `0 12px 34px ${lab.color}20`
            : data.bridge
              ? `0 12px 32px ${lab.color}18`
              : undefined,
      }}
    >
      <div
        className="graph-node-card-aura"
        style={{
          background: `radial-gradient(circle at top, ${lab.color}30, transparent 62%)`,
          opacity: data.selected ? 0.9 : data.connected || data.bridge ? 0.62 : 0.34,
        }}
      />
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !bg-[var(--signal)]" />
      <div className="flex items-center justify-between gap-3">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-2.5 py-1 text-[0.68rem]"
          style={{ background: `${lab.color}22`, color: lab.color }}
        >
          <LabIcon labId={lab.id} className="h-3.5 w-3.5" />
          {lab.name}
        </span>
        {data.isAi ? (
          <span className="signal-button px-2.5 py-1 text-[0.56rem] font-medium">AI</span>
        ) : null}
      </div>
      <p className="mt-3 text-[0.68rem] uppercase tracking-[0.2em] text-[var(--dim)]">
        {data.selected
          ? 'Tracing paths'
          : data.connected
            ? 'Connected node'
            : data.bridge
              ? 'Bridge point'
              : data.connectionScore > 2.3
              ? 'Bridge point'
              : 'Network node'}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-[var(--text)]">
        {previewContent(data.content, data.selected ? 180 : 120)}
      </p>
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-[var(--signal)]" />
    </div>
  )
}

function TraceEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<GraphEdgeData>) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: data?.crossLab ? 0.34 : 0.2,
  })

  if (!data) {
    return <BaseEdge id={id} path={path} />
  }

  return (
    <>
      <BaseEdge
        id={`${id}-interaction`}
        path={path}
        interactionWidth={Math.max(data.strokeWidth + 24, 28)}
        style={{
          stroke: 'transparent',
          strokeWidth: Math.max(data.strokeWidth + 24, 28),
          opacity: 1,
          cursor: 'pointer',
        }}
      />
      <BaseEdge
        id={`${id}-halo`}
        path={path}
        style={{
          stroke: data.haloColor,
          strokeWidth: data.haloWidth,
          opacity: data.opacity * (data.selected ? 0.82 : data.hovered ? 0.56 : 0.32),
          strokeLinecap: 'round',
          filter: data.selected || data.hovered ? 'drop-shadow(0 0 18px rgba(255,216,74,0.45))' : undefined,
          strokeDasharray: data.animated ? '12 16' : undefined,
          animation: data.animated ? 'graph-edge-flow 8s linear infinite' : undefined,
        }}
      />
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: data.primaryColor,
          strokeWidth: data.strokeWidth,
          opacity: data.opacity,
          strokeLinecap: 'round',
          filter:
            data.selected || data.hovered
              ? 'drop-shadow(0 0 14px rgba(255,255,255,0.24))'
              : undefined,
          strokeDasharray: data.animated ? '12 16' : undefined,
          animation: data.animated ? 'graph-edge-flow 8s linear infinite' : undefined,
        }}
      />
    </>
  )
}

const nodeTypes = {
  colabNode: GraphNodeCard,
}

const edgeTypes = {
  trace: TraceEdge,
}

function buildGraphElements(options: {
  graphNodes: NodeRecord[]
  graphEdges: EdgeRecord[]
  visibleLabIds: Set<LabId>
  selectedNodeId: string | null
  selectedEdgeId: string | null
  hoveredEdgeId: string | null
  activeRelationships: Set<string>
  showCrossLab: boolean
}): GraphBuildResult {
  const filteredEdges = options.graphEdges.filter((edge) => {
    if (!options.activeRelationships.has(edge.relationship_type)) {
      return false
    }

    if (!options.showCrossLab && edge.is_cross_lab) {
      return false
    }

    return true
  })

  const nodeScoreMap = computeNodeScoreMap(options.graphNodes, filteredEdges)
  const selectedEdgeIds = new Set<string>()
  const selectedNeighborIds = new Set<string>()
  const highlightedNodeIds = new Set<string>()
  const bridgeNodeIds = new Set<string>()

  if (options.selectedNodeId) {
    filteredEdges
      .filter(
        (edge) =>
          edge.source_node_id === options.selectedNodeId ||
          edge.target_node_id === options.selectedNodeId
      )
      .sort((left, right) => right.confidence_score - left.confidence_score)
      .slice(0, SELECTED_NEIGHBOR_CAP)
      .forEach((edge) => {
        selectedEdgeIds.add(edge.id)
        selectedNeighborIds.add(edge.source_node_id)
        selectedNeighborIds.add(edge.target_node_id)
        highlightedNodeIds.add(edge.source_node_id)
        highlightedNodeIds.add(edge.target_node_id)
      })

    highlightedNodeIds.add(options.selectedNodeId)
  }

  if (options.selectedEdgeId) {
    const selectedEdge = filteredEdges.find((edge) => edge.id === options.selectedEdgeId)
    if (selectedEdge) {
      selectedEdgeIds.add(selectedEdge.id)
      highlightedNodeIds.add(selectedEdge.source_node_id)
      highlightedNodeIds.add(selectedEdge.target_node_id)
    }
  }

  const visibleIds = new Set<string>()

  LABS.forEach((lab) => {
    if (!options.visibleLabIds.has(lab.id)) {
      return
    }

    options.graphNodes
      .filter((node) => node.lab === lab.id)
      .sort((left, right) => {
        const scoreDelta = (nodeScoreMap.get(right.id) ?? 0) - (nodeScoreMap.get(left.id) ?? 0)
        if (scoreDelta !== 0) {
          return scoreDelta
        }

        const voteDelta = right.vote_count - left.vote_count
        if (voteDelta !== 0) {
          return voteDelta
        }

        return new Date(right.last_active_at).getTime() - new Date(left.last_active_at).getTime()
      })
      .slice(0, LAB_NODE_CAP)
      .forEach((node) => visibleIds.add(node.id))
  })

  filteredEdges
    .filter(
      (edge) =>
        edge.is_cross_lab &&
        options.visibleLabIds.has(edge.source_lab as LabId) &&
        options.visibleLabIds.has(edge.target_lab as LabId)
    )
    .sort((left, right) => right.confidence_score - left.confidence_score)
    .slice(0, CROSS_LAB_VISIBLE_EDGE_CAP)
    .forEach((edge) => {
      visibleIds.add(edge.source_node_id)
      visibleIds.add(edge.target_node_id)
      bridgeNodeIds.add(edge.source_node_id)
      bridgeNodeIds.add(edge.target_node_id)
    })

  if (options.selectedNodeId) {
    visibleIds.add(options.selectedNodeId)
  }

  selectedNeighborIds.forEach((nodeId) => visibleIds.add(nodeId))

  const visibleNodes = options.graphNodes.filter(
    (node) => visibleIds.has(node.id) && options.visibleLabIds.has(node.lab as LabId)
  )
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id))
  const visibleEdges = filteredEdges.filter(
    (edge) => visibleNodeIds.has(edge.source_node_id) && visibleNodeIds.has(edge.target_node_id)
  )
  const confidenceValues = visibleEdges.map((edge) => edge.confidence_score)
  const minConfidence = confidenceValues.length > 0 ? Math.min(...confidenceValues) : 0
  const maxConfidence = confidenceValues.length > 0 ? Math.max(...confidenceValues) : 1
  const positions = createDistrictLayout(visibleNodes, nodeScoreMap)
  const hasNodeSelection = Boolean(options.selectedNodeId)
  const hasEdgeSelection = Boolean(options.selectedEdgeId)
  const hasSelection = hasNodeSelection || hasEdgeSelection

  const reactNodes: Node<GraphNodeData>[] = visibleNodes.map((node) => {
    const center =
      positions.get(node.id) ?? createDistrictSeedPosition(node, nodeScoreMap.get(node.id) ?? 0)
    const connected =
      (node.id !== options.selectedNodeId && selectedNeighborIds.has(node.id)) ||
      (hasEdgeSelection && highlightedNodeIds.has(node.id) && node.id !== options.selectedNodeId)
    const dimmed =
      hasSelection &&
      node.id !== options.selectedNodeId &&
      !selectedNeighborIds.has(node.id) &&
      !highlightedNodeIds.has(node.id)

    return {
      id: node.id,
      type: 'colabNode',
      position: {
        x: center.x - NODE_WIDTH / 2,
        y: center.y - NODE_HEIGHT / 2,
      },
      data: {
        id: node.id,
        labId: node.lab as LabId,
        content: node.content,
        isAi: node.origin === 'ai',
        selected: node.id === options.selectedNodeId,
        connected,
        dimmed,
        bridge: bridgeNodeIds.has(node.id),
        connectionScore: nodeScoreMap.get(node.id) ?? 0,
      },
    }
  })

  const reactEdges: Edge<GraphEdgeData>[] = visibleEdges.map((edge) => {
    const crossLab = edge.is_cross_lab
    const isSelectedEdge = selectedEdgeIds.has(edge.id)
    const isHoveredEdge = edge.id === options.hoveredEdgeId
    const relationshipColor = RELATIONSHIP_COLORS[edge.relationship_type]
    const confidence = normalizeConfidence(edge.confidence_score, minConfidence, maxConfidence)
    const baseOpacity = crossLab ? 0.2 + confidence * 0.54 : 0.08 + confidence * 0.2
    const baseWidth = crossLab ? 1.8 + confidence * 4.1 : 1 + confidence * 2.2
    const mutedOpacity = crossLab ? 0.11 : 0.038
    const dimmed =
      hasSelection &&
      !isSelectedEdge &&
      !(hasNodeSelection && selectedEdgeIds.has(edge.id))
    const animated = crossLab && (confidence > 0.72 || isSelectedEdge || isHoveredEdge)
    const strokeBoost = isSelectedEdge ? 2.8 : isHoveredEdge ? 1.5 : 0
    const haloBoost = isSelectedEdge ? 10 : isHoveredEdge ? 6 : crossLab ? 4.8 : 2.8
    const opacity = hasSelection
      ? isSelectedEdge
        ? 1
        : hasNodeSelection && selectedEdgeIds.has(edge.id)
          ? Math.max(baseOpacity, 0.72)
          : mutedOpacity
      : isHoveredEdge
        ? Math.min(baseOpacity + 0.22, 0.9)
        : baseOpacity

    return {
      id: edge.id,
      source: edge.source_node_id,
      target: edge.target_node_id,
      type: 'trace',
      zIndex: isSelectedEdge ? 30 : isHoveredEdge ? 20 : crossLab ? 8 : 3,
      data: {
        edgeId: edge.id,
        primaryColor: crossLab ? '#ffd84a' : relationshipColor,
        haloColor: crossLab ? '#ff8f6b' : `${relationshipColor}66`,
        strokeWidth: baseWidth + strokeBoost,
        haloWidth: baseWidth + haloBoost,
        opacity,
        crossLab,
        selected: isSelectedEdge,
        hovered: isHoveredEdge,
        dimmed,
        animated,
        confidencePercent: Math.round(edge.confidence_score * 100),
        relationshipType: edge.relationship_type,
        sourceLab: edge.source_lab as LabId,
        targetLab: edge.target_lab as LabId,
      },
      interactionWidth: Math.max(baseWidth + 24, 28),
    }
  })

  return {
    reactNodes,
    reactEdges,
    visibleNodeCount: reactNodes.length,
    visibleEdgeCount: reactEdges.length,
    crossLabPathCount: visibleEdges.filter((edge) => edge.is_cross_lab).length,
  }
}

function buildConnectionDetails(
  selectedNodeId: string | null,
  graphNodes: NodeRecord[],
  graphEdges: EdgeRecord[],
  activeRelationships: Set<string>,
  showCrossLab: boolean
) {
  if (!selectedNodeId) {
    return []
  }

  const nodeMap = new Map(graphNodes.map((node) => [node.id, node]))

  return graphEdges
    .filter(
      (edge) =>
        (edge.source_node_id === selectedNodeId || edge.target_node_id === selectedNodeId) &&
        activeRelationships.has(edge.relationship_type) &&
        (showCrossLab || !edge.is_cross_lab)
    )
    .sort((left, right) => right.confidence_score - left.confidence_score)
    .map((edge) => {
      const otherNodeId =
        edge.source_node_id === selectedNodeId ? edge.target_node_id : edge.source_node_id
      const otherNode = nodeMap.get(otherNodeId)

      if (!otherNode) {
        return null
      }

      return {
        edge,
        node: otherNode,
        confidence: edge.confidence_score,
      }
    })
    .filter((item): item is ConnectionDetail => Boolean(item))
    .slice(0, 8)
}

function buildSelectedEdgeDetail(
  selectedEdgeId: string | null,
  graphNodes: NodeRecord[],
  graphEdges: EdgeRecord[],
  activeRelationships: Set<string>,
  showCrossLab: boolean
) {
  if (!selectedEdgeId) {
    return null
  }

  const edge = graphEdges.find(
    (item) =>
      item.id === selectedEdgeId &&
      activeRelationships.has(item.relationship_type) &&
      (showCrossLab || !item.is_cross_lab)
  )

  if (!edge) {
    return null
  }

  const nodeMap = new Map(graphNodes.map((node) => [node.id, node]))
  const sourceNode = nodeMap.get(edge.source_node_id)
  const targetNode = nodeMap.get(edge.target_node_id)

  if (!sourceNode || !targetNode) {
    return null
  }

  return {
    edge,
    sourceNode,
    targetNode,
    confidence: edge.confidence_score,
  } satisfies EdgeDetail
}

function GraphWorkspaceInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const requestedLabIds = useMemo(
    () => parseRequestedLabIds(searchParams.get('labs')),
    [searchParams]
  )

  const [graphNodes, setGraphNodes] = useState<NodeRecord[]>([])
  const [graphEdges, setGraphEdges] = useState<EdgeRecord[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [labSelectionOverride, setLabSelectionOverride] = useState<Set<LabId> | null>(null)
  const [activeRelationships, setActiveRelationships] = useState<Set<string>>(
    () => new Set(RELATIONSHIP_TYPES)
  )
  const [showCrossLab, setShowCrossLab] = useState(true)
  const [loading, setLoading] = useState(true)
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null)
  const [controlsOpen, setControlsOpen] = useState(true)
  const [inspectorOpen, setInspectorOpen] = useState(true)

  const visibleLabIds = useMemo(
    () => labSelectionOverride ?? new Set(requestedLabIds),
    [labSelectionOverride, requestedLabIds]
  )

  useEffect(() => {
    let active = true

    async function loadGraph() {
      setLoading(true)

      const { data: loadedNodes } = await supabase
        .from('nodes')
        .select('*')
        .eq('status', 'active')
        .order('last_active_at', { ascending: false })
        .limit(GRAPH_NODE_LIMIT)

      if (!active) {
        return
      }

      const typedNodes = (loadedNodes ?? []) as NodeRecord[]
      const baseNodeMap = new Map(typedNodes.map((node) => [node.id, node]))

      const { data: bridgeEdges } = await supabase
        .from('edges')
        .select('*')
        .eq('is_cross_lab', true)
        .order('confidence_score', { ascending: false })
        .limit(CROSS_LAB_EDGE_FETCH_LIMIT)

      if (!active) {
        return
      }

      const missingBridgeNodeIds = Array.from(
        new Set(
          (bridgeEdges ?? []).flatMap((edge) => [edge.source_node_id, edge.target_node_id])
        )
      ).filter((nodeId) => !baseNodeMap.has(nodeId))

      let bridgeNodes: NodeRecord[] = []

      if (missingBridgeNodeIds.length > 0) {
        const { data: loadedBridgeNodes } = await supabase
          .from('nodes')
          .select('*')
          .eq('status', 'active')
          .in('id', missingBridgeNodeIds)

        if (!active) {
          return
        }

        bridgeNodes = (loadedBridgeNodes ?? []) as NodeRecord[]
      }

      const combinedNodes = [...typedNodes]
      const combinedNodeIds = new Set(typedNodes.map((node) => node.id))

      bridgeNodes.forEach((node) => {
        if (combinedNodeIds.has(node.id)) {
          return
        }

        combinedNodes.push(node)
        combinedNodeIds.add(node.id)
      })

      const { data: loadedEdges } = await supabase
        .from('edges')
        .select('*')

      if (!active) {
        return
      }

      setGraphNodes(combinedNodes)
      setGraphEdges((loadedEdges ?? []) as EdgeRecord[])

      setSelectedNodeId((current) =>
        current && combinedNodeIds.has(current) ? current : null
      )
      setSelectedEdgeId((current) =>
        current && (loadedEdges ?? []).some((edge) => edge.id === current) ? current : null
      )
      setHoveredEdgeId(null)
      setLoading(false)
    }

    void loadGraph()

    return () => {
      active = false
    }
  }, [requestedLabIds])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const smallScreen = window.matchMedia('(max-width: 1023px)')

    function syncPanels(event?: MediaQueryList | MediaQueryListEvent) {
      const matches = event ? event.matches : smallScreen.matches
      setControlsOpen(!matches)
      setInspectorOpen(!matches)
    }

    syncPanels(smallScreen)
    smallScreen.addEventListener('change', syncPanels)

    return () => {
      smallScreen.removeEventListener('change', syncPanels)
    }
  }, [])

  const effectiveSelectedNodeId = useMemo(() => {
    if (!selectedNodeId) {
      return null
    }

    return graphNodes.some(
      (node) => node.id === selectedNodeId && visibleLabIds.has(node.lab as LabId)
    )
      ? selectedNodeId
      : null
  }, [graphNodes, selectedNodeId, visibleLabIds])

  const searchResults = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) {
      return []
    }

    return graphNodes
      .filter((node) => node.content.toLowerCase().includes(term))
      .slice(0, 8)
  }, [graphNodes, search])

  const selectedNode = useMemo(
    () => graphNodes.find((node) => node.id === effectiveSelectedNodeId) ?? null,
    [effectiveSelectedNodeId, graphNodes]
  )

  const selectedEdge = useMemo(
    () =>
      buildSelectedEdgeDetail(
        selectedEdgeId,
        graphNodes,
        graphEdges,
        activeRelationships,
        showCrossLab
      ),
    [activeRelationships, graphEdges, graphNodes, selectedEdgeId, showCrossLab]
  )

  const selectedConnections = useMemo(
    () =>
      buildConnectionDetails(
        effectiveSelectedNodeId,
        graphNodes,
        graphEdges,
        activeRelationships,
        showCrossLab
      ),
    [activeRelationships, effectiveSelectedNodeId, graphEdges, graphNodes, showCrossLab]
  )

  const { reactNodes, reactEdges, visibleNodeCount, visibleEdgeCount, crossLabPathCount } =
    useMemo(
      () =>
        buildGraphElements({
          graphNodes,
          graphEdges,
          visibleLabIds,
          selectedNodeId: effectiveSelectedNodeId,
          selectedEdgeId,
          hoveredEdgeId,
          activeRelationships,
          showCrossLab,
        }),
      [
        activeRelationships,
        effectiveSelectedNodeId,
        graphEdges,
        graphNodes,
        hoveredEdgeId,
        selectedEdgeId,
        showCrossLab,
        visibleLabIds,
      ]
    )

  useEffect(() => {
    if (!flowInstance || reactNodes.length === 0) {
      return
    }

    const timeout = window.setTimeout(() => {
      flowInstance.fitView({
        duration: 350,
        padding: 0.08,
      })
    }, 60)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [flowInstance, reactNodes])

  function toggleLab(labId: LabId) {
    setLabSelectionOverride((current) => {
      const base = current ? new Set(current) : new Set(requestedLabIds)
      const next = new Set(base)

      if (next.has(labId)) {
        next.delete(labId)
      } else {
        next.add(labId)
      }

      return next.size === 0 ? base : next
    })
  }

  function toggleRelationship(relationship: string) {
    setActiveRelationships((current) => {
      const next = new Set(current)

      if (next.has(relationship)) {
        next.delete(relationship)
      } else {
        next.add(relationship)
      }

      return next.size === 0 ? new Set(current) : next
    })
  }

  function showAllLabs() {
    setLabSelectionOverride(new Set(LABS.map((lab) => lab.id)))
  }

  function resetGraphView() {
    setSearch('')
    setShowCrossLab(true)
    setActiveRelationships(new Set(RELATIONSHIP_TYPES))
    showAllLabs()
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    setHoveredEdgeId(null)
    flowInstance?.fitView({ duration: 350, padding: 0.08 })
  }

  function focusSelectedNode() {
    if (!flowInstance) {
      return
    }

    if (selectedEdge) {
      const sourceNode = reactNodes.find((item) => item.id === selectedEdge.sourceNode.id)
      const targetNode = reactNodes.find((item) => item.id === selectedEdge.targetNode.id)

      if (!sourceNode || !targetNode) {
        return
      }

      flowInstance.setCenter(
        (sourceNode.position.x + targetNode.position.x) / 2 + NODE_WIDTH / 2,
        (sourceNode.position.y + targetNode.position.y) / 2 + NODE_HEIGHT / 2,
        {
          zoom: 0.82,
          duration: 350,
        }
      )

      return
    }

    if (!effectiveSelectedNodeId) {
      return
    }

    const node = reactNodes.find((item) => item.id === effectiveSelectedNodeId)
    if (!node) {
      return
    }

    flowInstance.setCenter(node.position.x + NODE_WIDTH / 2, node.position.y + NODE_HEIGHT / 2, {
      zoom: 0.9,
      duration: 350,
    })
  }

  function selectNodeFromSearch(node: NodeRecord) {
    setLabSelectionOverride((current) => {
      const next = current ? new Set(current) : new Set(requestedLabIds)
      next.add(node.lab as LabId)
      return next
    })
    setSelectedNodeId(node.id)
    setSelectedEdgeId(null)
    setSearch('')
  }

  function selectNode(nodeId: string) {
    setSelectedNodeId(nodeId)
    setSelectedEdgeId(null)
  }

  function selectEdge(edgeId: string) {
    setSelectedEdgeId(edgeId)
    setSelectedNodeId(null)
  }

  return (
    <div className="page-shell graph-page-shell">
      <div className="page-intro">
        <div>
          <p className="page-kicker">Full network graph</p>
          <h1 className="page-title">Follow the paths between ideas</h1>
          <p className="page-description">
            Every lab keeps its own district. The brighter the bridge, the easier it is to trace
            how one idea pushes into another part of the network.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="ghost-button px-3 py-2 text-xs">{visibleNodeCount} visible nodes</span>
          <span className="ghost-button px-3 py-2 text-xs">{visibleEdgeCount} visible paths</span>
          <span className="ghost-button px-3 py-2 text-xs">{crossLabPathCount} cross-lab links</span>
        </div>
      </div>

      <section className="graph-map-shell">
        <div className="graph-stage-atmosphere" aria-hidden="true">
          <span className="graph-stage-glow graph-stage-glow-left" />
          <span className="graph-stage-glow graph-stage-glow-right" />
          <span className="graph-stage-grid" />
        </div>
        <div className="graph-map-toolbar">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setControlsOpen((current) => !current)}
              className="ghost-button px-3 py-2 text-xs"
            >
              {controlsOpen ? 'Hide filters' : 'Show filters'}
            </button>
            <button
              onClick={() => setInspectorOpen((current) => !current)}
              className="ghost-button px-3 py-2 text-xs"
            >
              {inspectorOpen ? 'Hide inspector' : 'Show inspector'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={focusSelectedNode} className="ghost-button px-3 py-2 text-xs">
              Focus selected
            </button>
            <button onClick={resetGraphView} className="ghost-button px-3 py-2 text-xs">
              Reset view
            </button>
          </div>
        </div>

        <div className="graph-map-stage">
          <div className="graph-map-canvas">
            {loading ? (
              <div className="graph-empty-state">Loading graph...</div>
            ) : reactNodes.length === 0 ? (
              <div className="graph-empty-state">No visible graph nodes yet.</div>
            ) : (
              <ReactFlow
                nodes={reactNodes}
                edges={reactEdges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                fitView
                minZoom={0.22}
                maxZoom={1.5}
                onInit={setFlowInstance}
                onNodeClick={(_, node) => selectNode(node.id)}
                onEdgeClick={(_, edge) => selectEdge(edge.id)}
                onEdgeMouseEnter={(_, edge) => setHoveredEdgeId(edge.id)}
                onEdgeMouseLeave={(_, edge) =>
                  setHoveredEdgeId((current) => (current === edge.id ? null : current))
                }
                onPaneClick={() => {
                  setSelectedNodeId(null)
                  setSelectedEdgeId(null)
                }}
                className="graph-map-surface"
              >
                <MiniMap
                  pannable
                  zoomable
                  nodeColor={(node) => LAB_MAP[(node.data as GraphNodeData).labId].color}
                  maskColor="rgba(5, 5, 5, 0.86)"
                />
                <Controls />
                <Background color="rgba(255,216,74,0.05)" gap={32} />
              </ReactFlow>
            )}
          </div>

          <aside
            className={`graph-floating-panel graph-floating-panel-left ${
              controlsOpen ? 'graph-floating-panel-open' : 'graph-floating-panel-closed'
            }`}
          >
            <section className="menu-panel p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="signal-label">Map controls</p>
                <button onClick={showAllLabs} className="ghost-button px-3 py-2 text-[0.68rem]">
                  All labs
                </button>
              </div>

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search node text..."
                className="field mt-4 px-4 py-3 text-sm"
              />

              {searchResults.length > 0 ? (
                <div className="menu-panel mt-3 p-2">
                  <div className="space-y-1.5">
                    {searchResults.map((node) => {
                      const lab = LAB_MAP[node.lab as LabId]
                      return (
                        <button
                          key={node.id}
                          onClick={() => selectNodeFromSearch(node)}
                          className="menu-item w-full text-left"
                        >
                          <span
                            className="menu-item-icon"
                            style={{ background: `${lab.color}22`, color: lab.color }}
                          >
                            <LabIcon labId={lab.id} className="h-4 w-4" />
                          </span>
                          <span>
                            <span className="block text-sm font-semibold text-white">
                              {lab.name}
                            </span>
                            <span className="mt-1 block text-xs text-[var(--dim)]">
                              {previewContent(node.content, 82)}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              <div className="mt-5">
                <p className="mono-label">Districts</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {LABS.map((lab) => (
                    <button
                      key={lab.id}
                      onClick={() => toggleLab(lab.id)}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[0.72rem] transition-colors ${
                        visibleLabIds.has(lab.id)
                          ? 'border-[var(--line-strong)] text-white'
                          : 'border-[var(--line)] text-[var(--dim)] hover:text-white'
                      }`}
                      style={visibleLabIds.has(lab.id) ? { background: `${lab.color}22` } : undefined}
                    >
                      <LabIcon labId={lab.id} className="h-3.5 w-3.5" />
                      {lab.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="mono-label">Path filters</p>
                  <button
                    onClick={() => setShowCrossLab((current) => !current)}
                    className={`ghost-button px-3 py-2 text-[0.68rem] ${
                      showCrossLab ? 'text-[var(--signal)]' : 'text-[var(--dim)]'
                    }`}
                  >
                    {showCrossLab ? 'Cross-lab on' : 'Cross-lab off'}
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {RELATIONSHIP_TYPES.map((relationship) => (
                    <button
                      key={relationship}
                      onClick={() => toggleRelationship(relationship)}
                      className={`rounded-full border px-3 py-2 text-[0.72rem] capitalize transition-colors ${
                        activeRelationships.has(relationship)
                          ? 'border-[var(--line-strong)] bg-[rgba(255,216,74,0.12)] text-white'
                          : 'border-[var(--line)] bg-[rgba(255,255,255,0.02)] text-[var(--dim)] hover:text-white'
                      }`}
                    >
                      {relationship.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </aside>

          <aside
            className={`graph-floating-panel graph-floating-panel-right ${
              inspectorOpen ? 'graph-floating-panel-open' : 'graph-floating-panel-closed'
            }`}
          >
            <section className="menu-panel p-4 sm:p-5">
              <p className="signal-label">Path legend</p>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-white">Cross-lab bridge</span>
                  <span className="h-2.5 w-16 rounded-full bg-[#ffd84a]" />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-white">Selected trace</span>
                  <span className="h-3 w-16 rounded-full bg-[#ff8f6b]" />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-white">AI-origin node</span>
                  <span className="signal-button px-3 py-1 text-[0.58rem] font-medium">AI</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-white">Clickable trace</span>
                  <span className="rounded-full border border-[rgba(255,255,255,0.14)] px-3 py-1 text-[0.62rem] uppercase tracking-[0.18em] text-[var(--dim)]">
                    Tap line
                  </span>
                </div>
              </div>
            </section>

            <section className="panel panel-strong p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <p className="signal-label">
                  {selectedEdge ? 'Selected connection' : selectedNode ? 'Selected node' : 'Inspector'}
                </p>
                {(selectedNode || selectedEdge) && (
                  <button
                    onClick={() => {
                      setSelectedNodeId(null)
                      setSelectedEdgeId(null)
                    }}
                    className="ghost-button px-3 py-2 text-[0.68rem]"
                  >
                    Clear
                  </button>
                )}
              </div>
              {selectedEdge ? (
                <>
                  <div className="mt-4 flex flex-wrap items-center gap-2.5">
                    <span className="ghost-button px-3 py-1 text-[0.68rem] capitalize">
                      {selectedEdge.edge.relationship_type.replace(/_/g, ' ')}
                    </span>
                    <span className="signal-button px-3 py-1 text-[0.6rem] font-medium">
                      {Math.round(selectedEdge.confidence * 100)}% confidence
                    </span>
                    <span className="ghost-button px-3 py-1 text-[0.68rem]">
                      {selectedEdge.edge.is_cross_lab ? 'Cross-lab bridge' : 'Same-lab link'}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-3">
                    {[selectedEdge.sourceNode, selectedEdge.targetNode].map((node, index) => {
                      const lab = LAB_MAP[node.lab as LabId]
                      return (
                        <div key={node.id} className="graph-inspector-card">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="mono-label">{index === 0 ? 'Source' : 'Target'}</span>
                            <span
                              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-2.5 py-1 text-[0.68rem]"
                              style={{ background: `${lab.color}22`, color: lab.color }}
                            >
                              <LabIcon labId={lab.id} className="h-3.5 w-3.5" />
                              {lab.name}
                            </span>
                            {node.origin === 'ai' ? (
                              <span className="signal-button px-2.5 py-1 text-[0.56rem] font-medium">
                                AI
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-3 text-sm text-[var(--text)]">
                            {previewContent(node.content, 170)}
                          </p>
                          <div className="mt-4 flex flex-wrap gap-2.5">
                            <button
                              onClick={() => selectNode(node.id)}
                              className="ghost-button px-3 py-2 text-[0.68rem]"
                            >
                              Inspect node
                            </button>
                            <button
                              onClick={() => router.push(`/node/${node.id}`)}
                              className="signal-button px-3 py-2 text-[0.68rem]"
                            >
                              Open thread
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              ) : selectedNode ? (
                <>
                  <div className="mt-4 flex flex-wrap items-center gap-2.5">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-2.5 py-1 text-xs"
                      style={{
                        background: `${LAB_MAP[selectedNode.lab as LabId].color}22`,
                        color: LAB_MAP[selectedNode.lab as LabId].color,
                      }}
                    >
                      <LabIcon labId={selectedNode.lab as LabId} className="h-3.5 w-3.5" />
                      {LAB_MAP[selectedNode.lab as LabId].name}
                    </span>
                    {selectedNode.origin === 'ai' ? (
                      <span className="signal-button px-2.5 py-1 text-[0.56rem] font-medium">
                        AI
                      </span>
                    ) : null}
                  </div>

                  <p className="reading-copy mt-4 text-sm">{selectedNode.content}</p>

                  <div className="mt-5 border-t border-[var(--line)] pt-4">
                    <p className="mono-label">Strongest paths</p>
                    {selectedConnections.length > 0 ? (
                      <div className="mt-3 space-y-3">
                        {selectedConnections.map(({ edge, node, confidence }) => {
                          const nodeLab = LAB_MAP[node.lab as LabId]
                          return (
                            <button
                              key={edge.id}
                              onClick={() => selectEdge(edge.id)}
                              className="panel panel-interactive w-full p-4 text-left"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-2 py-0.5 text-[0.66rem]"
                                  style={{
                                    background: `${nodeLab.color}22`,
                                    color: nodeLab.color,
                                  }}
                                >
                                  <LabIcon labId={nodeLab.id} className="h-3 w-3" />
                                  {nodeLab.name}
                                </span>
                                <span className="mono-label">
                                  {edge.relationship_type.replace(/_/g, ' ')}
                                </span>
                                <span className="ml-auto text-[0.7rem] text-white">
                                  {Math.round(confidence * 100)}%
                                </span>
                              </div>
                              <div className="mt-3 h-1.5 rounded-full bg-white/[0.06]">
                                <div
                                  className="h-full rounded-full bg-[var(--signal)]"
                                  style={{ width: `${clamp(confidence * 100, 8, 100)}%` }}
                                />
                              </div>
                              <p className="mt-3 text-sm text-[var(--muted)]">
                                {previewContent(node.content, 112)}
                              </p>
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-[var(--muted)]">
                        No visible paths match the current filter set.
                      </p>
                    )}
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2.5">
                    <button
                      onClick={() => router.push(`/node/${selectedNode.id}`)}
                      className="signal-button px-4 py-2 text-xs"
                    >
                      Open thread
                    </button>
                    <button
                      onClick={() => router.push(`/lab/${selectedNode.lab}`)}
                      className="ghost-button px-4 py-2 text-xs"
                    >
                      Open lab
                    </button>
                  </div>
                </>
              ) : (
                <div className="graph-empty-inspector mt-4">
                  <p className="text-sm text-white">Choose what to inspect.</p>
                  <p className="secondary-copy mt-2 text-sm">
                    Click a node to trace its strongest paths, or click any connection line to inspect the bridge itself.
                  </p>
                  <div className="mt-4 grid gap-3 text-sm text-[var(--muted)]">
                    <div className="graph-inspector-tip">
                      <span className="mono-label">01</span>
                      <span>Cross-lab bridges glow brightest and now support direct click selection.</span>
                    </div>
                    <div className="graph-inspector-tip">
                      <span className="mono-label">02</span>
                      <span>Use Focus selected after choosing a node or connection to center the action.</span>
                    </div>
                    <div className="graph-inspector-tip">
                      <span className="mono-label">03</span>
                      <span>Reset view returns the graph to the full overview without sacrificing the live atmosphere.</span>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </aside>
        </div>
      </section>
    </div>
  )
}

export default function GlobalGraphWorkspace() {
  return (
    <ReactFlowProvider>
      <GraphWorkspaceInner />
    </ReactFlowProvider>
  )
}
