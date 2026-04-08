import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import {
  Box,
  Container,
  Typography,
  Paper,
  Stack,
  Chip,
} from "@mui/material"
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome"
import StarsIcon from "@mui/icons-material/Stars"
import BaseLayout from "../components/BaseLayout"
import { jobmotherFloat } from "../components/jobmother/jobmotherFloat"
import { authUtils } from "../utils/auth"

const FULL_BODY_SRC = "/assets/mascot/fairy-jobmother-cartoon-full.png"
const AVATAR_SRC = "/assets/mascot/fairy-jobmother-cartoon-avatar.png"

/** Sparkle field + brand gradient — “magic” without extra assets */
const magicPageSx = {
  position: "relative",
  minHeight: "calc(100vh - 120px)",
  overflow: "hidden",
  borderRadius: 2,
  background: `
    radial-gradient(ellipse 80% 50% at 50% -20%, rgba(176, 58, 108, 0.35), transparent),
    radial-gradient(ellipse 60% 40% at 100% 50%, rgba(56, 133, 96, 0.2), transparent),
    radial-gradient(ellipse 50% 30% at 0% 80%, rgba(176, 58, 108, 0.15), transparent),
    linear-gradient(165deg, #141428 0%, #1a1a2e 35%, #16213e 70%, #0f0f1a 100%)
  `,
  color: "rgba(255,255,255,0.92)",
  "&::before": {
    content: '""',
    position: "absolute",
    inset: 0,
    backgroundImage: [
      "radial-gradient(1.5px 1.5px at 12% 18%, rgba(255,255,255,0.55), transparent)",
      "radial-gradient(1px 1px at 28% 42%, rgba(255,200,255,0.5), transparent)",
      "radial-gradient(1.5px 1.5px at 72% 22%, rgba(200,255,230,0.45), transparent)",
      "radial-gradient(1px 1px at 88% 55%, rgba(255,255,255,0.4), transparent)",
      "radial-gradient(1.5px 1.5px at 45% 78%, rgba(255,220,255,0.35), transparent)",
      "radial-gradient(1px 1px at 65% 88%, rgba(255,255,255,0.3), transparent)",
    ].join(", "),
    backgroundSize: "100% 100%",
    pointerEvents: "none",
    opacity: 0.85,
  },
} as const

export default function FairyJobmotherPage() {
  const navigate = useNavigate()
  const user = authUtils.getCurrentUser()

  useEffect(() => {
    if (!user) navigate("/")
  }, [user, navigate])

  if (!user) return null

  return (
    <BaseLayout pageTitle="Fairy Jobmother">
      <Box sx={magicPageSx}>
        <Container maxWidth="md" sx={{ position: "relative", py: { xs: 3, sm: 5 }, zIndex: 1 }}>
          <Stack spacing={3} alignItems="center" textAlign="center">
            <Chip
              icon={<AutoAwesomeIcon sx={{ color: "#ffd54f !important" }} />}
              label="Your guide to Job Goblin"
              sx={{
                bgcolor: "rgba(255, 255, 255, 0.12)",
                border: "1px solid rgba(255, 213, 79, 0.35)",
                color: "rgba(255,255,255,0.95)",
                fontWeight: 600,
                backdropFilter: "blur(8px)",
              }}
            />

            <Typography
              variant="h4"
              component="h1"
              sx={{
                fontWeight: 800,
                background: "linear-gradient(120deg, #ffb3d0 0%, #fff 40%, #9fd9b8 100%)",
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                color: "transparent",
                textShadow: "0 0 40px rgba(176, 58, 108, 0.4)",
              }}
            >
              Meet the Fairy Jobmother
            </Typography>

            <Typography variant="body1" sx={{ maxWidth: 520, color: "rgba(255,255,255,0.78)", lineHeight: 1.7 }}>
              She&apos;s here to help you find your way through fairs, booths, and applications. Use the floating
              assistant anytime for quick tips — full AI answers are on the way.
            </Typography>

            <Paper
              elevation={0}
              sx={{
                p: { xs: 2, sm: 3 },
                width: "100%",
                maxWidth: 480,
                bgcolor: "rgba(255, 255, 255, 0.08)",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                borderRadius: 3,
                boxShadow: "0 12px 40px rgba(0, 0, 0, 0.35), 0 0 60px rgba(176, 58, 108, 0.12)",
              }}
            >
              <Typography variant="subtitle2" sx={{ color: "rgba(255,255,255,0.65)", mb: 2, letterSpacing: 0.5 }}>
                FULL CHARACTER
              </Typography>
              <Box
                component="img"
                src={FULL_BODY_SRC}
                alt="Fairy Jobmother — full illustration"
                sx={{
                  width: "100%",
                  maxWidth: 400,
                  height: "auto",
                  mx: "auto",
                  display: "block",
                  filter: "drop-shadow(0 16px 32px rgba(0, 0, 0, 0.45))",
                  animation: `${jobmotherFloat} 4s ease-in-out infinite`,
                }}
              />
            </Paper>

            <Box sx={{ width: "100%", maxWidth: 360, mx: "auto" }}>
              <Typography variant="subtitle2" sx={{ color: "rgba(255,255,255,0.65)", mb: 1.5, letterSpacing: 0.5 }}>
                AVATAR (FLOATING LAUNCHER)
              </Typography>
              <Box
                sx={{
                  width: { xs: 200, sm: 220 },
                  height: { xs: 200, sm: 220 },
                  mx: "auto",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  bgcolor: "rgba(255, 255, 255, 0.06)",
                  backdropFilter: "blur(10px)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  boxShadow:
                    "0 0 0 3px rgba(176, 58, 108, 0.35), 0 0 0 7px rgba(56, 133, 96, 0.18), 0 20px 50px rgba(0, 0, 0, 0.45)",
                }}
              >
                <Box
                  component="img"
                  src={AVATAR_SRC}
                  alt="Fairy Jobmother — avatar"
                  sx={{
                    width: "78%",
                    height: "78%",
                    objectFit: "cover",
                    borderRadius: "50%",
                    border: "3px solid rgba(255, 255, 255, 0.3)",
                  }}
                />
              </Box>
            </Box>

            <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" flexWrap="wrap">
              <StarsIcon sx={{ color: "#ffd54f", fontSize: 22 }} />
              <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.7)" }}>
                Tip: Open the chat from the bottom-right corner on any page with this layout.
              </Typography>
              <StarsIcon sx={{ color: "#81c784", fontSize: 22 }} />
            </Stack>
          </Stack>
        </Container>
      </Box>
    </BaseLayout>
  )
}
