import { redirect } from 'next/navigation'

export default async function LegacyLabGraphPage({
  params,
}: {
  params: Promise<{ labId: string }>
}) {
  const { labId } = await params

  redirect(`/graph?labs=${labId}`)
}
