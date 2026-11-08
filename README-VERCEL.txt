QUANTUM BOT - VERCEL NODE.JS UPDATE

Files included:
- quantum-bot.html: existing frontend with a real image-generation request
- server.js: existing Express backend with the image-generation endpoint implemented
- api/[...path].js: Vercel catch-all serverless entry point for /api/*
- index.html: frontend served at the Vercel project root
- package.json / package-lock.json: Node.js dependencies
- .env.example: environment variable names only; no secrets

DEPLOY STEPS
1. Back up your current GitHub repository before replacing files.
2. Copy the included files into the ROOT of the same repository, keeping the api folder.
3. Commit and push to the connected GitHub branch. Vercel should deploy automatically.
4. In Vercel Dashboard > your project > Settings > Environment Variables, add:
   OPENAI_API_KEY = your actual OpenAI API key
   Optional: OPENAI_IMAGE_MODEL = gpt-image-1
   Optional for Gemini chat: GEMINI_API_KEY = your Gemini key
5. Save the variables and redeploy the project (environment changes need a new deployment).
6. Test https://YOUR-PROJECT.vercel.app/health (should return "ok").
7. Open Quantum Bot > Image Generator, enter a prompt, and click Generate Image.

IMPORTANT
- Never upload your real .env file or put API keys in the HTML/GitHub.
- OpenAI API billing/limits are separate from a ChatGPT subscription.
- This build uses the same Vercel project for the frontend and API, so the frontend calls /api/images/generate on the same domain.
- If your current Vercel project is a static-only project with a different root directory, set its Root Directory to the folder containing package.json, server.js, index.html, and api/.
- The project retains its existing Express chat routes. The Vercel entry point exports the Express app instead of starting a separate listening server.
