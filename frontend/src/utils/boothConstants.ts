import { authUtils } from "./auth"
import { API_URL } from "../config"

export const INDUSTRY_LABELS: Record<string, string> = {
  software: "Software Development",
  data: "Data Science & Analytics",
  healthcare: "Healthcare Technology",
  finance: "Financial Services",
  energy: "Renewable Energy",
  education: "Education Technology",
  retail: "Retail & E-commerce",
  manufacturing: "Manufacturing",
  other: "Other",
}

export type RatingData = { rating: number; comment: string | null; createdAt: number | null }

export async function fetchMyBoothRating(
  boothId: string,
  userRole: string | undefined,
  isMountedRef: { current: boolean },
  setMyRating: (r: RatingData | null) => void
): Promise<void> {
  if (userRole !== "student") return
  try {
    const token = await authUtils.getIdToken()
    const res = await fetch(`${API_URL}/api/booths/${boothId}/ratings/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!isMountedRef.current) return
    if (res.ok) {
      const data = await res.json()
      setMyRating(data.rating)
    } else {
      setMyRating(null)
    }
  } catch {
    if (isMountedRef.current) setMyRating(null)
  }
}
