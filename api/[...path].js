// Vercel catch-all serverless function for /api/chat and /api/images/generate.
// The Express app is exported by server.js; it does not call app.listen on Vercel.
module.exports = require("../server");
