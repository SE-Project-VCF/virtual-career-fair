import { useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import {
  Box,
  Container,
  Typography,
  Paper,
  Stack,
  Chip,
  Grid,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material"
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome"
import StarsIcon from "@mui/icons-material/Stars"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import BaseLayout from "../components/BaseLayout"
import { jobmotherFloat } from "../components/jobmother/jobmotherFloat"
import { authUtils } from "../utils/auth"
import type { User } from "../utils/auth"

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

const sectionPaperSx = {
  p: { xs: 2, sm: 2.5 },
  width: "100%",
  bgcolor: "rgba(255, 255, 255, 0.08)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(255, 255, 255, 0.15)",
  borderRadius: 3,
  boxShadow: "0 12px 40px rgba(0, 0, 0, 0.35), 0 0 60px rgba(176, 58, 108, 0.12)",
} as const

const chipSx = {
  bgcolor: "rgba(255, 255, 255, 0.1)",
  border: "1px solid rgba(255, 213, 79, 0.25)",
  color: "rgba(255,255,255,0.9)",
  fontWeight: 500,
  "& .MuiChip-label": { px: 1.25, py: 0.25 },
} as const

const PROMPTS_EVERYONE = [
  "Take me to my dashboard",
  "Show me career fairs",
  "Open chat",
  "Go to my profile",
  "Open the Fairy Jobmother page",
] as const

const PROMPTS_STUDENT = [
  "Where are my job invitations?",
  "Show my call invitations",
  "My 1x1 calls",
  "Tailored resumes",
  "Booth visit history",
  "Browse employer booths",
] as const

const PROMPTS_COMPANY = [
  "Candidate shortlist",
  "Q&A sessions",
  "My 1x1 calls as an employer",
  "Manage my company booth",
  "Browse booths",
] as const

const PROMPTS_REP_SUBMISSIONS = ["View submissions for my booth"] as const

const PROMPTS_ADMIN = [
  "Open the admin panel",
  "Company management",
  "Browse booths",
] as const

function promptsForUser(user: User) {
  const role = user.role
  const out: { title: string; items: readonly string[] }[] = [
    { title: "Everyone", items: PROMPTS_EVERYONE },
  ]
  if (role === "student") {
    out.push({ title: "Students", items: PROMPTS_STUDENT })
  }
  if (role === "companyOwner" || role === "representative") {
    out.push({ title: "Company owners & representatives", items: PROMPTS_COMPANY })
  }
  if (role === "representative") {
    out.push({ title: "Representatives", items: PROMPTS_REP_SUBMISSIONS })
  }
  if (role === "administrator") {
    out.push({ title: "Administrators", items: PROMPTS_ADMIN })
  }
  return out
}

function MascotGallery() {
  return (
    <Stack spacing={3} alignItems="center" sx={{ width: "100%" }}>
      <Paper elevation={0} sx={{ ...sectionPaperSx, maxWidth: 480, mx: "auto" }}>
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
    </Stack>
  )
}

export default function FairyJobmotherPage() {
  const navigate = useNavigate()
  const user = authUtils.getCurrentUser()

  const promptGroups = useMemo(() => (user ? promptsForUser(user) : []), [user])

  useEffect(() => {
    if (!user) navigate("/")
  }, [user, navigate])

  if (!user) return null

  return (
    <BaseLayout pageTitle="Fairy Jobmother">
      <Box sx={magicPageSx}>
        <Container maxWidth="lg" sx={{ position: "relative", py: { xs: 3, sm: 5 }, zIndex: 1 }}>
          <Grid container spacing={4} alignItems="flex-start">
            <Grid size={{ xs: 12, md: 7 }}>
              <Stack spacing={3} sx={{ textAlign: { xs: "center", md: "left" } }}>
                <Box>
                  <Chip
                    icon={<AutoAwesomeIcon sx={{ color: "#ffd54f !important" }} />}
                    label="Your guide to Job Goblin"
                    sx={{
                      bgcolor: "rgba(255, 255, 255, 0.12)",
                      border: "1px solid rgba(255, 213, 79, 0.35)",
                      color: "rgba(255,255,255,0.95)",
                      fontWeight: 600,
                      backdropFilter: "blur(8px)",
                      mb: 2,
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
                      mb: 1.5,
                    }}
                  >
                    Meet the Fairy Jobmother
                  </Typography>
                  <Typography variant="body1" sx={{ color: "rgba(255,255,255,0.78)", lineHeight: 1.7, maxWidth: 560 }}>
                    She helps you move around Job Goblin in plain language. Open the floating assistant, ask what you
                    need, and she&apos;ll reply with short guidance plus buttons to the right places in the app when
                    she can map your request to navigation.
                  </Typography>
                </Box>

                <Paper elevation={0} component="section" aria-labelledby="how-it-works-heading" sx={sectionPaperSx}>
                  <Typography
                    id="how-it-works-heading"
                    variant="h6"
                    component="h2"
                    sx={{ fontWeight: 700, color: "rgba(255,255,255,0.95)", mb: 1.5 }}
                  >
                    How it works
                  </Typography>
                  <Stack component="ol" spacing={1.5} sx={{ m: 0, pl: 2.5, color: "rgba(255,255,255,0.78)" }}>
                    <Typography component="li" variant="body2" sx={{ lineHeight: 1.7 }}>
                      Click the Fairy Jobmother button in the <strong>bottom-right</strong> (on pages that use this
                      layout).
                    </Typography>
                    <Typography component="li" variant="body2" sx={{ lineHeight: 1.7 }}>
                      Type a question or goal in your own words.
                    </Typography>
                    <Typography component="li" variant="body2" sx={{ lineHeight: 1.7 }}>
                      Read her reply and use any <strong>suggested links</strong> to jump straight there.
                    </Typography>
                  </Stack>
                  <Typography variant="body2" sx={{ mt: 2, color: "rgba(255,255,255,0.65)", lineHeight: 1.65 }}>
                    You need to stay signed in. Which links appear depends on your <strong>role</strong> (student,
                    representative, company owner, or administrator). If you are inside a fair URL, she can also point
                    you to that fair&apos;s home or booth list when it fits your question.
                  </Typography>
                </Paper>

                <Paper elevation={0} component="section" aria-labelledby="example-prompts-heading" sx={sectionPaperSx}>
                  <Typography
                    id="example-prompts-heading"
                    variant="h6"
                    component="h2"
                    sx={{ fontWeight: 700, color: "rgba(255,255,255,0.95)", mb: 1 }}
                  >
                    Example things to ask
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 2, color: "rgba(255,255,255,0.65)", lineHeight: 1.65 }}>
                    Phrasing can vary; these are patterns that usually map well to in-app navigation.
                  </Typography>
                  {promptGroups.map((group) => (
                    <Box key={group.title} sx={{ mb: group.title === "Everyone" ? 2 : 2.5 }}>
                      <Typography
                        variant="subtitle2"
                        component="h3"
                        sx={{ color: "rgba(255,255,255,0.7)", mb: 1, letterSpacing: 0.4 }}
                      >
                        {group.title}
                      </Typography>
                      <Stack
                        direction="row"
                        flexWrap="wrap"
                        gap={1}
                        justifyContent={{ xs: "center", md: "flex-start" }}
                        useFlexGap
                      >
                        {group.items.map((text) => (
                          <Chip key={text} label={text} size="small" sx={chipSx} />
                        ))}
                      </Stack>
                    </Box>
                  ))}
                </Paper>

                <Paper elevation={0} component="section" aria-labelledby="tips-heading" sx={sectionPaperSx}>
                  <Typography
                    id="tips-heading"
                    variant="h6"
                    component="h2"
                    sx={{ fontWeight: 700, color: "rgba(255,255,255,0.95)", mb: 1.5 }}
                  >
                    Tips
                  </Typography>
                  <Stack spacing={1} sx={{ color: "rgba(255,255,255,0.78)" }}>
                    <Stack direction="row" spacing={1} alignItems="flex-start">
                      <StarsIcon sx={{ color: "#ffd54f", fontSize: 20, mt: 0.25, flexShrink: 0 }} />
                      <Typography variant="body2" sx={{ lineHeight: 1.65 }}>
                        Press <strong>Escape</strong> to close the assistant; focus returns to the launcher.
                      </Typography>
                    </Stack>
                    <Stack direction="row" spacing={1} alignItems="flex-start">
                      <StarsIcon sx={{ color: "#81c784", fontSize: 20, mt: 0.25, flexShrink: 0 }} />
                      <Typography variant="body2" sx={{ lineHeight: 1.65 }}>
                        If a reply has no links, try rephrasing or ask more specifically about a page you want (e.g.
                        &quot;job invitations&quot; or &quot;admin panel&quot;).
                      </Typography>
                    </Stack>
                  </Stack>
                </Paper>

                <Paper elevation={0} component="section" aria-labelledby="faq-heading" sx={sectionPaperSx}>
                  <Typography
                    id="faq-heading"
                    variant="h6"
                    component="h2"
                    sx={{ fontWeight: 700, color: "rgba(255,255,255,0.95)", mb: 1.5 }}
                  >
                    Frequently asked questions
                  </Typography>
                  <Stack spacing={0}>
                    <Accordion
                      disableGutters
                      elevation={0}
                      sx={{
                        bgcolor: "rgba(255,255,255,0.06)",
                        color: "inherit",
                        borderBottom: "1px solid rgba(255,255,255,0.1)",
                        "&:before": { display: "none" },
                      }}
                    >
                      <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: "rgba(255,255,255,0.7)" }} />}>
                        <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 600 }}>
                          Why didn&apos;t I get a link?
                        </Typography>
                      </AccordionSummary>
                      <AccordionDetails>
                        <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.75)", lineHeight: 1.65 }}>
                          She only suggests links when your question matches something the app can open for your account.
                          If you&apos;re vague, off-topic, or asking for something your role can&apos;t access, you may
                          get text only. Try naming the area you want (dashboard, fairs, profile, etc.).
                        </Typography>
                      </AccordionDetails>
                    </Accordion>
                    <Accordion
                      disableGutters
                      elevation={0}
                      sx={{
                        bgcolor: "rgba(255,255,255,0.06)",
                        color: "inherit",
                        borderBottom: "1px solid rgba(255,255,255,0.1)",
                        "&:before": { display: "none" },
                      }}
                    >
                      <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: "rgba(255,255,255,0.7)" }} />}>
                        <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 600 }}>
                          Are suggestions always the same for every user?
                        </Typography>
                      </AccordionSummary>
                      <AccordionDetails>
                        <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.75)", lineHeight: 1.65 }}>
                          No. Students, employers, and administrators see different destinations. Some shortcuts only
                          work when you have the right context (for example, fair-specific links when you&apos;re in a
                          fair route).
                        </Typography>
                      </AccordionDetails>
                    </Accordion>
                    <Accordion
                      disableGutters
                      elevation={0}
                      sx={{
                        bgcolor: "rgba(255,255,255,0.06)",
                        color: "inherit",
                        "&:before": { display: "none" },
                      }}
                    >
                      <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: "rgba(255,255,255,0.7)" }} />}>
                        <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 600 }}>
                          Is this customer support?
                        </Typography>
                      </AccordionSummary>
                      <AccordionDetails>
                        <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.75)", lineHeight: 1.65 }}>
                          The Fairy Jobmother is <strong>in-app navigation help</strong> for Job Goblin, not a human
                          support desk. For account or billing issues, use whatever channel your school or organization
                          provides.
                        </Typography>
                      </AccordionDetails>
                    </Accordion>
                  </Stack>
                </Paper>
              </Stack>
            </Grid>

            <Grid size={{ xs: 12, md: 5 }}>
              <Stack spacing={2} alignItems={{ xs: "center", md: "stretch" }}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    color: "rgba(255,255,255,0.65)",
                    letterSpacing: 0.5,
                    textAlign: { xs: "center", md: "center" },
                    width: "100%",
                  }}
                >
                  MASCOT
                </Typography>
                <MascotGallery />
              </Stack>
            </Grid>
          </Grid>
        </Container>
      </Box>
    </BaseLayout>
  )
}
