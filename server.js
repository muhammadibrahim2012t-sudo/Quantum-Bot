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

// Static frontend files (also works when running locally).
app.use(express.static(__dirname));

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || "*",
  methods: ["GET", "POST", "OPTIONS"]
}));
app.use(express.json({ limit: "1mb" }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a minute and try again." }
});
app.use("/api/", limiter);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "quantum-bot.html"));
});

app.get("/health", (req, res) => res.status(200).send("ok"));

// Existing Quantum Bot chat endpoint.
app.post("/api/chat", async (req, res) => {
  try {
    const { provider = "Google Gemini", apiKey, messages } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Messages array is required" });
    }

    // Prefer server-side keys. Client-supplied apiKey remains supported for
    // backward compatibility with the existing frontend.
    const key = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || apiKey;
    if (!key) {
      return res.status(401).json({ error: "No API key configured on the server." });
    }

    let reply = "";
    if (provider === "Google Gemini" || provider === "Gemini") {
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const history = messages.slice(0, -1).map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: String(m.content || "") }]
      }));
      const chat = model.startChat({ history });
      const result = await chat.sendMessage(String(messages[messages.length - 1].content || ""));
      reply = result.response.text();
    } else if (provider === "OpenAI") {
      const openai = new OpenAI({ apiKey: key });
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: messages.map(m => ({ role: m.role, content: m.content }))
      });
      reply = completion.choices[0].message.content || "";
    } else {
      return res.status(400).json({ error: `Provider "${provider}" is not supported.` });
    }

    return res.json({ message: reply.trim() });
  } catch (err) {
    console.error("Quantum chat error:", err);
    return res.status(500).json({ error: "The chat request failed. Please try again." });
  }
});

// Free image generation via Pollinations.ai (no API key required).
app.post(["/api/image", "/api/images/generate"], async (req, res) => {
  try {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    if (!prompt) return res.status(400).json({ error: "Please enter an image description." });
    if (prompt.length > 1000) {
      return res.status(400).json({ error: "Image descriptions must be 1,000 characters or fewer." });
    }

    const base = process.env.POLLINATIONS_URL || "https://image.pollinations.ai/prompt";
    const params = new URLSearchParams({
      model: process.env.POLLINATIONS_MODEL || "flux",
      width: "1024",
      height: "1024",
      nologo: "true",
      seed: String(Math.floor(Math.random() * 1e9))
    });
    const url = `${base}/${encodeURIComponent(prompt)}?${params.toString()}`;

    // Optional: a Pollinations token raises rate limits. Not required.
    const headers = {};
    if (process.env.POLLINATIONS_TOKEN) {
      headers.Authorization = `Bearer ${process.env.POLLINATIONS_TOKEN}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55000);
    let upstream;
    try {
      upstream = await fetch(url, { headers, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (upstream.status === 429) {
      return res.status(429).json({ error: "The free image service is busy. Wait about 15 seconds and try again." });
    }
    if (!upstream.ok) {
      console.error("Pollinations returned status", upstream.status);
      return res.status(502).json({ error: `The image service returned an error (${upstream.status}). Please try again.` });
    }

    const contentType = (upstream.headers.get("content-type") || "").split(";")[0];
    if (!contentType.startsWith("image/")) {
      console.error("Pollinations returned non-image content:", contentType);
      return res.status(502).json({ error: "The image service did not return an image. Please try again." });
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    return res.json({ image: `data:${contentType};base64,${buffer.toString("base64")}` });
  } catch (err) {
    console.error("Quantum image generation error:", err);
    if (err && err.name === "AbortError") {
      return res.status(504).json({ error: "Image generation took too long. Please try again." });
    }
    return res.status(500).json({ error: "Image generation failed. Check your Vercel function logs for details." });
  }
});

// Export the Express app for Vercel serverless and keep local Node support.
module.exports = app;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Quantum Backend live on port ${PORT}`));
}
