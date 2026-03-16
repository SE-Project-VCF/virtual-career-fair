import { createContext, useContext, useEffect, useMemo, useState } from "react"
import type { Dispatch, ReactNode, SetStateAction } from "react"
import { API_URL } from "../config"
import { auth } from "../firebase"

interface FairData {
  id: string
  name: string
  description: string | null
  isLive: boolean
  startTime: number | null
  endTime: number | null
  inviteCode?: string
}

interface FairContextType {
  fairId: string | null
  fair: FairData | null
  setFair: Dispatch<SetStateAction<FairData | null>>
  isLive: boolean
  loading: boolean
}

const FairContext = createContext<FairContextType>({
  fairId: null,
  fair: null,
  setFair: () => {},
  isLive: false,
  loading: true,
})

function waitForAuthReady(): Promise<void> {
  return new Promise(resolve => {
    const unsub = auth.onAuthStateChanged(() => {
      unsub()
      resolve()
    })
  })
}

interface FairProviderProps {
  fairId: string
  children: ReactNode
}

export function FairProvider({ fairId, children }: Readonly<FairProviderProps>) {
  const [fair, setFair] = useState<FairData | null>(null)
  const [isLive, setIsLive] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!fairId) return

    let cancelled = false

    async function loadFair() {
      try {
        // Wait for Firebase auth to initialize before fetching
        await waitForAuthReady()

        if (cancelled) return

        const token = await auth.currentUser?.getIdToken()
        const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
        const [fairRes, statusRes] = await Promise.all([
          fetch(`${API_URL}/api/fairs/${fairId}`, { headers: authHeaders }),
          fetch(`${API_URL}/api/fairs/${fairId}/status`),
        ])

        if (cancelled) return

        if (fairRes.ok) {
          const fairData = await fairRes.json()
          setFair(fairData)
        }

        if (statusRes.ok) {
          const statusData = await statusRes.json()
          setIsLive(statusData.isLive ?? false)
        }
      } catch (err) {
        console.error("Error loading fair:", err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadFair()
    return () => { cancelled = true }
  }, [fairId])

  const contextValue = useMemo(
    () => ({ fairId, fair, setFair, isLive, loading }),
    [fairId, fair, isLive, loading]
  )

  return <FairContext.Provider value={contextValue}>{children}</FairContext.Provider>
}

export function useFair() {
  return useContext(FairContext)
}
