
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, Container, TextField, Typography, Alert } from "@mui/material";

export default function StudentProfilePage() {
  const navigate = useNavigate();

  const [major, setMajor] = useState<string>("");
  const [year, setYear] = useState<string>("");
  const [skills, setSkills] = useState<string>("");
  const [error, setError] = useState<string>("");

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!major || !year) {
      setError("Major and Expected Graduation Year are required.");
      return;
    }
    setError("");
    console.log("Saved profile:", { major, year, skills });
    alert("Profile saved!"); // placeholder for API call
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 6, p: 4, borderRadius: 3, boxShadow: 3, backgroundColor: "#f5f5f5" }}>
      <Typography variant="h4" gutterBottom textAlign="center">
        Customize Profile
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box component="form" onSubmit={handleSave}>
        <TextField
          fullWidth
          label="Major"
          value={major}
          onChange={(e) => setMajor(e.target.value)}
          margin="normal"
          required
        />
        <TextField
          fullWidth
          label="Expected Graduation Year"
          type="number"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          margin="normal"
          required
        />
        <TextField
          fullWidth
          label="Skills"
          placeholder="e.g. Python, React, SQL"
          value={skills}
          onChange={(e) => setSkills(e.target.value)}
          margin="normal"
        />

        <Box sx={{ display: "flex", justifyContent: "space-between", mt: 3 }}>
          <Button variant="outlined" color="secondary" onClick={() => navigate("/dashboard")}>
            ← Back
          </Button>
          <Button type="submit" variant="contained" color="primary">
            Save Profile
          </Button>
        </Box>
      </Box>
    </Container>
  );
}
