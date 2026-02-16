"use client";

/**
 * BoothHistoryPage.tsx
 * Purpose:
 * - Student-facing page that shows the student's recently viewed booths.
 * - Reads from Firestore path: users/{uid}/boothHistory (deduped by boothId).
 * - Each item navigates back to the booth view page when clicked.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Button,
  Container,
  Alert,
} from "@mui/material";
import BusinessIcon from "@mui/icons-material/Business";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import HistoryIcon from "@mui/icons-material/History";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";

import { db } from "../firebase";
import { authUtils } from "../utils/auth";
import ProfileMenu from "./ProfileMenu";

/**
 * This type matches what we write in trackBoothView():
 * users/{uid}/boothHistory/{boothId}
 */
type BoothHistoryItem = {
  boothId: string;
  companyName: string;
  industry?: string | null;
  location?: string | null;
  logoUrl?: string | null;
  lastViewedAt?: any; // Firestore Timestamp
};

export default function BoothHistoryPage() {
  const navigate = useNavigate();

  // Current logged-in user info from your existing auth helper
  const user = authUtils.getCurrentUser();

  // Local state: the history list + loading indicator
  const [items, setItems] = useState<BoothHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Pull uid once (so the effect dependencies are clean)
  const uid = useMemo(() => user?.uid ?? null, [user]);

  useEffect(() => {
    /**
     * Loads the student's most recent booth history.
     * We do a one-time fetch here (simple and cheap).
     * Later, if you want it to update live, we can swap getDocs -> onSnapshot.
     */
    const loadHistory = async () => {
      // If not logged in, no history to load
      if (!uid) {
        setItems([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        // Path: users/{uid}/boothHistory
        const ref = collection(db, "users", uid, "boothHistory");

        // Query:
        // - order by lastViewedAt descending (most recent first)
        // - limit to 20 items
        const q = query(ref, orderBy("lastViewedAt", "desc"), limit(20));

        // Execute query
        const snap = await getDocs(q);

        // Convert Firestore docs to typed list
        setItems(snap.docs.map((d) => d.data() as BoothHistoryItem));
      } catch (err) {
        console.error("Failed to load booth history:", err);
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, [uid]);

  // Shared page background color to match the rest of the app
  const pageBg = "#f5f5f5";

  // If user isn't signed in, show a themed message + a way back
  if (!user) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: pageBg }}>
        {/* Header */}
        <Box
          sx={{
            background: "linear-gradient(135deg, #b03a6c 0%, #388560 100%)",
            py: 3,
            px: 4,
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
          }}
        >
          <Container maxWidth="lg">
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <HistoryIcon sx={{ fontSize: 32, color: "white" }} />
                <Typography variant="h5" sx={{ fontWeight: 700, color: "white" }}>
                  Booth History
                </Typography>
              </Box>
              <ProfileMenu />
            </Box>
          </Container>
        </Box>

        <Container maxWidth="lg" sx={{ py: 4 }}>
          <Card sx={{ p: 2, border: "1px solid rgba(56, 133, 96, 0.3)" }}>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>
                Please sign in to view your booth history.
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Once you visit booths, they’ll appear here as your “recently viewed” list.
              </Typography>
              <Button
                variant="contained"
                onClick={() => navigate("/login")}
                sx={{
                  background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
                  "&:hover": {
                    background: "linear-gradient(135deg, #2d6b4d 0%, #388560 100%)",
                  },
                }}
              >
                Go to Login
              </Button>
            </CardContent>
          </Card>
        </Container>
      </Box>
    );
  }

  // Optional guard: only students should use this
  if (user.role !== "student") {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: pageBg }}>
        {/* Header */}
        <Box
          sx={{
            background: "linear-gradient(135deg, #b03a6c 0%, #388560 100%)",
            py: 3,
            px: 4,
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
          }}
        >
          <Container maxWidth="lg">
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <HistoryIcon sx={{ fontSize: 32, color: "white" }} />
                <Typography variant="h5" sx={{ fontWeight: 700, color: "white" }}>
                  Booth History
                </Typography>
              </Box>
              <ProfileMenu />
            </Box>
          </Container>
        </Box>

        <Container maxWidth="lg" sx={{ py: 4 }}>
          <Card sx={{ p: 2, border: "1px solid rgba(176, 58, 108, 0.3)" }}>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>
                Students only
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                This page is only available for student accounts.
              </Typography>
              <Button
                variant="contained"
                onClick={() => navigate("/dashboard")}
                sx={{
                  background: "linear-gradient(135deg, #b03a6c 0%, #8a2d54 100%)",
                  "&:hover": {
                    background: "linear-gradient(135deg, #8a2d54 0%, #b03a6c 100%)",
                  },
                }}
              >
                Back to Dashboard
              </Button>
            </CardContent>
          </Card>
        </Container>
      </Box>
    );
  }

  // Loading state
  if (loading) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          bgcolor: pageBg,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: pageBg }}>
      {/* Header (matches Booths / BoothView / Dashboard styling) */}
      <Box
        sx={{
          background: "linear-gradient(135deg, #b03a6c 0%, #388560 100%)",
          py: 3,
          px: 4,
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
        }}
      >
        <Container maxWidth="lg">
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <HistoryIcon sx={{ fontSize: 32, color: "white" }} />
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 700, color: "white" }}>
                  Booth History
                </Typography>
                <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.9)" }}>
                  Your recently viewed company booths
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Button
                variant="outlined"
                onClick={() => navigate("/dashboard")}
                startIcon={<ArrowBackIcon />}
                sx={{
                  color: "white",
                  borderColor: "white",
                  "&:hover": {
                    borderColor: "white",
                    bgcolor: "rgba(255,255,255,0.1)",
                  },
                }}
              >
                Dashboard
              </Button>

              <Button
                variant="contained"
                onClick={() => navigate("/booths")}
                sx={{
                  background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
                  "&:hover": {
                    background: "linear-gradient(135deg, #2d6b4d 0%, #388560 100%)",
                  },
                }}
              >
                Browse Booths
              </Button>

              <ProfileMenu />
            </Box>
          </Box>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Empty state */}
        {items.length === 0 ? (
          <Alert
            severity="info"
            sx={{
              borderRadius: 2,
              bgcolor: "rgba(56, 133, 96, 0.1)",
              border: "1px solid rgba(56, 133, 96, 0.3)",
            }}
          >
            <Typography sx={{ fontWeight: 800, mb: 0.5 }}>
              No booth history yet
            </Typography>
            <Typography variant="body2">
              Visit a booth and it will show up here as your recently viewed list.
            </Typography>

            <Box sx={{ mt: 2 }}>
              <Button
                variant="contained"
                onClick={() => navigate("/booths")}
                sx={{
                  background: "linear-gradient(135deg, #b03a6c 0%, #8a2d54 100%)",
                  "&:hover": {
                    background: "linear-gradient(135deg, #8a2d54 0%, #b03a6c 100%)",
                  },
                }}
              >
                Browse Booths
              </Button>
            </Box>
          </Alert>
        ) : (
          // List of history cards
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {items.map((it) => {
              const viewedText =
                it.lastViewedAt?.toDate
                  ? `Viewed ${it.lastViewedAt.toDate().toLocaleString()}`
                  : "";

              return (
                <Card
                  key={it.boothId}
                  sx={{
                    bgcolor: "white",
                    border: "1px solid rgba(56, 133, 96, 0.3)",
                    borderRadius: 2,
                    cursor: "pointer",
                    transition: "transform 0.2s, box-shadow 0.2s",
                    "&:hover": {
                      transform: "translateY(-2px)",
                      boxShadow: "0 8px 24px rgba(56, 133, 96, 0.25)",
                    },
                  }}
                  // Clicking a card opens the booth page
                  onClick={() => navigate(`/booth/${it.boothId}`)}
                >
                  <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, p: 3 }}>
                    {/* Logo thumbnail */}
                    {it.logoUrl ? (
                      <Box
                        component="img"
                        src={it.logoUrl}
                        alt={`${it.companyName} logo`}
                        sx={{
                          width: 64,
                          height: 64,
                          borderRadius: 2,
                          objectFit: "cover",
                          border: "1px solid rgba(0,0,0,0.08)",
                        }}
                      />
                    ) : (
                      <Box
                        sx={{
                          width: 64,
                          height: 64,
                          borderRadius: 2,
                          background:
                            "linear-gradient(135deg, rgba(56, 133, 96, 0.12) 0%, rgba(176, 58, 108, 0.12) 100%)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "1px solid rgba(56, 133, 96, 0.2)",
                        }}
                      >
                        <BusinessIcon sx={{ fontSize: 34, color: "#388560" }} />
                      </Box>
                    )}

                    {/* Main text */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 800, color: "#1a1a1a" }} noWrap>
                        {it.companyName}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {it.location ?? ""}
                      </Typography>
                    </Box>

                    {/* Viewed time */}
                    <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                      {viewedText}
                    </Typography>
                  </CardContent>
                </Card>
              );
            })}
          </Box>
        )}
      </Container>
    </Box>
  );
}
