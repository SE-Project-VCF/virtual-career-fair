import { useState, useEffect } from "react"
import { Link as RouterLink, useParams } from "react-router-dom"
import { Container, Typography, Card, CardContent, Box, CircularProgress, Alert, Link } from "@mui/material"
import BaseLayout from "../components/BaseLayout"
import CompanyOfficeLocationsReadOnly from "../components/CompanyOfficeLocationsReadOnly"
import type { CompanyLocationRow } from "../components/CompanyLocationsSection"
import { API_URL } from "../config"

export default function CompanyPublicProfile() {
  const { companyId } = useParams<{ companyId: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [locations, setLocations] = useState<CompanyLocationRow[]>([])

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError("")
      try {
        const res = await fetch(`${API_URL}/api/companies/${companyId}/locations`)
        if (!res.ok) {
          if (res.status === 404) {
            if (!cancelled) setError("Company not found.")
          } else if (!cancelled) {
            setError("Could not load company.")
          }
          return
        }
        const data = await res.json()
        if (cancelled) return
        setCompanyName(typeof data.companyName === "string" ? data.companyName : "")
        setLocations(Array.isArray(data.locations) ? data.locations : [])
      } catch {
        if (!cancelled) setError("Could not load company.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [companyId])

  if (loading) {
    return (
      <BaseLayout pageTitle="Company">
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      </BaseLayout>
    )
  }

  if (error) {
    return (
      <BaseLayout pageTitle="Company">
        <Container maxWidth="md" sx={{ py: 4 }}>
          <Alert severity="error">{error}</Alert>
        </Container>
      </BaseLayout>
    )
  }

  return (
    <BaseLayout pageTitle={companyName || "Company"}>
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography variant="h4" gutterBottom>
          {companyName || "Company"}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Public office locations
        </Typography>
        <Card>
          <CardContent>
            {locations.length === 0 ? (
              <Typography color="text.secondary">No office locations listed yet.</Typography>
            ) : (
              <CompanyOfficeLocationsReadOnly locations={locations} showTitle={false} />
            )}
          </CardContent>
        </Card>
        <Box sx={{ mt: 2 }}>
          <Link component={RouterLink} to="/fairs" variant="body2">
            Browse career fairs
          </Link>
        </Box>
      </Container>
    </BaseLayout>
  )
}
