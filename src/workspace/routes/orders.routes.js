const express = require("express");
const { db } = require("../db");
const { writeAudit } = require("../audit");
const { toCsv } = require("../utils");

const router = express.Router();

router.get("/", (req, res) => {
  const q = `%${req.query.q || ""}%`;
  const rows = db.prepare(`
    SELECT * FROM orders
    WHERE order_number LIKE ? OR customer_name LIKE ? OR customer_email LIKE ? OR payment_status LIKE ? OR status LIKE ?
    ORDER BY created_at DESC
  `).all(q, q, q, q, q);
  res.json(rows);
});

router.get("/export", (req, res) => {
  const rows = db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all();
  const csv = toCsv(rows, [
    { key: "order_number", label: "Ordernummer" },
    { key: "customer_name", label: "Naam" },
    { key: "customer_email", label: "E-mail" },
    { key: "total", label: "Totaal" },
    { key: "payment_status", label: "Betaling" },
    { key: "status", label: "Status" },
    { key: "created_at", label: "Aangemaakt" }
  ]);
  res.header("Content-Type", "text/csv; charset=utf-8");
  res.attachment("orivea-orders.csv");
  res.send(csv);
});

router.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Order niet gevonden." });
  row.items = db.prepare("SELECT * FROM order_items WHERE order_id=? ORDER BY id").all(row.id);
  row.timeline = db.prepare("SELECT * FROM webshop_events WHERE aggregate_id=? ORDER BY created_at").all(row.order_number);
  return res.json(row);
});

router.put("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Order niet gevonden." });
  const status = req.body.status || existing.status;
  const notes = req.body.notes ?? existing.notes;
  const fulfillment = req.body.fulfillment_status || existing.fulfillment_status;
  const tracking = req.body.tracking_code ?? existing.tracking_code;
  db.prepare("UPDATE orders SET status = ?, notes = ?, fulfillment_status=?, tracking_code=?, updated_at=CURRENT_TIMESTAMP WHERE id = ?").run(status, notes, fulfillment, tracking, req.params.id);
  writeAudit({
    entityType: "order",
    entityId: existing.order_number,
    action: "update",
    previousStatus: existing.status,
    newStatus: status,
    byUser: req.session.user.username,
    metadata: { notes }
  });
  res.json(db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id));
});

module.exports = router;
