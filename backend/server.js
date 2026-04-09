require("dotenv").config();

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

// Fair routes (multi-fair support)
const fairsRouter = require("./routes/fairs");
const shortlistRouter = require("./routes/shortlist");
const { suggestPlaces } = require("./services/mapboxGeocode");

// --------------------------
// ENVIRONMENT VALIDATION
// --------------------------
const requiredEnvVars = ["STREAM_API_KEY", "STREAM_API_SECRET"];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

const app = express();
app.disable('x-powered-by'); // Disable Express version disclosure
const PORT = process.env.PORT || 5000;

// CORS configuration - allow multiple origins
const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "https://virtual-career-fair-git-dev-ninapellis-projects.vercel.app",
  process.env.FRONTEND_URL,
].filter(Boolean));

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // allow curl / no-origin
    if (allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json({ limit: "1mb" }));

/* GET /api/geocode/suggest — registered on app (not only fairs router) so it always resolves */
app.get("/api/geocode/suggest", async (req, res) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q.length < 2) {
      return res.json({ suggestions: [] });
    }
    const suggestions = await suggestPlaces(q);
    return res.json({ suggestions });
  } catch (err) {
    console.error("GET /api/geocode/suggest error:", err);
    return res.status(500).json({ error: "Failed to suggest locations", suggestions: [] });
  }
});

// Rate limiting: per-IP. Higher limit when not production (dev or NODE_ENV unset) to avoid 429s from polling and booth/dashboard loads.
if (process.env.NODE_ENV !== "test") {
  const limit = process.env.NODE_ENV === "production" ? 100 : 1000;
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: limit,
    standardHeaders: true,
    legacyHeaders: false,
  }));
}

// Test endpoint directly on app
app.post("/test-endpoint", (req, res) => {
  res.json({ success: true, message: "Direct endpoint works!" });
});

// Mount fair routes (multi-fair support)
app.use("/api", fairsRouter);
app.use("/api", shortlistRouter);

app.use("/api", require("./routes/debug"));
app.use("/api", require("./routes/stream"));
app.use("/api", require("./routes/jobs"));
app.use("/api", require("./routes/users"));
app.use("/api", require("./routes/fairStatus"));
app.use("/api", require("./routes/resume"));
app.use("/api", require("./routes/companies"));
app.use("/api", require("./routes/booths"));
app.use("/api", require("./routes/jobInvitations"));
app.use("/api", require("./routes/calls"));
app.use("/api", require("./routes/sessions"));
app.use("/api", require("./routes/callInvitations"));
app.use("/api", require("./routes/jobmother"));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
