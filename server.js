require("dotenv").config();

const path = require("path");
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const cors = require("cors");

const { initDb } = require("./src/workspace/db");
const { requireAuth, ensureCsrf, csrfProtection } = require("./src/workspace/middleware");

const authRoutes = require("./src/workspace/routes/auth.routes");
const pageRoutes = require("./src/workspace/routes/page.routes");
const orderRoutes = require("./src/workspace/routes/orders.routes");
const customerRoutes = require("./src/workspace/routes/customers.routes");
const contactRoutes = require("./src/workspace/routes/contact.routes");
const newsletterRoutes = require("./src/workspace/routes/newsletter.routes");
const socialRoutes = require("./src/workspace/routes/social.routes");
const assetsRoutes = require("./src/workspace/routes/assets.routes");
const auditRoutes = require("./src/workspace/routes/audit.routes");
const settingsRoutes = require("./src/workspace/routes/settings.routes");
const webhookRoutes = require("./src/workspace/routes/webhook.routes");
const studioRoutes = require("./src/workspace/routes/studio.routes");
const agentRoutes = require("./src/workspace/routes/agent.routes");
const knowledgeRoutes = require("./src/workspace/routes/knowledge.routes");
const scentClubRoutes = require("./src/workspace/routes/scent-club.routes");
const mailIntakeRoutes = require("./src/workspace/routes/mail-intake.routes");
const outlookRoutes = require("./src/workspace/routes/outlook.routes");
const { startAgent } = require("./src/workspace/agent");
const { startScheduler } = require("./src/workspace/scheduler");
const { startCommerceSync } = require("./src/workspace/commerce-sync");
const { startMailIntake } = require("./src/workspace/mail-intake");
const SqliteSessionStore = require("./src/workspace/session-store");

const app = express();
const appRoot = __dirname;
const isProduction = process.env.NODE_ENV === "production";
if (isProduction && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) throw new Error("SESSION_SECRET moet in productie minimaal 32 tekens bevatten.");
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const defaultAllowedOrigins = [
  "https://content.orivea.nl",
  "https://orivea.nl",
  "https://www.orivea.nl",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
];
const corsAllowedOrigins = [...new Set([...defaultAllowedOrigins, ...allowedOrigins])];
const corsOptions = {
  origin(origin, callback) {
    if (!origin || origin === "null") return callback(null, true);
    if (corsAllowedOrigins.includes(origin)) return callback(null, true);
    console.warn("CORS blocked origin:", origin);
    return callback(new Error("Origin niet toegestaan."));
  },
  credentials: true
};
console.log("Allowed CORS origins:", corsAllowedOrigins);

initDb();

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use((req, res, next) => { res.set("X-Robots-Tag", "noindex, nofollow"); next(); });
app.use("/api", cors(corsOptions));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  name: "orivea_content.sid",
  secret: process.env.SESSION_SECRET || "replace-this-session-secret",
  store: new SqliteSessionStore(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 8
  }
}));

app.use(express.static(path.join(appRoot, "public")));

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.get("/", (req, res) => res.redirect(req.session.user ? "/dashboard" : "/login"));

app.use(authRoutes);
app.use(outlookRoutes.callbackRouter);
app.use("/api/webhooks", webhookRoutes);

app.use(requireAuth);
app.use(ensureCsrf);
app.use(csrfProtection);
app.use(pageRoutes);
app.use("/api/studio", studioRoutes);
app.use("/api/agent", agentRoutes);
app.use("/api/knowledge", knowledgeRoutes);
app.use("/api/scent-club", scentClubRoutes);
app.use("/api/mail-intake", mailIntakeRoutes);
app.use("/api/outlook", outlookRoutes.protectedRouter);
app.use("/api/orders", orderRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/newsletter", newsletterRoutes);
app.use("/api/social", socialRoutes);
app.use("/api/assets", assetsRoutes);
app.use("/api/audit-log", auditRoutes);
app.use("/api/settings", settingsRoutes);

app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Niet gevonden." });
  return res.status(404).sendFile(path.join(appRoot, "views", "dashboard.html"));
});

app.use((err, req, res, next) => {
  console.error("Workspace route error:", err);
  if (err && err.stack) console.error(err.stack);
  if (res.headersSent) return next(err);
  if (req.path.startsWith("/api/")) {
    return res.status(500).json({
      error: "Er ging iets mis in de workspace.",
      message: isProduction ? undefined : err.message
    });
  }
  return res.status(500).sendFile(path.join(appRoot, "views", "dashboard.html"));
});

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "127.0.0.1";
const server = app.listen(port, host, () => {
  startScheduler();
  startAgent();
  startCommerceSync();
  startMailIntake();
  console.log(`ORIVEA Content Studio actief op http://${host}:${port}`);
});

function shutdown(signal) {
  console.log(`${signal} ontvangen; server wordt netjes afgesloten.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
