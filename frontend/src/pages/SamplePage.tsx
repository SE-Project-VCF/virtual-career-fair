import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Alert,
  Divider,
  Avatar,
  LinearProgress,
} from "@mui/material"
import PaletteIcon from "@mui/icons-material/Palette"
import LayersIcon from "@mui/icons-material/Layers"
import MenuOpenIcon from "@mui/icons-material/MenuOpen"
import DevicesIcon from "@mui/icons-material/Devices"
import BaseLayout from "../components/BaseLayout"

function DemoCard({
  icon,
  title,
  description,
  accentColor,
}: {
  icon: React.ReactNode
  title: string
  description: string
  accentColor: string
}) {
  return (
    <Card
      sx={{
        height: "100%",
        border: `1px solid ${accentColor}33`,
        boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
        borderRadius: 3,
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
        "&:hover": {
          transform: "translateY(-4px)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        },
      }}
    >
      <CardContent sx={{ p: 3 }}>
        <Avatar
          sx={{
            bgcolor: `${accentColor}22`,
            color: accentColor,
            width: 48,
            height: 48,
            mb: 2,
          }}
        >
          {icon}
        </Avatar>
        <Typography variant="h6" fontWeight={700} gutterBottom>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
          {description}
        </Typography>
      </CardContent>
    </Card>
  )
}

export default function SamplePage() {
  return (
    <BaseLayout pageTitle="Sample Page">
      <Container maxWidth="lg">
        <Box sx={{ py: 5 }}>
          {/* Page intro */}
          <Alert
            severity="info"
            sx={{
              mb: 4,
              borderRadius: 2,
              border: "1px solid rgba(56, 133, 96, 0.3)",
              background: "rgba(56, 133, 96, 0.06)",
              "& .MuiAlert-icon": { color: "#388560" },
            }}
          >
            <Typography variant="body2">
              <strong>Layout Demo</strong> — This page exists to preview the{" "}
              <code>BaseLayout</code> component before it is applied across the app. The header
              above and the hamburger navigation drawer are shared across all pages that use this
              layout.
            </Typography>
          </Alert>

          {/* Page heading */}
          <Box sx={{ mb: 5 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
              <Typography
                variant="h4"
                fontWeight={800}
                sx={{
                  background: "linear-gradient(135deg, #b03a6c 0%, #388560 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Base Layout Preview
              </Typography>
              <Chip label="Demo" size="small" sx={{ bgcolor: "#b03a6c", color: "white", fontWeight: 700 }} />
            </Box>
            <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 600 }}>
              The header is sticky, uses the Job Goblin gradient, and contains the hamburger menu,
              branding, Chat button, notification bell, and profile menu — identical to the
              Dashboard.
            </Typography>
          </Box>

          {/* Feature cards */}
          <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
            Layout Features
          </Typography>
          <Grid container spacing={3} sx={{ mb: 5 }}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <DemoCard
                icon={<LayersIcon />}
                title="Consistent Header"
                description="Gradient header matching the Dashboard, with branding and action buttons, applied to every page."
                accentColor="#b03a6c"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <DemoCard
                icon={<MenuOpenIcon />}
                title="Hamburger Drawer"
                description="Role-aware navigation drawer slides in from the left. Shows different links for students, companies, and admins."
                accentColor="#388560"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <DemoCard
                icon={<PaletteIcon />}
                title="Brand Colours"
                description="Pink (#b03a6c) and green (#388560) are used consistently throughout the header, drawer, and accent elements."
                accentColor="#b03a6c"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <DemoCard
                icon={<DevicesIcon />}
                title="Sticky & Responsive"
                description="The header stays fixed at the top while scrolling. Content flows in a max-width container for readability."
                accentColor="#388560"
              />
            </Grid>
          </Grid>

          <Divider sx={{ mb: 5 }} />

          {/* Mock content section to show scrolling behaviour */}
          <Typography variant="h6" fontWeight={700} sx={{ mb: 3 }}>
            Sample Content Sections
          </Typography>
          <Grid container spacing={3}>
            {[
              { label: "Profile Completion", value: 75, color: "#b03a6c" },
              { label: "Applications Sent", value: 40, color: "#388560" },
              { label: "Booths Visited", value: 60, color: "#b03a6c" },
            ].map((item) => (
              <Grid size={{ xs: 12, md: 4 }} key={item.label}>
                <Card
                  sx={{
                    borderRadius: 3,
                    boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
                    border: "1px solid rgba(0,0,0,0.06)",
                    p: 3,
                  }}
                >
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
                    <Typography variant="body1" fontWeight={600}>
                      {item.label}
                    </Typography>
                    <Typography variant="h6" fontWeight={800} sx={{ color: item.color }}>
                      {item.value}%
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={item.value}
                    sx={{
                      height: 8,
                      borderRadius: 4,
                      bgcolor: `${item.color}22`,
                      "& .MuiLinearProgress-bar": { bgcolor: item.color, borderRadius: 4 },
                    }}
                  />
                </Card>
              </Grid>
            ))}
          </Grid>

          {/* Spacer to demonstrate sticky header while scrolling */}
          <Box sx={{ mt: 5 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
              Scroll Test
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Scroll down to verify the header stays pinned at the top of the viewport.
            </Typography>
            {Array.from({ length: 6 }).map((_, i) => (
              <Card
                key={i}
                sx={{
                  mb: 2,
                  borderRadius: 3,
                  border: "1px solid rgba(0,0,0,0.06)",
                  boxShadow: "none",
                }}
              >
                <CardContent>
                  <Typography variant="body1" fontWeight={600} gutterBottom>
                    Placeholder Card {i + 1}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    This card is here to provide scrollable content so you can see the sticky
                    header behaviour in action. In a real page this area would contain meaningful
                    content.
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Box>
      </Container>
    </BaseLayout>
  )
}
