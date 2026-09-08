const express = require("express");
const { db } = require("../db");
const { verifyWebhookSecret } = require("../middleware");
const { writeAudit } = require("../audit");
const { toNumber } = require("../utils");
const { ingestEvent } = require("../commerce-sync");

const router = express.Router();
router.use(verifyWebhookSecret);

router.post("/event", (req, res) => {
  try {
    const eventId = String(req.get("X-Idempotency-Key") || req.body?.event_id || "").trim();
    const result = ingestEvent({ ...req.body, event_id: eventId });
    return res.status(result.duplicate ? 200 : 201).json({ ok: true, ...result });
  } catch (error) {
    console.error("Webshop event ingestion failed:", error);
    return res.status(400).json({ error: error.message });
  }
});
const scentClubAttempts = new Map();
const scentClubSources = new Set(["orivea.nl", "www.orivea.nl", "emailjs", "scent-club"]);
const scentClubPlans = { essential: 17.95, signature: 22.95, duo: 34.95 };

function scentClubRateLimit(req, res, next) {
  const key = req.ip || "unknown";
  const now = Date.now();
  const recent = (scentClubAttempts.get(key) || []).filter((time) => now - time < 15 * 60 * 1000);
  if (recent.length >= 30) return res.status(429).json({ error: "Te veel aanvragen." });
  recent.push(now);
  scentClubAttempts.set(key, recent);
  return next();
}

router.post("/scent-club-request", scentClubRateLimit, (req, res) => {
  if (!req.is("application/json")) return res.status(415).json({ error: "Content-Type application/json vereist." });
  const body = req.body || {};
  const required = ["first_name", "last_name", "email", "plan", "preference_gender", "preference_family", "selection_mode"];
  const missing = required.filter((key) => !String(body[key] || "").trim());
  if (missing.length) return res.status(400).json({ error: `Ontbrekende velden: ${missing.join(", ")}.` });
  const plan = String(body.plan).trim().toLowerCase();
  const source = String(body.source || "orivea.nl").trim().toLowerCase();
  if (!scentClubPlans[plan]) return res.status(400).json({ error: "Onbekend abonnement." });
  if (!scentClubSources.has(source)) return res.status(400).json({ error: "Onbekende bron." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email))) return res.status(400).json({ error: "Ongeldig e-mailadres." });
  const externalId = String(body.external_id || "").trim().slice(0, 100) || null;
  if (externalId) {
    const existing = db.prepare("SELECT id FROM scent_club_requests WHERE external_id=?").get(externalId);
    if (existing) return res.json({ ok: true, duplicate: true, id: existing.id });
  }
  const result = db.prepare(`INSERT INTO scent_club_requests (external_id,first_name,last_name,email,phone,plan,monthly_price,preference_gender,preference_family,selection_mode,source,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    externalId, String(body.first_name).trim().slice(0,80), String(body.last_name).trim().slice(0,120), String(body.email).trim().toLowerCase().slice(0,254), String(body.phone || "").trim().slice(0,40), plan, scentClubPlans[plan], String(body.preference_gender).trim().slice(0,40), String(body.preference_family).trim().slice(0,60), String(body.selection_mode).trim().slice(0,80), source, String(body.notes || "").trim().slice(0,2000)
  );
  writeAudit({ entityType: "scent_club_request", entityId: result.lastInsertRowid, action: "webhook_create", byUser: "webhook" });
  return res.status(201).json({ ok: true, id: Number(result.lastInsertRowid) });
});

router.post("/order", (req, res) => {
  const body = req.body || {};
  if (!body.order_number) return res.status(400).json({ error: "order_number ontbreekt." });
  const items = typeof body.order_items === "string" ? body.order_items : JSON.stringify(body.order_items || []);
  const existing = db.prepare("SELECT * FROM orders WHERE order_number = ?").get(body.order_number);
  if (existing) {
    db.prepare(`
      UPDATE orders SET customer_name=?, customer_email=?, customer_phone=?, customer_address=?, order_date=?, order_items=?,
      subtotal=?, shipping_cost=?, vat_rate=?, vat_amount=?, total=?, paypal_transaction_id=?, payment_status=?, payment_method=?
      WHERE order_number=?
    `).run(
      body.customer_name, body.customer_email, body.customer_phone, body.customer_address, body.order_date, items,
      toNumber(body.subtotal), toNumber(body.shipping_cost), toNumber(body.vat_rate || 21), toNumber(body.vat_amount), toNumber(body.total),
      body.paypal_transaction_id, body.payment_status, body.payment_method, body.order_number
    );
    writeAudit({ entityType: "order", entityId: body.order_number, action: "webhook_update", byUser: "webhook" });
    return res.json({ ok: true, duplicate: true });
  }
  db.prepare(`
    INSERT INTO orders (order_number, customer_name, customer_email, customer_phone, customer_address, order_date, order_items,
    subtotal, shipping_cost, vat_rate, vat_amount, total, paypal_transaction_id, payment_status, payment_method, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    body.order_number, body.customer_name, body.customer_email, body.customer_phone, body.customer_address, body.order_date, items,
    toNumber(body.subtotal), toNumber(body.shipping_cost), toNumber(body.vat_rate || 21), toNumber(body.vat_amount), toNumber(body.total),
    body.paypal_transaction_id, body.payment_status, body.payment_method, "Nieuw"
  );
  writeAudit({ entityType: "order", entityId: body.order_number, action: "webhook_create", byUser: "webhook" });
  res.json({ ok: true });
});

router.post("/contact", (req, res) => {
  const body = req.body || {};
  const result = db.prepare(`
    INSERT INTO contact_requests (name, email, phone, subject, message_type, message_body, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(body.name, body.email, body.phone, body.subject, body.message_type, body.message_body, "Nieuw");
  writeAudit({
    entityType: "contact",
    entityId: result.lastInsertRowid,
    action: body.message_body ? "webhook_create" : "webhook_create_warning",
    byUser: "webhook",
    reason: body.message_body ? "" : "message_body ontbreekt"
  });
  res.json({ ok: true });
});

router.post("/newsletter", (req, res) => {
  const body = req.body || {};
  const result = db.prepare("INSERT INTO newsletter_events (email, name, event_type) VALUES (?, ?, ?)").run(
    body.email,
    body.name,
    body.event_type || body.message_type || "aanmelding"
  );
  writeAudit({ entityType: "newsletter", entityId: result.lastInsertRowid, action: "webhook_create", byUser: "webhook" });
  res.json({ ok: true });
});

module.exports = router;
