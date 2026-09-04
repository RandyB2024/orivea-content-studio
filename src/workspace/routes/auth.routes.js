const path = require("path");
const express = require("express");
const { verifyCredentials } = require("../auth");
const { loginRateLimit } = require("../middleware");
const { writeAudit } = require("../audit");

const router = express.Router();
const appRoot = path.resolve(__dirname, "..", "..", "..");

router.get("/login", (req, res) => {
  if (req.session.user) return res.redirect("/dashboard");
  return res.sendFile(path.join(appRoot, "views", "login.html"));
});

router.post("/login", loginRateLimit, async (req, res) => {
  const { username, password } = req.body;
  const valid = await verifyCredentials(username, password);
  writeAudit({
    entityType: "auth",
    entityId: username,
    action: valid ? "login_success" : "login_failed",
    byUser: username || "unknown"
  });
  if (!valid) return res.status(401).send("Ongeldige login.");
  return req.session.regenerate((error) => {
    if (error) return res.status(500).send("Sessie kon niet worden gestart.");
    req.session.user = { username };
    return req.session.save(() => res.redirect("/dashboard"));
  });
});

router.post("/logout", (req, res) => {
  const username = req.session.user?.username || "unknown";
  writeAudit({ entityType: "auth", entityId: username, action: "logout", byUser: username });
  req.session.destroy(() => res.redirect("/login"));
});

module.exports = router;
