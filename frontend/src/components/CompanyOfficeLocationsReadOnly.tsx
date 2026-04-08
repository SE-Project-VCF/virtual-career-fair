import { Box, Typography, Link as MuiLink } from "@mui/material"
import { Link as RouterLink } from "react-router-dom"
import LocationOnIcon from "@mui/icons-material/LocationOn"
import type { CompanyLocationRow } from "./CompanyLocationsSection"

function formatLine(loc: CompanyLocationRow): string {
  const parts = [[loc.venueCity, loc.venueState].filter(Boolean).join(", "), loc.venueZip].filter(Boolean)
  return parts.join(" ").trim()
}

type Props = Readonly<{
  locations: CompanyLocationRow[]
  /** e.g. `/company/:id/public` — shown when set */
  publicProfileTo?: string
  showTitle?: boolean
  title?: string
}>

export default function CompanyOfficeLocationsReadOnly({
  locations,
  publicProfileTo,
  showTitle = true,
  title = "Office locations",
}: Props) {
  if (!locations.length) return null
  return (
    <Box>
      {showTitle && (
        <Typography
          variant="subtitle1"
          fontWeight={600}
          gutterBottom
          sx={{ display: "flex", alignItems: "center", gap: 1 }}
        >
          <LocationOnIcon fontSize="small" color="action" />
          {title}
        </Typography>
      )}
      <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
        {locations.map((loc) => (
          <li key={loc.id}>
            <Typography variant="body2">
              {loc.label ? <strong>{loc.label}: </strong> : null}
              {formatLine(loc)}
            </Typography>
          </li>
        ))}
      </Box>
      {publicProfileTo && (
        <MuiLink component={RouterLink} to={publicProfileTo} sx={{ mt: 1, display: "inline-block" }} variant="body2">
          Full company profile
        </MuiLink>
      )}
    </Box>
  )
}
