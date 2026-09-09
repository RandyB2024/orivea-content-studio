const express = require("express");
const { db } = require("../db");
const { syncMailbox, summary } = require("../mail-intake");

const router = express.Router();

router.get("/summary", (req, res) => res.json(summary()));
router.get("/events", (req, res) => {
  const status = String(req.query.status || "");
  const rows = status
    ? db.prepare("SELECT * FROM mail_intake_events WHERE status=? ORDER BY received_at DESC LIMIT 200").all(status)
    : db.prepare("SELECT * FROM mail_intake_events ORDER BY received_at DESC LIMIT 200").all();
  res.json(rows);
});
router.post("/sync", async (req, res, next) => {
  try { res.json(await syncMailbox()); } catch (error) { next(error); }
});

module.exports = router;
