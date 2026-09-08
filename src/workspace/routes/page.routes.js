const path = require("path");
const express = require("express");
const { db } = require("../db");

const router = express.Router();
const appRoot = path.resolve(__dirname, "..", "..", "..");
const pageMap = {
  "/dashboard": "dashboard.html",
  "/orders": "orders.html",
  "/customers": "customers.html",
  "/contact": "contact.html",
  "/newsletter": "newsletter.html",
  "/social": "social.html",
  "/assets": "assets.html",
  "/audit": "audit.html",
  "/settings": "settings.html"
  ,"/content": "content.html"
  ,"/campaigns": "campaigns.html"
  ,"/calendar": "calendar.html"
  ,"/posts/new": "post-editor.html"
  ,"/history": "history.html"
  ,"/settings/integrations": "integrations.html"
  ,"/knowledge": "knowledge.html"
  ,"/scent-club": "scent-club.html"
  ,"/scent-club/requests": "scent-club-requests.html"
  ,"/scent-club/members": "scent-club-members.html"
};
router.get("/scent-club/members/:id",(req,res,next)=>res.sendFile(path.join(appRoot,"views","scent-club-member-detail.html"),error=>error&&next(error)));
router.get("/orders/:id",(req,res,next)=>res.sendFile(path.join(appRoot,"views","order-detail.html"),error=>error&&next(error)));
router.get("/knowledge/:id",(req,res,next)=>res.sendFile(path.join(appRoot,"views","knowledge-detail.html"),error=>error&&next(error)));
router.get("/media/:id",(req,res,next)=>res.sendFile(path.join(appRoot,"views","media-detail.html"),error=>error&&next(error)));
router.get("/posts/:id",(req,res,next)=>res.sendFile(path.join(appRoot,"views","post-preview.html"),error=>error&&next(error)));

Object.entries(pageMap).forEach(([route, file]) => {
  router.get(route, (req, res, next) => {
    res.sendFile(path.join(appRoot, "views", file), (error) => {
      if (error) next(error);
    });
  });
});

router.get("/api/summary", (req, res) => {
  try {
    const one = (sql) => db.prepare(sql).get()?.count || 0;
    const revenue = db.prepare("SELECT COALESCE(SUM(total),0) AS total FROM orders WHERE payment_status IN ('COMPLETED','Betaald','PAID')").get().total;
    res.json({
      orders: one("SELECT COUNT(*) AS count FROM orders"),
      openOrders: one("SELECT COUNT(*) AS count FROM orders WHERE status NOT IN ('Afgerond','Geannuleerd')"),
      contacts: one("SELECT COUNT(*) AS count FROM contact_requests"),
      newsletter: one("SELECT COUNT(*) AS count FROM newsletter_events"),
      socialDrafts: one("SELECT COUNT(*) AS count FROM social_posts WHERE status IN ('concept','drafts','draft')"),
      revenue,
      warning: null
    });
  } catch (error) {
    console.error("Workspace route error:", error);
    if (error && error.stack) console.error(error.stack);
    res.json({
      orders: 0,
      openOrders: 0,
      contacts: 0,
      newsletter: 0,
      socialDrafts: 0,
      revenue: 0,
      warning: "Dashboardgegevens konden nog niet worden geladen."
    });
  }
});

router.get("/api/integration-health", (req,res) => {
  const health = db.prepare("SELECT * FROM integration_health WHERE integration='webshop'").get();
  const pending = db.prepare("SELECT COUNT(*) count FROM orders WHERE payment_status='payment_pending'").get().count;
  const unread = db.prepare("SELECT COUNT(*) count FROM notifications WHERE read_at IS NULL").get().count;
  res.json({ webshop: health || { integration:"webshop",status:"not_configured" }, pendingOrders: pending, unreadNotifications: unread });
});

module.exports = router;
