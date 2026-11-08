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

// Real image generation endpoint. The OpenAI key stays on the server.
app.post("/api/images/generate", async (req, res) => {
  try {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    if (!prompt) return res.status(400).json({ error: "Please enter an image description." });
    if (prompt.length > 4000) {
      return res.status(400).json({ error: "Image descriptions must be 4,000 characters or fewer." });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: "Image generation is not configured. Add OPENAI_API_KEY in Vercel Environment Variables." });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const generated = await openai.images.generate({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
      prompt,
      size: "1024x1024"
    });

    const imageBase64 = generated.data?.[0]?.b64_json;
    if (!imageBase64) {
      console.error("OpenAI image response did not include b64_json.");
      return res.status(502).json({ error: "The image provider returned no image. Please try again." });
    }

    return res.json({ image: `data:image/png;base64,${imageBase64}` });
  } catch (err) {
    console.error("Quantum image generation error:", err);
    const status = Number(err.status) || 500;
    if (status === 401) return res.status(502).json({ error: "The image API key was rejected. Check OPENAI_API_KEY in Vercel." });
    if (status === 429) return res.status(429).json({ error: "Image generation is busy or your API quota is unavailable. Check your OpenAI API billing and limits." });
    return res.status(500).json({ error: "Image generation failed. Check your Vercel function logs for details." });
  }
});

// Export the Express app for Vercel serverless and keep local Node support.
module.exports = app;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Quantum Backend live on port ${PORT}`));
}
