import { useCallback, useEffect, useId, useRef, useState } from "react"
import {
  Box,
  IconButton,
  Paper,
  TextField,
  Typography,
  InputAdornment,
} from "@mui/material"
import CloseIcon from "@mui/icons-material/Close"
import SendIcon from "@mui/icons-material/Send"
import { JOBMOTHER_TEASER_DISMISSED_KEY } from "../../constants/jobmother"
import { jobmotherFloat } from "./jobmotherFloat"

/** Full-body illustration for the welcome teaser */
const FULL_BODY_SRC = "/assets/mascot/fairy-jobmother-cartoon-full.png"
/** Head-only asset for the small launcher (never use full-body here) */
const AVATAR_SRC = "/assets/mascot/fairy-jobmother-cartoon-avatar.png"

const PLACEHOLDER_ASSISTANT_REPLY =
  "Thanks! Full AI answers will arrive in a future update."

export type JobmotherMessage = {
  id: string
  role: "user" | "assistant"
  text: string
}

function nextId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

const DIALOG_DOM_ID = "fairy-jobmother-dialog"

/** Frosted glass — reads as transparent over page content */
const glass = {
  bgcolor: "rgba(255, 255, 255, 0.45)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
} as const

/** Teaser speech bubble border (tail uses same for outline) */
const TEASER_BUBBLE_BORDER = "rgba(176, 58, 108, 0.28)"

function readTeaserDismissed(): boolean {
  try {
    return globalThis.localStorage?.getItem(JOBMOTHER_TEASER_DISMISSED_KEY) === "true"
  } catch {
    return false
  }
}

export default function FairyJobmotherAssistant() {
  const titleId = useId()
  const [open, setOpen] = useState(false)
  const [teaserDismissed, setTeaserDismissed] = useState(readTeaserDismissed)
  const [messages, setMessages] = useState<JobmotherMessage[]>([])
  const [draft, setDraft] = useState("")
  const launcherRef = useRef<HTMLButtonElement>(null)
  const teaserLauncherRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const replyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const focusLauncher = useCallback(() => {
    queueMicrotask(() => {
      if (teaserDismissed) launcherRef.current?.focus()
      else teaserLauncherRef.current?.focus()
    })
  }, [teaserDismissed])

  const close = useCallback(() => {
    setOpen(false)
    if (replyTimerRef.current) {
      clearTimeout(replyTimerRef.current)
      replyTimerRef.current = null
    }
    focusLauncher()
  }, [focusLauncher])

  const openPanel = useCallback(() => {
    setOpen(true)
    queueMicrotask(() => inputRef.current?.focus())
  }, [])

  const dismissTeaser = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setTeaserDismissed(true)
    try {
      globalThis.localStorage?.setItem(JOBMOTHER_TEASER_DISMISSED_KEY, "true")
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

  useEffect(
    () => () => {
      if (replyTimerRef.current) clearTimeout(replyTimerRef.current)
    },
    []
  )

  const send = useCallback(() => {
    const text = draft.trim()
    if (!text) return
    setDraft("")
    setMessages((prev) => [...prev, { id: nextId(), role: "user", text }])
    replyTimerRef.current = setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "assistant", text: PLACEHOLDER_ASSISTANT_REPLY },
      ])
      replyTimerRef.current = null
    }, 400)
  }, [draft])

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const showTeaser = !teaserDismissed
  const showSmallLauncher = teaserDismissed

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
            maxHeight: "min(480px, 50vh)",
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
                Tips & tours (coming soon) · Beta
              </Typography>
            </Box>
            <IconButton
              size="small"
              onClick={close}
              aria-label="Close Fairy Jobmother"
              sx={{ color: "white", "&:hover": { bgcolor: "rgba(255,255,255,0.15)" } }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          <Box
            ref={listRef}
            sx={{
              flex: 1,
              minHeight: 160,
              maxHeight: 280,
              overflow: "auto",
              px: 1.5,
              py: 1,
              bgcolor: "rgba(255, 255, 255, 0.35)",
            }}
          >
            {messages.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                Ask me how to use Job Goblin — I&apos;ll share more once our AI guide is connected.
              </Typography>
            ) : (
              messages.map((m) => (
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
                  </Box>
                </Box>
              ))
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
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        color="primary"
                        aria-label="Send message"
                        onClick={() => send()}
                        disabled={!draft.trim()}
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

      {!open && showTeaser && (
        <Box
          sx={{
            position: "relative",
            alignSelf: "flex-end",
            display: "inline-block",
            maxWidth: "min(100vw - 32px, 320px)",
          }}
        >
          {/* Right-align bubble with the mascot; offset left slightly so it sits over the fairy more. */}
          <Box
            sx={{
              position: "absolute",
              right: "60px",
              left: "auto",
              bottom: "calc(100% + 10px)",
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
                border: `1px solid ${TEASER_BUBBLE_BORDER}`,
                overflow: "visible",
                boxShadow: "0 4px 16px rgba(0, 0, 0, 0.06)",
                "&:hover": { bgcolor: "rgba(255, 255, 255, 0.6)" },
                // Speech tail: border layer + fill (same rgba as glass.bgcolor; tail can’t use backdrop-filter)
                "&::before": {
                  content: '""',
                  position: "absolute",
                  right: "calc(12% - 1px)",
                  bottom: -11,
                  width: 0,
                  height: 0,
                  borderLeft: "10px solid transparent",
                  borderRight: "5px solid transparent",
                  borderTop: `11px solid ${TEASER_BUBBLE_BORDER}`,
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
              onClick={dismissTeaser}
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

          <Box
            component="button"
            type="button"
            ref={teaserLauncherRef}
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
                maxHeight: { xs: 140, sm: 160 },
                width: "auto",
                maxWidth: "min(140px, 35vw)",
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

      {!open && showSmallLauncher && (
        <IconButton
          ref={launcherRef}
          onClick={() => openPanel()}
          aria-label="Open Fairy Jobmother help"
          aria-expanded={open}
          aria-controls={open ? DIALOG_DOM_ID : undefined}
          sx={{
            width: 56,
            height: 56,
            p: 0,
            boxShadow: 3,
            border: "2px solid rgba(255, 255, 255, 0.65)",
            ...glass,
            "&:hover": { bgcolor: "rgba(255, 255, 255, 0.65)" },
          }}
        >
          <Box
            component="img"
            src={AVATAR_SRC}
            alt=""
            sx={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              objectFit: "cover",
              display: "block",
            }}
          />
        </IconButton>
      )}
    </Box>
  )
}
