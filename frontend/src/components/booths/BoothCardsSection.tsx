import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Typography,
} from "@mui/material"
import BusinessIcon from "@mui/icons-material/Business"
import PeopleIcon from "@mui/icons-material/People"
import LocationOnIcon from "@mui/icons-material/LocationOn"
import ArrowForwardIcon from "@mui/icons-material/ArrowForward"
import { INDUSTRY_LABELS, type BoothCardItem } from "./boothShared"

type BoothCardsSectionProps = {
  booths: BoothCardItem[]
  getJobCountForBooth: (booth: BoothCardItem) => number
  onVisitBooth: (boothId: string) => void
}

export default function BoothCardsSection({
  booths,
  getJobCountForBooth,
  onVisitBooth,
}: Readonly<BoothCardsSectionProps>) {
  if (booths.length === 0) return null

  return (
    <>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3, color: "#1a1a1a" }}>
        Company Booths
      </Typography>
      <Grid container spacing={3}>
        {booths.map((booth) => {
          const openPositions = getJobCountForBooth(booth)
          return (
            <Grid size={{ xs: 12, md: 6, lg: 4 }} key={booth.id}>
              <Card
                sx={{
                  height: "100%",
                  border: "1px solid rgba(56, 133, 96, 0.3)",
                  transition: "transform 0.2s, box-shadow 0.2s",
                  "&:hover": {
                    transform: "translateY(-4px)",
                    boxShadow: "0 8px 24px rgba(56, 133, 96, 0.3)",
                  },
                }}
              >
                <CardContent sx={{ p: 3 }}>
                  <Box sx={{ display: "flex", alignItems: "start", gap: 2, mb: 2 }}>
                    {booth.logoUrl ? (
                      <Box
                        component="img"
                        src={booth.logoUrl}
                        alt={`${booth.companyName} logo`}
                        sx={{
                          width: 64,
                          height: 64,
                          borderRadius: 2,
                          objectFit: "cover",
                          border: "1px solid rgba(0,0,0,0.1)",
                        }}
                      />
                    ) : (
                      <Box
                        sx={{
                          width: 64,
                          height: 64,
                          borderRadius: 2,
                          background:
                            "linear-gradient(135deg, rgba(56, 133, 96, 0.1) 0%, rgba(176, 58, 108, 0.1) 100%)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <BusinessIcon sx={{ fontSize: 32, color: "#388560" }} />
                      </Box>
                    )}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5, lineHeight: 1.2 }}>
                        {booth.companyName}
                      </Typography>
                      <Chip
                        label={INDUSTRY_LABELS[booth.industry] || booth.industry}
                        size="small"
                        sx={{
                          bgcolor: "rgba(56, 133, 96, 0.1)",
                          color: "#388560",
                          fontWeight: 500,
                          fontSize: "0.75rem",
                        }}
                      />
                    </Box>
                  </Box>

                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      mb: 2,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      minHeight: 40,
                    }}
                  >
                    {booth.description}
                  </Typography>

                  <Box sx={{ mb: 2, display: "flex", flexDirection: "column", gap: 1 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <LocationOnIcon sx={{ fontSize: 16, color: "#b03a6c" }} />
                      <Typography variant="body2" color="text.secondary">
                        {booth.location}
                      </Typography>
                    </Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <PeopleIcon sx={{ fontSize: 16, color: "#b03a6c" }} />
                      <Typography variant="body2" color="text.secondary">
                        {booth.companySize} employees
                      </Typography>
                    </Box>
                  </Box>

                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      pt: 2,
                      borderTop: "1px solid rgba(0,0,0,0.1)",
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 600, color: "#388560" }}>
                      {openPositions} open position{openPositions === 1 ? "" : "s"}
                    </Typography>
                    <Button
                      variant="outlined"
                      size="small"
                      endIcon={<ArrowForwardIcon />}
                      onClick={() => onVisitBooth(booth.id)}
                      sx={{
                        borderColor: "#388560",
                        color: "#388560",
                        "&:hover": {
                          borderColor: "#2d6b4d",
                          bgcolor: "rgba(56, 133, 96, 0.05)",
                        },
                      }}
                    >
                      Visit Booth
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          )
        })}
      </Grid>
    </>
  )
}
