"use client"

import { useState, useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  Container,
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import SearchIcon from "@mui/icons-material/Search"
import VisibilityIcon from "@mui/icons-material/Visibility"
import { doc, getDoc } from "firebase/firestore"
import { db } from "../firebase"
import { authUtils } from "../utils/auth"
import { API_URL } from "../config"
import BaseLayout from "../components/BaseLayout"
import StudentProfileCard from "../components/StudentProfileCard"

interface Visitor {
  studentId: string;
  firstName: string;
  lastName: string;
  email: string;
  major: string;
  firstViewedAt: any;
  lastViewedAt: any;
  viewCount: number;
  isCurrentlyViewing: boolean;
}

interface BoothData {
  id: string;
  companyName: string;
  location?: string;
  companyId?: string;
}

export default function BoothVisitorsPage() {
  const navigate = useNavigate();
  const { boothId } = useParams<{ boothId: string }>();

  const [booth, setBooth] = useState<BoothData | null>(null);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filter and search state
  const [filterStatus, setFilterStatus] = useState<"all" | "current" | "previous">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [majorFilter, setMajorFilter] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "name" | "viewCount">("recent");

  // Profile dialog
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Visitor | null>(null);

  useEffect(() => {
    if (!boothId) {
      navigate("/company");
      return;
    }

    fetchBoothAndVisitors();

    // Auto-refresh visitor list every 5 seconds to show current visitors
    const refreshInterval = setInterval(() => {
      fetchVisitors();
    }, 5000);

    return () => clearInterval(refreshInterval);
  }, [boothId, navigate]);

  // Re-fetch when filter, search, or sort changes
  useEffect(() => {
    if (boothId && !loading) {
      fetchVisitors();
    }
  }, [filterStatus, searchQuery, majorFilter, sortBy, boothId, loading]);

  const fetchBoothAndVisitors = async () => {
    try {
      setLoading(true);
      setError("");

      // Guard against undefined boothId
      if (!boothId) {
        setError("Invalid booth ID");
        setLoading(false);
        return;
      }

      // Fetch booth data
      const boothDoc = await getDoc(doc(db, "booths", boothId));

      if (!boothDoc.exists()) {
        setError("Booth not found");
        setLoading(false);
        return;
      }

      const boothData: BoothData = {
        id: boothDoc.id,
        ...boothDoc.data(),
      } as BoothData;

      setBooth(boothData);

      // Fetch visitors from backend
      fetchVisitors();
    } catch (err: any) {
      console.error("Error fetching booth:", err);
      setError("Failed to load booth data");
      setLoading(false);
    }
  };

  const fetchVisitors = async () => {
    try {
      const token = await authUtils.getIdToken();
      if (!token || !boothId) return;

      const params = new URLSearchParams();
      params.append("filter", filterStatus);
      if (searchQuery) params.append("search", searchQuery);
      if (majorFilter) params.append("major", majorFilter);
      params.append("sort", sortBy);

      const response = await fetch(`${API_URL}/api/booth-visitors/${boothId}?${params}`, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch visitors");
      }

      const data = await response.json();
      setVisitors(data.visitors || []);
    } catch (err: any) {
      console.error("Error fetching visitors:", err);
      setError("Failed to load booth visitors");
    } finally {
      setLoading(false);
    }
  };

  const handleViewProfile = (visitor: Visitor) => {
    setSelectedStudent(visitor);
    setProfileDialogOpen(true);
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "N/A";
    try {
      let date: Date;
      
      // Handle Firestore Timestamp objects
      if (timestamp && typeof timestamp === 'object') {
        // Firestore Timestamp with toMillis() method
        if (typeof timestamp.toMillis === 'function') {
          date = new Date(timestamp.toMillis());
        } 
        // Firestore Timestamp serialized as { _seconds, _nanoseconds }
        else if (timestamp._seconds) {
          date = new Date(timestamp._seconds * 1000 + timestamp._nanoseconds / 1000000);
        }
        // Standard { seconds, nanoseconds } format
        else if (timestamp.seconds) {
          date = new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000);
        }
        // ISO string
        else if (typeof timestamp === 'string') {
          date = new Date(timestamp);
        }
        // Fallback to treating as milliseconds
        else {
          date = new Date(Number(timestamp));
        }
      } else {
        // Assume it's milliseconds or a number
        date = new Date(Number(timestamp));
      }
      
      if (Number.isNaN(date.getTime())) {
        return "N/A";
      }
      
      return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "N/A";
    }
  };

  if (loading) {
    return (
      <BaseLayout pageTitle="Booth Visitors">
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "50vh" }}>
          <CircularProgress />
        </Box>
      </BaseLayout>
    );
  }

  if (error || !booth) {
    return (
      <BaseLayout pageTitle="Booth Visitors">
        <Box sx={{ minHeight: "50vh", bgcolor: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Card sx={{ p: 4, maxWidth: 500, border: "1px solid rgba(56, 133, 96, 0.3)" }}>
            <Alert severity="error" sx={{ mb: 2 }}>
              {error || "Booth not found"}
            </Alert>
            <Button onClick={() => navigate("/companies")} variant="contained" fullWidth>
              Back to Companies
            </Button>
          </Card>
        </Box>
      </BaseLayout>
    );
  }

  return (
    <BaseLayout pageTitle={`Booth Visitors - ${booth.companyName}`}>
      <Box sx={{ minHeight: "100vh", bgcolor: "#f5f5f5" }}>
        <Container maxWidth="lg" sx={{ py: 4 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
            <Button
              onClick={() => navigate(-1)}
              startIcon={<ArrowBackIcon />}
              sx={{
                borderColor: "#388560",
                color: "#388560",
                "&:hover": {
                  bgcolor: "rgba(56, 133, 96, 0.1)",
                },
              }}
              variant="outlined"
            >
              Back
            </Button>
            <Typography variant="subtitle1" color="text.secondary">
              {booth.companyName}
            </Typography>
          </Box>
        {/* Stats Cards */}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2, mb: 4 }}>
          <Card sx={{ background: "linear-gradient(135deg, #388560 0%, rgba(56, 133, 96, 0.8) 100%)", color: "white" }}>
            <CardContent sx={{ textAlign: "center" }}>
              <Typography variant="body2" sx={{ opacity: 0.9, mb: 1 }}>
                Total Visitors
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: "bold" }}>
                {visitors.length}
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ background: "linear-gradient(135deg, #b03a6c 0%, rgba(176, 58, 108, 0.8) 100%)", color: "white" }}>
            <CardContent sx={{ textAlign: "center" }}>
              <Typography variant="body2" sx={{ opacity: 0.9, mb: 1 }}>
                Currently Viewing
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: "bold" }}>
                {visitors.filter(v => v.isCurrentlyViewing).length}
              </Typography>
            </CardContent>
          </Card>
        </Box>

        {/* Filters */}
        <Card sx={{ mb: 3, p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: "bold" }}>
            Filters & Search
          </Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr 1fr" }, gap: 2 }}>
            <TextField
              label="Search Name or Email"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              variant="outlined"
              size="small"
              InputProps={{
                startAdornment: <SearchIcon sx={{ mr: 1, color: "rgba(0,0,0,0.4)" }} />,
              }}
              fullWidth
            />

            <FormControl size="small" fullWidth>
              <InputLabel>Filter by Status</InputLabel>
              <Select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as "all" | "current" | "previous")}
                label="Filter by Status"
              >
                <MenuItem value="all">All Visitors</MenuItem>
                <MenuItem value="current">Currently Viewing</MenuItem>
                <MenuItem value="previous">Previous Visitors</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="Filter by Major"
              value={majorFilter}
              onChange={(e) => setMajorFilter(e.target.value)}
              variant="outlined"
              size="small"
              fullWidth
            />

            <FormControl size="small" fullWidth>
              <InputLabel>Sort By</InputLabel>
              <Select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "recent" | "name" | "viewCount")}
                label="Sort By"
              >
                <MenuItem value="recent">Most Recent</MenuItem>
                <MenuItem value="name">Name (A-Z)</MenuItem>
                <MenuItem value="viewCount">View Count</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </Card>

        {/* Visitors Table */}
        <Card>
          <TableContainer component={Paper} sx={{ boxShadow: "none" }}>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: "rgba(56, 133, 96, 0.1)" }}>
                  <TableCell sx={{ fontWeight: "bold", color: "#388560" }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: "bold", color: "#388560" }}>Email</TableCell>
                  <TableCell sx={{ fontWeight: "bold", color: "#388560" }}>Major</TableCell>
                  <TableCell align="center" sx={{ fontWeight: "bold", color: "#388560" }}>
                    Views
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold", color: "#388560" }}>Last Viewed</TableCell>
                  <TableCell align="center" sx={{ fontWeight: "bold", color: "#388560" }}>
                    Status
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: "bold", color: "#388560" }}>
                    Action
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visitors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                      <Typography variant="body2" color="textSecondary">
                        No visitors found
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  visitors.map((visitor) => (
                    <TableRow key={visitor.studentId} sx={{ "&:hover": { bgcolor: "rgba(56, 133, 96, 0.05)" } }}>
                      <TableCell>{`${visitor.firstName} ${visitor.lastName}`}</TableCell>
                      <TableCell>{visitor.email}</TableCell>
                      <TableCell>{visitor.major || "N/A"}</TableCell>
                      <TableCell align="center">
                        <Chip label={visitor.viewCount} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>{formatDate(visitor.lastViewedAt)}</TableCell>
                      <TableCell align="center">
                        {visitor.isCurrentlyViewing ? (
                          <Chip
                            label="Viewing"
                            size="small"
                            sx={{
                              bgcolor: "#388560",
                              color: "white",
                              fontWeight: "bold",
                            }}
                            icon={<VisibilityIcon />}
                          />
                        ) : (
                          <Chip label="Visited" size="small" variant="outlined" />
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleViewProfile(visitor)}
                          sx={{
                            borderColor: "#388560",
                            color: "#388560",
                            "&:hover": {
                              bgcolor: "rgba(56, 133, 96, 0.1)",
                            },
                          }}
                        >
                          View Profile
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      </Container>

      {/* Student Profile Dialog */}
      <Dialog open={profileDialogOpen} onClose={() => setProfileDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: "rgba(56, 133, 96, 0.1)", fontWeight: "bold" }}>
          Student Profile
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {selectedStudent && (
            <StudentProfileCard studentId={selectedStudent.studentId} />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProfileDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
   </Box> </BaseLayout>
  );
}
