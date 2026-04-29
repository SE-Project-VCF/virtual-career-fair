import { Navigate, useParams } from "react-router-dom"

/** Legacy URL; fair booths live on `/fair/:fairId`. */
export default function FairBooths() {
  const { fairId } = useParams<{ fairId: string }>()
  if (!fairId) return null
  return <Navigate to={`/fair/${fairId}`} replace />
}
