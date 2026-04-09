import { useCallback, useEffect, useId, useRef, useState } from "react"
import { useLocation, useNavigate, useParams } from "react-router-dom"
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
  InputAdornment,
} from "@mui/material"
import { alpha } from "@mui/material/styles"
import CloseIcon from "@mui/icons-material/Close"
import CloseFullscreenIcon from "@mui/icons-material/CloseFullscreen"
import OpenInFullIcon from "@mui/icons-material/OpenInFull"
import SendIcon from "@mui/icons-material/Send"
import {
  JOBMOTHER_WELCOME_BUBBLE_DISMISSED_KEY,
  getJobmotherClarifyChips,
  readWelcomeBubbleDismissed,
} from "../../constants/jobmother"
import { API_URL } from "../../config"
import { authUtils } from "../../utils/auth"
import { jobmotherFloat } from "./jobmotherFloat"

/** Full-body illustration for the floating launcher (same art before/after bubble dismiss). */
const FULL_BODY_SRC = "/assets/mascot/fairy-jobmother-cartoon-full.png"

export type JobmotherMessage = {
  id: string
  role: "user" | "assistant"
  text: string
  links?: { path: string; label: string }[]
  tips?: string[]
  needsClarification?: boolean
}

function nextId() {
  const bytes = new Uint8Array(8)
  globalThis.crypto.getRandomValues(bytes)
  const suffix = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")
  return `${Date.now()}-${suffix}`
}

type NavigateOk = {
  ok: true
  reply: string
  links: { path: string; label: string }[]
  tips: string[]
  needsClarification: boolean
}

type NavigateErr = { ok: false; error: string }

