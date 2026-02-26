import { createContext, useContext, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { API_URL } from "../config"

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
  isLive: boolean
  loading: boolean
}

const FairContext = createContext<FairContextType>({
  fairId: null,
  fair: null,
  isLive: false,
  loading: true,
})

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

    async function loadFair() {
      try {
        const [fairRes, statusRes] = await Promise.all([
          fetch(`${API_URL}/api/fairs/${fairId}`),
          fetch(`${API_URL}/api/fairs/${fairId}/status`),
        ])

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
        setLoading(false)
      }
    }

    loadFair()
  }, [fairId])

  const contextValue = useMemo(
    () => ({ fairId, fair, isLive, loading }),
    [fairId, fair, isLive, loading]
  )

  return <FairContext.Provider value={contextValue}>{children}</FairContext.Provider>
}

export function useFair() {
  return useContext(FairContext)
}
