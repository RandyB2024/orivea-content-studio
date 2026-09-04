const attempts = new Map();
const crypto = require("crypto");

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  if (req.path.startsWith("/api/")) return res.status(401).json({ error: "Niet ingelogd." });
  return res.redirect("/login");
}

function loginRateLimit(req, res, next) {
  const key = req.ip || "unknown";
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const current = (attempts.get(key) || []).filter((time) => now - time < windowMs);
  if (current.length >= 10) return res.status(429).send("Te veel pogingen. Probeer later opnieuw.");
  current.push(now);
  attempts.set(key, current);
  return next();
}

function ensureCsrf(req, res, next) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

function csrfProtection(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const token = req.get("X-CSRF-Token") || req.body?._csrf;
  if (token && req.session?.csrfToken && token.length === req.session.csrfToken.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(req.session.csrfToken))) return next();
  return res.status(403).json({ error: "Ongeldige of ontbrekende CSRF-token." });
}

function verifyWebhookSecret(req, res, next) {
  const expected = process.env.WORKSPACE_WEBHOOK_SECRET;
  const provided = req.get("X-ORIVEA-WORKSPACE-SECRET");
  if (!expected || provided !== expected) return res.status(401).json({ error: "Ongeldige webhook secret." });
  return next();
}

module.exports = { requireAuth, loginRateLimit, verifyWebhookSecret, ensureCsrf, csrfProtection };