async function postJobmotherNavigate(
  token: string,
  pathname: string,
  fairId: string | undefined,
  message: string
): Promise<NavigateOk | NavigateErr> {
  const res = await fetch(`${API_URL}/api/jobmother/navigate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      message,
      pathname,
      ...(fairId ? { fairId } : {}),
    }),
  })

  let data: {
    ok?: boolean
    reply?: string
    links?: unknown
    tips?: unknown
    needsClarification?: boolean
    error?: string
  } = {}
  try {
    data = await res.json()
  } catch {
    data = {}
  }

  if (!res.ok) {
    const err =
      typeof data.error === "string" && data.error.trim()
        ? data.error.trim()
        : "Something went wrong. Try again."
    return { ok: false, error: err }
  }

  if (data.ok !== true) {
    const err =
      typeof data.error === "string" && data.error.trim()
        ? data.error.trim()
        : "Unexpected response from the assistant."
    return { ok: false, error: err }
  }

  const reply = typeof data.reply === "string" ? data.reply : ""
  const rawLinks = Array.isArray(data.links) ? data.links : []
  const links = rawLinks
    .filter(
      (l): l is { path: string; label: string } =>
        l != null &&
        typeof l === "object" &&
        typeof (l as { path?: unknown }).path === "string" &&
        typeof (l as { label?: unknown }).label === "string"
    )
    .map((l) => ({ path: l.path, label: l.label }))

  const rawTips = Array.isArray(data.tips) ? data.tips : []
  const tips = rawTips
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim())
    .filter(Boolean)
  const needsClarification = data.needsClarification === true

  return { ok: true, reply, links, tips, needsClarification }
}

const DIALOG_DOM_ID = "fairy-jobmother-dialog"

/** Frosted glass — reads as transparent over page content */
const glass = {
  bgcolor: "rgba(255, 255, 255, 0.45)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
} as const

/** Welcome speech bubble border (tail uses same for outline) */
const WELCOME_BUBBLE_BORDER = "rgba(176, 58, 108, 0.28)"

export default function FairyJobmotherAssistant() {
  const titleId = useId()
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams<{ fairId?: string }>()
  const [open, setOpen] = useState(false)
  const [welcomeBubbleDismissed, setWelcomeBubbleDismissed] = useState(readWelcomeBubbleDismissed)
  const [messages, setMessages] = useState<JobmotherMessage[]>([])
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [panelExpanded, setPanelExpanded] = useState(false)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const focusLauncher = useCallback(() => {
    queueMicrotask(() => launcherRef.current?.focus())
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    focusLauncher()
  }, [focusLauncher])

  const openPanel = useCallback(() => {
    setOpen(true)
    queueMicrotask(() => inputRef.current?.focus())
  }, [])

  const dismissWelcomeBubble = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setWelcomeBubbleDismissed(true)
    try {
      globalThis.localStorage?.setItem(JOBMOTHER_WELCOME_BUBBLE_DISMISSED_KEY, "true")
    } catch {
      /* ignore */
    }
    queueMicrotask(() => launcherRef.current?.focus())
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        close()
      }
    }
    globalThis.addEventListener("keydown", onKey)
    return () => globalThis.removeEventListener("keydown", onKey)
  }, [open, close])

  useEffect(() => {
    if (!open || !listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [open, messages])

  const sendWithText = useCallback(async (rawText: string) => {
    const text = rawText.trim()
    if (!text || sending) return
    setMessages((prev) => [...prev, { id: nextId(), role: "user", text }])
    setSending(true)
    try {
      const token = await authUtils.getIdToken()
      if (!token) {
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: "assistant",
            text: "Please sign in again to use navigation help.",
          },
        ])
        return
      }

      const fairId = params.fairId?.trim() || undefined
      const result = await postJobmotherNavigate(token, location.pathname, fairId, text)
      if (!result.ok) {
        setMessages((prev) => [...prev, { id: nextId(), role: "assistant", text: result.error }])
        return
      }

      const { reply, links, tips, needsClarification } = result
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "assistant",
          text: reply,
          links,
          ...(tips.length > 0 ? { tips } : {}),
          ...(needsClarification ? { needsClarification: true } : {}),
        },
      ])
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "assistant",
          text: "Network error. Check your connection and try again.",
        },
      ])
    } finally {
      setSending(false)
    }
  }, [sending, location.pathname, params.fairId])

  const send = useCallback(async () => {
    const text = draft.trim()
    if (!text || sending) return
    setDraft("")
    await sendWithText(text)
  }, [draft, sending, sendWithText])

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  const showWelcomeBubble = !welcomeBubbleDismissed

  return (
    <Box
      sx={{
        position: "fixed",
        right: { xs: 16, sm: 24 },
        bottom: { xs: 16, sm: 24 },
        zIndex: (theme) => theme.zIndex.snackbar,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 1,
      }}
    >
      {open && (
        <Paper
          id={DIALOG_DOM_ID}
          elevation={0}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          sx={{
            ...glass,
            width: { xs: "calc(100vw - 32px)", sm: 380 },
            maxWidth: 380,
            maxHeight: panelExpanded ? "min(720px, 85vh)" : "min(480px, 50vh)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            borderRadius: 2,
            border: "1px solid rgba(176, 58, 108, 0.22)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
          }}
        >
          <Box
            sx={{
              px: 2,
              py: 1.5,
              background: "linear-gradient(135deg, #b03a6c 0%, #388560 100%)",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 1,
            }}
          >
            <Box>
              <Typography id={titleId} variant="subtitle1" sx={{ color: "white", fontWeight: 700 }}>
                Fairy Jobmother
              </Typography>
              <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.9)", display: "block" }}>
                AI guide · Beta
              </Typography>
            </Box>
            <Stack direction="row" spacing={0.25} alignItems="center">
              <IconButton
                size="small"
                onClick={() => setPanelExpanded((v) => !v)}
                aria-label={panelExpanded ? "Collapse chat panel" : "Expand chat panel"}
                aria-expanded={panelExpanded}
                sx={{ color: "white", "&:hover": { bgcolor: "rgba(255,255,255,0.15)" } }}
              >
                {panelExpanded ? (
                  <CloseFullscreenIcon fontSize="small" />
                ) : (
                  <OpenInFullIcon fontSize="small" />
                )}
              </IconButton>
              <IconButton
                size="small"
                onClick={close}
                aria-label="Close Fairy Jobmother"
                sx={{ color: "white", "&:hover": { bgcolor: "rgba(255,255,255,0.15)" } }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Box>

          <Box
            ref={listRef}
            sx={{
              flex: 1,
              minHeight: 160,
              maxHeight: panelExpanded ? "min(560px, 62vh)" : 280,
              overflow: "auto",
              px: 1.5,
              py: 1,
              bgcolor: "rgba(255, 255, 255, 0.35)",
            }}
          >
            {messages.length === 0 ? (
              <Typography
                variant="body2"
                sx={{
                  py: 1,
                  lineHeight: 1.65,
                  color: (theme) => alpha(theme.palette.text.secondary, 0.68),
                }}
              >
                Ask the Fairy Jobmother whenever you need help in Job Goblin—she can point you to the right places,
                offer short tips when they help, and suggest quick replies if your question needs a little focus.
              </Typography>
            ) : (
              messages.map((m, idx) => {
                const showClarifyChips =
                  m.role === "assistant" &&
                  m.needsClarification === true &&
                  idx === messages.length - 1 &&
                  !sending
                return (
                  <Box
                    key={m.id}
                    sx={{
                      display: "flex",
                      justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                      mb: 1,
                    }}
                  >
                    <Box
                      sx={{
                        maxWidth: "85%",
                        px: 1.25,
                        py: 0.75,
                        borderRadius: 2,
                        bgcolor: m.role === "user" ? "#b03a6c" : "#e8f5ef",
                        color: m.role === "user" ? "white" : "text.primary",
                        border:
                          m.role === "assistant" ? "1px solid rgba(56, 133, 96, 0.35)" : "none",
                      }}
                    >
                      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {m.text}
                      </Typography>
                      {m.role === "assistant" && m.tips && m.tips.length > 0 ? (
                        <Box
                          component="ul"
                          sx={{
                            mt: 0.75,
                            mb: 0,
                            pl: 2.25,
                            color: "text.secondary",
                          }}
                        >
                          {m.tips.map((tip) => (
                            <Typography
                              key={tip}
                              component="li"
                              variant="caption"
                              sx={{ display: "list-item", lineHeight: 1.5 }}
                            >
                              {tip}
                            </Typography>
                          ))}
                        </Box>
                      ) : null}
                      {m.role === "assistant" && m.links && m.links.length > 0 ? (
                        <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 0.75 }}>
                          {m.links.map((link) => (
                            <Button
                              key={`${link.path}-${link.label}`}
                              size="small"
                              variant="outlined"
                              color="success"
                              onClick={() => {
                                navigate(link.path)
                                close()
                              }}
                            >
                              {link.label}
                            </Button>
                          ))}
                        </Stack>
                      ) : null}
                      {showClarifyChips ? (
                        <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 0.75 }} useFlexGap>
                          {getJobmotherClarifyChips(authUtils.getCurrentUser()?.role).map((label) => (
                            <Chip
                              key={label}
                              size="small"
                              label={label}
                              variant="outlined"
                              color="primary"
                              onClick={() => void sendWithText(label)}
                              disabled={sending}
                              sx={{ maxWidth: "100%", height: "auto", py: 0.25, "& .MuiChip-label": { whiteSpace: "normal" } }}
                            />
                          ))}
                        </Stack>
                      ) : null}
                    </Box>
                  </Box>
                )
              })
            )}
          </Box>

          <Box sx={{ p: 1.5, pt: 0, bgcolor: "rgba(255, 255, 255, 0.35)" }}>
            <TextField
              inputRef={inputRef}
              fullWidth
              multiline
              minRows={1}
              maxRows={4}
              size="small"
              placeholder="Type a message…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={sending}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      {sending ? (
                        <CircularProgress size={20} sx={{ mr: 0.5 }} aria-label="Sending" />
                      ) : null}
                      <IconButton
                        size="small"
                        color="primary"
                        aria-label="Send message"
                        onClick={() => {
                          void send()
                        }}
                        disabled={!draft.trim() || sending}
                      >
                        <SendIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
          </Box>
        </Paper>
      )}

      {!open && (
        <Box
          sx={{
            position: "relative",
            alignSelf: "flex-end",
            display: "inline-block",
            maxWidth: "min(100vw - 32px, 280px)",
          }}
        >
          {showWelcomeBubble && (
            <Box
              sx={{
                position: "absolute",
                right: "52px",
                left: "auto",
                bottom: "calc(100% + 8px)",
                zIndex: 2,
                width: "max-content",
                maxWidth: "min(220px, calc(100vw - 40px))",
              }}
            >
              <Paper
                elevation={0}
                onClick={() => openPanel()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    openPanel()
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label="Open Fairy Jobmother assistant"
                sx={{
                  ...glass,
                  position: "relative",
                  px: 2,
                  py: 1.25,
                  maxWidth: "min(220px, calc(100vw - 40px))",
                  cursor: "pointer",
                  borderRadius: 3,
                  border: `1px solid ${WELCOME_BUBBLE_BORDER}`,
                  overflow: "visible",
                  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.06)",
                  "&:hover": { bgcolor: "rgba(255, 255, 255, 0.6)" },
                  "&::before": {
                    content: '""',
                    position: "absolute",
                    right: "calc(12% - 1px)",
                    bottom: -11,
                    width: 0,
                    height: 0,
                    borderLeft: "10px solid transparent",
                    borderRight: "5px solid transparent",
                    borderTop: `11px solid ${WELCOME_BUBBLE_BORDER}`,
                  },
                  "&::after": {
                    content: '""',
                    position: "absolute",
                    right: "12%",
                    bottom: -9,
                    width: 0,
                    height: 0,
                    borderLeft: "9px solid transparent",
                    borderRight: "4px solid transparent",
                    borderTop: `10px solid ${glass.bgcolor}`,
                  },
                  "&:hover::after": {
                    borderTop: "10px solid rgba(255, 255, 255, 0.6)",
                  },
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600, color: "#4a1530", lineHeight: 1.4 }}>
                  Hi! I&apos;m your Fairy Jobmother!
                </Typography>
              </Paper>
              <IconButton
                size="small"
                onClick={dismissWelcomeBubble}
                aria-label="Dismiss welcome message"
                sx={{
                  position: "absolute",
                  top: -10,
                  right: -20,
                  zIndex: 3,
                  ...glass,
                  boxShadow: 1,
                  width: 28,
                  height: 28,
                  "&:hover": { bgcolor: "rgba(255, 255, 255, 0.65)" },
                }}
              >
                <CloseIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Box>
          )}

          <Box
            component="button"
            type="button"
            ref={launcherRef}
            onClick={() => openPanel()}
            aria-label="Open Fairy Jobmother help"
            aria-expanded={open}
            aria-controls={open ? DIALOG_DOM_ID : undefined}
            sx={{
              display: "block",
              p: 0,
              m: 0,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              lineHeight: 0,
              borderRadius: 2,
              "&:focus-visible": {
                outline: "2px solid #b03a6c",
                outlineOffset: 2,
              },
            }}
          >
            <Box
              component="img"
              src={FULL_BODY_SRC}
              alt=""
              sx={{
                maxHeight: { xs: 118, sm: 132 },
                width: "auto",
                maxWidth: "min(118px, 32vw)",
                objectFit: "contain",
                objectPosition: "bottom center",
                display: "block",
                pointerEvents: "none",
                bgcolor: "transparent",
                animation: `${jobmotherFloat} 4s ease-in-out infinite`,
              }}
            />
          </Box>
        </Box>
      )}
    </Box>
  )
}
