const express = require("express");
const { db } = require("../db");
const router = express.Router();

router.get("/", (req,res) => {
  const q = `%${String(req.query.q || "").trim()}%`;
  res.json(db.prepare(`SELECT c.*,COUNT(o.id) order_count,COALESCE(SUM(CASE WHEN o.payment_status='paid' THEN o.total ELSE 0 END),0) total_spent,MAX(o.created_at) last_order,CASE WHEN m.id IS NULL THEN 0 ELSE 1 END scent_club_member FROM customers c LEFT JOIN orders o ON lower(o.customer_email)=lower(c.email) LEFT JOIN scent_club_members m ON lower(m.email)=lower(c.email) AND m.status='active' WHERE c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ? GROUP BY c.id ORDER BY last_order DESC,c.created_at DESC`).all(q,q,q));
});

router.get("/:id", (req,res) => {
  const customer = db.prepare("SELECT * FROM customers WHERE id=?").get(req.params.id);
  if (!customer) return res.status(404).json({error:"Klant niet gevonden."});
  customer.orders = db.prepare("SELECT * FROM orders WHERE lower(customer_email)=lower(?) ORDER BY created_at DESC").all(customer.email);
  customer.scent_club = db.prepare("SELECT * FROM scent_club_members WHERE lower(email)=lower(?) ORDER BY created_at DESC LIMIT 1").get(customer.email) || null;
  return res.json(customer);
});

module.exports = router;
