require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.static(__dirname));

// ── Security & middleware ──────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false
  })
);
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || "*", // set this to your frontend URL in prod
  methods: ["GET", "POST", "OPTIONS"]
}));
app.use(express.json({ limit: "1mb" }));

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,             // 30 requests per IP
  message: { error: "Too many requests, slow down king 😤" }
});
app.use("/api/", limiter);

// ── Health check (Cloud Run loves this) ───────────────────────
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "quantum-bot.html"));
});

app.get("/health", (req, res) => {
  res.status(200).send("ok");
});

// ── Main chat endpoint (exact contract your frontend uses) ────
app.post("/api/chat", async (req, res) => {
  try {
    const { provider = "Google Gemini", apiKey, messages } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Messages array is required" });
    }

    // Prefer server-side key, fall back to client-provided (not recommended for prod)
    const key = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || apiKey;

    if (!key) {
      return res.status(401).json({
        error: "No API key configured. Set GEMINI_API_KEY (or OPENAI_API_KEY) in environment."
      });
    }

    let reply = "";

    // ── Google Gemini (recommended for Google Cloud) ──────────
    if (provider === "Google Gemini" || provider === "Gemini") {
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      // Convert chat history to Gemini format
      const history = messages.slice(0, -1).map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      }));

      const chat = model.startChat({ history });
      const lastMessage = messages[messages.length - 1].content;

      const result = await chat.sendMessage(lastMessage);
      reply = result.response.text();
    }

    // ── OpenAI ────────────────────────────────────────────────
    else if (provider === "OpenAI") {
      const openai = new OpenAI({ apiKey: key });
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: messages.map(m => ({
          role: m.role,
          content: m.content
        }))
      });
      reply = completion.choices[0].message.content;
    }

    // ── Fallback / other providers ────────────────────────────
    else {
      return res.status(400).json({
        error: `Provider "${provider}" not yet wired. Supported: Google Gemini, OpenAI`
      });
    }

    // Frontend expects exactly this shape
    res.json({ message: reply.trim() });

  } catch (err) {
    console.error("Quantum Core error:", err.message);
    res.status(500).json({
      error: err.message || "Something went wrong in the quantum layer"
    });
  }
});

// ── Optional: image generation stub (you can expand later) ────
app.post("/api/images/generate", async (req, res) => {
  res.status(501).json({
    error: "Image generation not implemented yet. Hook up Imagen or DALL·E here."
  });
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Quantum Backend live on port ${PORT}`);
});