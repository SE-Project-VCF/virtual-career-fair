"use client"

import { useState, type FormEvent } from "react"
import { useNavigate, Link } from "react-router-dom"
import { Container, Box, TextField, Button, Typography, Alert, Paper, MenuItem, Select, FormControl, InputLabel, Tooltip } from "@mui/material"
import { authUtils } from "../utils/auth"
import PersonAddIcon from "@mui/icons-material/PersonAdd"
import WorkIcon from "@mui/icons-material/Work"
import GroupsIcon from "@mui/icons-material/Groups"
import TrendingUpIcon from "@mui/icons-material/TrendingUp"
import GoogleIcon from "@mui/icons-material/Google"
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material"
import { doc, setDoc } from "firebase/firestore"
import { db } from "../firebase"
import { auth } from "../firebase"


type RoleType = "student" | "companyOwner" | "representative" | ""

export default function Register() {
  const navigate = useNavigate()
  const [role, setRole] = useState<RoleType>("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")

  // Student fields
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [school, setSchool] = useState("")
  const [major, setMajor] = useState("")

  // Representative fields
  const [inviteCode, setInviteCode] = useState("")

  // ------------------------------
  // Google Profile Completion Dialog State
  // ------------------------------
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [googleFirstName, setGoogleFirstName] = useState("");
  const [googleLastName, setGoogleLastName] = useState("");
  // Student-specific Google fields
  const [googleSchool, setGoogleSchool] = useState("")
  const [googleMajor, setGoogleMajor] = useState("")




  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError("")

    if (!role) {
      setError("Please select a role.")
      return
    }

    if (!email || !password || !confirmPassword) {
      setError("Email, password, and confirm password are required.")
      return
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.")
      return
    }

    // First name and last name are required for all roles
    if (!firstName || !lastName) {
      setError("First name and last name are required.")
      return
    }

    let result

    if (role === "student") {
      const studentData: any = {
        firstName,
        lastName,
      };
      if (school && school.trim()) {
        studentData.school = school.trim();
      }
      if (major && major.trim()) {
        studentData.major = major.trim();
      }
      result = await authUtils.registerUser(email, password, "student", studentData)
    } else if (role === "companyOwner") {
      result = await authUtils.registerUser(email, password, "companyOwner", {
        firstName,
        lastName,
      })
    } else if (role === "representative") {
      // Invite code is optional for representatives
      const representativeData: any = {
        firstName,
        lastName,
      };
      if (inviteCode && inviteCode.trim()) {
        representativeData.inviteCode = inviteCode.trim();
      }
      result = await authUtils.registerUser(email, password, "representative", representativeData)
    } else {
      setError("Invalid role selected.")
      return
    }

    if (result.success) {
      if (result.needsVerification) {
        navigate("/verification-pending", { state: { email } })
      } else {
        navigate("/login")
      }
    } else {
      setError(result.error || "Registration failed.")
    }
  }

  const handleGoogleRegister = async () => {
    if (!role) {
      setError("Please select an account type first.");
      return;
    }

    setError("");

    try {
      const result = await authUtils.loginWithGoogle(
        role as "student" | "representative" | "companyOwner"
        , true);

      if (result.success) {
        if (result.needsProfile) {
          const currentUser = auth.currentUser;

          if (currentUser?.displayName) {
            const parts = currentUser.displayName.trim().split(" ");
            setGoogleFirstName(parts[0] || "");
            setGoogleLastName(parts.slice(1).join(" ") || "");
          } else {
            setGoogleFirstName("");
            setGoogleLastName("");
          }

          // reset student fields
          setGoogleSchool("");
          setGoogleMajor("");

          setShowProfileDialog(true);
          return;
        }


        // No missing fields — continue normally
        navigate("/dashboard");
      } else {
        setError(result.error || "Google registration failed.");
      }
    } catch (err: any) {
      console.error("Google registration error:", err);
      setError("Failed to register with Google. Please try again.");
    }
  };


  const getGradientColor = () => {
    if (role === "student") return "linear-gradient(135deg, #b03a6c 0%, #8a2d54 100%)"
    if (role === "companyOwner") return "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)"
    return "linear-gradient(135deg, #b03a6c 0%, #388560 100%)"
  }

  const getBorderColor = () => {
    if (role === "student") return "#b03a6c"
    if (role === "companyOwner") return "#388560"
    return "#b03a6c"
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        background: "linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)",
      }}
    >
      <Box
        sx={{
          flex: 1,
          display: { xs: "none", md: "flex" },
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: getGradientColor(),
          color: "white",
          p: 6,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            position: "absolute",
            width: "300px",
            height: "300px",
            borderRadius: "50%",
            background: "rgba(255, 255, 255, 0.1)",
            top: "-100px",
            right: "-100px",
          }}
        />
        <Box
          sx={{
            position: "absolute",
            width: "200px",
            height: "200px",
            borderRadius: "50%",
            background: "rgba(255, 255, 255, 0.05)",
            bottom: "50px",
            left: "-50px",
          }}
        />

        <Box sx={{ zIndex: 1, maxWidth: "400px" }}>
          <Typography variant="h3" sx={{ fontWeight: 700, mb: 2 }}>
            Join Our Platform
          </Typography>
          <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>
            Create your account and start your journey
          </Typography>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <WorkIcon sx={{ fontSize: 40 }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Career Opportunities
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.8 }}>
                  Connect with top employers and students
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <GroupsIcon sx={{ fontSize: 40 }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Virtual Networking
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.8 }}>
                  Connect from anywhere, anytime
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <TrendingUpIcon sx={{ fontSize: 40 }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Grow Your Career
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.8 }}>
                  Find opportunities that match your goals
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>

      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 4,
        }}
      >
        <Container maxWidth="sm">
          <Paper
            elevation={0}
            sx={{
              p: { xs: 3, sm: 5 },
              borderRadius: 3,
              background: "rgba(255, 255, 255, 0.98)",
            }}
          >
            <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
              <Box
                sx={{
                  width: 60,
                  height: 60,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #b03a6c 0%, #388560 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <PersonAddIcon sx={{ fontSize: 32, color: "white" }} />
              </Box>
            </Box>

            <Typography
              variant="h4"
              component="h1"
              gutterBottom
              align="center"
              sx={{ fontWeight: 700, color: "#1a1a1a" }}
            >
              Create Account
            </Typography>
            <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 4 }}>
              Register to access career opportunities
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
                {error}
              </Alert>
            )}

            <form onSubmit={handleSubmit}>
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel id="role-select-label">Account Type</InputLabel>
                <Select
                  labelId="role-select-label"
                  value={role}
                  label="Account Type"
                  onChange={(e) => setRole(e.target.value as RoleType)}
                  required
                  sx={{
                    borderRadius: 2,
                    "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                      borderColor: getBorderColor(),
                    },
                  }}
                >
                  <MenuItem value="student">Student</MenuItem>
                  <MenuItem value="companyOwner">Company Owner</MenuItem>
                  <MenuItem value="representative">Representative</MenuItem>
                </Select>
              </FormControl>

              <TextField
                fullWidth
                label="Email Address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                margin="normal"
                required
                sx={{
                  mb: 2,
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                    "&.Mui-focused fieldset": {
                      borderColor: getBorderColor(),
                    },
                  },
                  "& .MuiInputLabel-root.Mui-focused": {
                    color: getBorderColor(),
                  },
                }}
              />
              <TextField
                fullWidth
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                margin="normal"
                required
                helperText="Minimum 6 characters"
                sx={{
                  mb: 2,
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                    "&.Mui-focused fieldset": {
                      borderColor: getBorderColor(),
                    },
                  },
                  "& .MuiInputLabel-root.Mui-focused": {
                    color: getBorderColor(),
                  },
                }}
              />
              <TextField
                fullWidth
                label="Confirm Password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                margin="normal"
                required
                sx={{
                  mb: 3,
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                    "&.Mui-focused fieldset": {
                      borderColor: getBorderColor(),
                    },
                  },
                  "& .MuiInputLabel-root.Mui-focused": {
                    color: getBorderColor(),
                  },
                }}
              />

              {/* First Name and Last Name - Required for all roles */}
              <TextField
                fullWidth
                label="First Name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                margin="normal"
                required
                sx={{
                  mb: 2,
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                    "&.Mui-focused fieldset": {
                      borderColor: getBorderColor(),
                    },
                  },
                  "& .MuiInputLabel-root.Mui-focused": {
                    color: getBorderColor(),
                  },
                }}
              />
              <TextField
                fullWidth
                label="Last Name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                margin="normal"
                required
                sx={{
                  mb: 2,
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                    "&.Mui-focused fieldset": {
                      borderColor: getBorderColor(),
                    },
                  },
                  "& .MuiInputLabel-root.Mui-focused": {
                    color: getBorderColor(),
                  },
                }}
              />

              {/* Student-specific fields */}
              {role === "student" && (
                <>
                  <TextField
                    fullWidth
                    label="School"
                    value={school}
                    onChange={(e) => setSchool(e.target.value)}
                    margin="normal"
                    sx={{
                      mb: 2,
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        "&.Mui-focused fieldset": {
                          borderColor: "#b03a6c",
                        },
                      },
                      "& .MuiInputLabel-root.Mui-focused": {
                        color: "#b03a6c",
                      },
                    }}
                  />
                  <TextField
                    fullWidth
                    label="Major"
                    value={major}
                    onChange={(e) => setMajor(e.target.value)}
                    margin="normal"
                    sx={{
                      mb: 3,
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        "&.Mui-focused fieldset": {
                          borderColor: "#b03a6c",
                        },
                      },
                      "& .MuiInputLabel-root.Mui-focused": {
                        color: "#b03a6c",
                      },
                    }}
                  />
                </>
              )}

              {/* Company Owner-specific fields */}
              {role === "companyOwner" && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  You can create companies after registration from your dashboard.
                </Typography>
              )}

              {/* Representative-specific fields */}
              {role === "representative" && (
                <>
                  <TextField
                    fullWidth
                    label="Invite Code (Optional)"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    margin="normal"
                    helperText="Get this code from your employer (optional)"
                    sx={{
                      mb: 3,
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        "&.Mui-focused fieldset": {
                          borderColor: "#b03a6c",
                        },
                      },
                      "& .MuiInputLabel-root.Mui-focused": {
                        color: "#b03a6c",
                      },
                    }}
                  />
                </>
              )}

              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                sx={{
                  mt: 1,
                  mb: 3,
                  py: 1.5,
                  borderRadius: 2,
                  background: getGradientColor(),
                  fontSize: "1.1rem",
                  fontWeight: 600,
                  textTransform: "none",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                  "&:hover": {
                    background: getGradientColor(),
                    filter: "brightness(0.9)",
                    boxShadow: "0 6px 16px rgba(0,0,0,0.4)",
                  },
                }}
              >
                Create Account
              </Button>
            </form>

            {/* Google Sign-In button */}
            <Tooltip
              title={!role ? "Please select an account type first" : ""}
              arrow
              placement="top"
            >
              <span>
                <Button
                  fullWidth
                  variant="outlined"
                  size="large"
                  startIcon={<GoogleIcon />}
                  onClick={handleGoogleRegister}
                  disabled={!role}
                  sx={{
                    mt: 2,
                    py: 1.3,
                    borderRadius: 2,
                    fontSize: "1rem",
                    fontWeight: 600,
                    textTransform: "none",
                    borderColor: "#4285F4",
                    color: "#4285F4",
                    "&:hover": {
                      backgroundColor: "rgba(66, 133, 244, 0.1)",
                      borderColor: "#4285F4",
                    },
                    "&:disabled": {
                      borderColor: "#ccc",
                      color: "#ccc",
                    },
                  }}
                >
                  Register with Google
                </Button>
              </span>
            </Tooltip>

            <Box sx={{ textAlign: "center", mt: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Already have an account?{" "}
                <Link
                  to="/login"
                  style={{
                    color: "#388560",
                    textDecoration: "none",
                    fontWeight: 600,
                  }}
                >
                  Sign in here
                </Link>
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                <Link
                  to="/"
                  style={{
                    color: "#666",
                    textDecoration: "none",
                  }}
                >
                  ← Back to Home
                </Link>
              </Typography>
            </Box>
          </Paper>
        </Container>
      </Box>
      {/* Google Profile Completion Dialog */}
      <Dialog open={showProfileDialog}>
        <DialogTitle>Complete Your Profile</DialogTitle>

        <DialogContent>
          {/* Always show name fields – prefilled from Google if available */}
          <TextField
            fullWidth
            label="First Name"
            value={googleFirstName}
            onChange={(e) => setGoogleFirstName(e.target.value)}
            sx={{ mt: 2 }}
          />

          <TextField
            fullWidth
            label="Last Name"
            value={googleLastName}
            onChange={(e) => setGoogleLastName(e.target.value)}
            sx={{ mt: 2 }}
          />

          {/* Student-specific fields */}
          {role === "student" && (
            <>
              <TextField
                fullWidth
                label="School"
                value={googleSchool}
                onChange={(e) => setGoogleSchool(e.target.value)}
                sx={{ mt: 2 }}
              />

              <TextField
                fullWidth
                label="Major"
                value={googleMajor}
                onChange={(e) => setGoogleMajor(e.target.value)}
                sx={{ mt: 2 }}
              />
            </>
          )}
        </DialogContent>


        <DialogActions>
          <Button onClick={() => setShowProfileDialog(false)}>Cancel</Button>

          <Button
            variant="contained"
            disabled={
              !googleFirstName.trim() ||
              !googleLastName.trim() ||
              (role === "student" && (!googleSchool.trim() || !googleMajor.trim()))
            }
            onClick={async () => {
              const currentUser = auth.currentUser;
              if (!currentUser) return;

              const userRef = doc(db, "users", currentUser.uid);

              // Build the full user data object
              const userData: any = {
                uid: currentUser.uid,
                email: currentUser.email,
                role,
                firstName: googleFirstName.trim(),
                lastName: googleLastName.trim(),
                createdAt: new Date().toISOString(),
                provider: "google",
              };

              if (role === "student") {
                userData.school = googleSchool.trim();
                userData.major = googleMajor.trim();
              }

              // Save user in Firestore
              await setDoc(userRef, userData);

              // Persist user to localStorage
              localStorage.setItem(
                "currentUser",
                JSON.stringify(userData)
              );

              setShowProfileDialog(false);
              navigate("/dashboard");
            }}
          >
            Save
          </Button>

        </DialogActions>

      </Dialog>


    </Box >
  )
}

