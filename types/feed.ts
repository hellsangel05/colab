export type NodeReferenceContext = {
  kind: 'parent_node' | 'prompt'
  id: string
  preview: string
  href: string
  label: string
}
