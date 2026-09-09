const express = require("express");
const { db } = require("../db");
const { writeAudit } = require("../audit");
const { toCsv } = require("../utils");

const router = express.Router();
const requestStatuses = new Set(["new", "contacted", "approved", "declined"]);
const memberStatuses = new Set(["active", "paused", "cancelled", "payment_failed"]);
const selectionStatuses = new Set(["open", "selected", "fulfilled"]);
const planPrices = { essential: 17.95, signature: 22.95, duo: 34.95 };
const monthKey = () => new Date().toISOString().slice(0, 7);
const deadlineFor = (month) => `${month}-20`;
const addMonth = (date) => { const value = new Date(`${date}T12:00:00Z`); value.setUTCMonth(value.getUTCMonth() + 1); return value.toISOString().slice(0, 10); };
const actor = (req) => req.session.user?.username || "admin";
const memberCode = () => `ORV-SC-${require("crypto").randomBytes(4).toString("hex").toUpperCase()}`;
const event = ({ memberId = null, requestId = null, type, description, byUser, metadata = null }) => db.prepare(`INSERT INTO scent_club_events (member_id,request_id,event_type,description,by_user,metadata) VALUES (?,?,?,?,?,?)`).run(memberId, requestId, type, description, byUser, metadata ? JSON.stringify(metadata) : null);

function summary() {
  const count = (sql, ...params) => db.prepare(sql).get(...params).count;
  const month = monthKey();
  return {
    active: count("SELECT COUNT(*) count FROM scent_club_members WHERE status='active'"),
    newRequests: count("SELECT COUNT(*) count FROM scent_club_requests WHERE status='new'"),
    startedThisMonth: count("SELECT COUNT(*) count FROM scent_club_members WHERE substr(started_at,1,7)=?", month),
    paused: count("SELECT COUNT(*) count FROM scent_club_members WHERE status='paused'"),
    cancelled: count("SELECT COUNT(*) count FROM scent_club_members WHERE status='cancelled'"),
    paymentFailed: count("SELECT COUNT(*) count FROM scent_club_members WHERE status='payment_failed'"),
    openSelections: count(`SELECT COUNT(*) count FROM scent_club_members m LEFT JOIN scent_club_selections s ON s.member_id=m.id AND s.month=? WHERE m.status='active' AND (s.id IS NULL OR s.status='open')`, month)
  };
}

router.get("/summary", (req, res) => {
  const data = summary();
  data.actionRequired = data.newRequests + data.paymentFailed + data.openSelections;
  data.recentRequests = db.prepare("SELECT * FROM scent_club_requests ORDER BY created_at DESC LIMIT 5").all();
  data.recentEvents = db.prepare("SELECT * FROM scent_club_events ORDER BY created_at DESC LIMIT 8").all();
  data.upcomingSelections = db.prepare(`SELECT m.id,m.first_name,m.last_name,m.plan,s.fragrance_reference,COALESCE(s.status,'open') status,COALESCE(s.deadline,?) deadline FROM scent_club_members m LEFT JOIN scent_club_selections s ON s.member_id=m.id AND s.month=? WHERE m.status='active' ORDER BY s.status,m.last_name LIMIT 12`).all(deadlineFor(monthKey()), monthKey());
  res.json(data);
});

router.get("/requests", (req, res) => {
  const q = `%${String(req.query.q || "").trim()}%`;
  const filters = [q, q, q];
  let where = "WHERE (first_name || ' ' || last_name LIKE ? OR email LIKE ? OR phone LIKE ?)";
  for (const [field, value] of [["plan", req.query.plan], ["status", req.query.status], ["preference_gender", req.query.preference], ["selection_mode", req.query.mode]]) {
    if (value) { where += ` AND ${field}=?`; filters.push(value); }
  }
  res.json(db.prepare(`SELECT * FROM scent_club_requests ${where} ORDER BY created_at DESC`).all(...filters));
});
router.get("/requests/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM scent_club_requests WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Aanvraag niet gevonden." });
  return res.json(row);
});
router.post("/requests/:id/status", (req, res) => {
  const status = String(req.body.status || "");
  if (!requestStatuses.has(status)) return res.status(400).json({ error: "Ongeldige aanvraagstatus." });
  const row = db.prepare("SELECT * FROM scent_club_requests WHERE id=?").get(req.params.id);
  if (!row || row.status === "converted") return res.status(row ? 409 : 404).json({ error: row ? "Omgezette aanvraag kan niet worden gewijzigd." : "Aanvraag niet gevonden." });
  db.prepare("UPDATE scent_club_requests SET status=?,last_action_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(status, row.id);
  event({ requestId: row.id, type: "request_status", description: `Aanvraagstatus gewijzigd naar ${status}.`, byUser: actor(req) });
  writeAudit({ entityType: "scent_club_request", entityId: row.id, action: "status_update", previousStatus: row.status, newStatus: status, byUser: actor(req) });
  return res.json(db.prepare("SELECT * FROM scent_club_requests WHERE id=?").get(row.id));
});
router.post("/requests/:id/convert", async (req, res) => {
  const row = db.prepare("SELECT * FROM scent_club_requests WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Aanvraag niet gevonden." });
  if (row.converted_member_id || row.status === "converted") return res.status(409).json({ error: "Deze aanvraag is al omgezet." });
  if (!['approved','contacted','new'].includes(row.status)) return res.status(409).json({ error: "Afgewezen aanvraag kan niet worden omgezet." });
  const startedAt = String(req.body.started_at || new Date().toISOString().slice(0, 10));
  const convert = db.transaction(() => {
    const result = db.prepare(`INSERT INTO scent_club_members (request_id,first_name,last_name,email,phone,plan,monthly_price,status,started_at,next_billing_date,preference_gender,preference_family,selection_mode,payment_status,member_code) VALUES (?,?,?,?,?,?,?,'active',?,?,?,?,?,'pending',?)`).run(row.id,row.first_name,row.last_name,row.email,row.phone,row.plan,row.monthly_price,startedAt,addMonth(startedAt),row.preference_gender,row.preference_family,row.selection_mode,memberCode());
    const memberId = Number(result.lastInsertRowid);
    db.prepare("UPDATE scent_club_members SET discount_percent=? WHERE id=?").run(["signature","duo"].includes(row.plan) ? 10 : 0,memberId);
    db.prepare("UPDATE scent_club_requests SET status='converted',converted_member_id=?,last_action_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(memberId,row.id);
    db.prepare("INSERT INTO scent_club_selections (member_id,month,status,deadline) VALUES (?,?,'open',?)").run(memberId,monthKey(),deadlineFor(monthKey()));
    event({ memberId, requestId: row.id, type: "member_created", description: "Aanvraag omgezet naar actief lid.", byUser: actor(req) });
    return memberId;
  });
  const memberId = convert();
  const member = db.prepare("SELECT * FROM scent_club_members WHERE id=?").get(memberId);
  if (process.env.WEBSHOP_SYNC_URL && process.env.WEBSHOP_SYNC_SECRET) {
    try {
      const response = await fetch(`${process.env.WEBSHOP_SYNC_URL.replace(/\/$/,"")}/api/scent-club/activate`,{method:"POST",headers:{Authorization:`Bearer ${process.env.WEBSHOP_SYNC_SECRET}`,"Content-Type":"application/json"},body:JSON.stringify({member_code:member.member_code,email:member.email,first_name:member.first_name,plan:member.plan,selection_mode:member.selection_mode,preference_gender:member.preference_gender,started_at:member.started_at,next_renewal_at:member.next_billing_date})});
      if(!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch(error) {
      console.error("Scent Club activatie sync mislukt:",error);
      db.prepare(`INSERT INTO integration_health (integration,status,last_error,updated_at) VALUES ('webshop','error',?,CURRENT_TIMESTAMP) ON CONFLICT(integration) DO UPDATE SET status='error',last_error=excluded.last_error,updated_at=CURRENT_TIMESTAMP`).run(`Scent Club activatie: ${error.message}`);
    }
  }
  writeAudit({ entityType: "scent_club_member", entityId: memberId, action: "created_from_request", byUser: actor(req), metadata: { requestId: row.id } });
  return res.status(201).json({ id: memberId });
});

router.get("/members", (req, res) => {
  const q = `%${String(req.query.q || "").trim()}%`; const values = [monthKey(), q, q, q];
  let where = "WHERE (m.first_name || ' ' || m.last_name LIKE ? OR m.email LIKE ? OR m.phone LIKE ?)";
  for (const [field, value] of [["m.plan", req.query.plan], ["m.status", req.query.status], ["m.preference_gender", req.query.preference], ["m.selection_mode", req.query.mode]]) { if (value) { where += ` AND ${field}=?`; values.push(value); } }
  if (req.query.startMonth) { where += " AND substr(m.started_at,1,7)=?"; values.push(req.query.startMonth); }
  res.json(db.prepare(`SELECT m.*,s.fragrance_reference current_selection,s.status selection_status FROM scent_club_members m LEFT JOIN scent_club_selections s ON s.member_id=m.id AND s.month=? ${where} ORDER BY m.created_at DESC`).all(...values));
});
router.get("/members/:id", (req, res) => {
  const member = db.prepare("SELECT * FROM scent_club_members WHERE id=?").get(req.params.id);
  if (!member) return res.status(404).json({ error: "Lid niet gevonden." });
  member.selections = db.prepare("SELECT * FROM scent_club_selections WHERE member_id=? ORDER BY month DESC").all(member.id);
  member.events = db.prepare("SELECT * FROM scent_club_events WHERE member_id=? ORDER BY created_at DESC").all(member.id);
  return res.json(member);
});
router.post("/members/:id/status", (req, res) => {
  const status = String(req.body.status || "");
  if (!memberStatuses.has(status)) return res.status(400).json({ error: "Ongeldige lidstatus." });
  const row = db.prepare("SELECT * FROM scent_club_members WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Lid niet gevonden." });
  db.prepare("UPDATE scent_club_members SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(status,row.id);
  event({ memberId: row.id, type: "member_status", description: `Abonnementsstatus gewijzigd naar ${status}.`, byUser: actor(req) });
  writeAudit({ entityType: "scent_club_member", entityId: row.id, action: "status_update", previousStatus: row.status, newStatus: status, byUser: actor(req) });
  return res.json({ ok: true });
});
router.post("/members/:id/selections", (req, res) => {
  const member = db.prepare("SELECT id FROM scent_club_members WHERE id=?").get(req.params.id);
  if (!member) return res.status(404).json({ error: "Lid niet gevonden." });
  const month = /^\d{4}-\d{2}$/.test(req.body.month || "") ? req.body.month : monthKey();
  const fragrance = String(req.body.fragrance_reference || "").trim().slice(0,50) || null;
  const status = req.body.status || (fragrance ? "selected" : "open");
  if (!selectionStatuses.has(status)) return res.status(400).json({ error: "Ongeldige keuzestatus." });
  db.prepare(`INSERT INTO scent_club_selections (member_id,month,fragrance_reference,status,deadline,selected_at) VALUES (?,?,?,?,?,?) ON CONFLICT(member_id,month) DO UPDATE SET fragrance_reference=excluded.fragrance_reference,status=excluded.status,deadline=excluded.deadline,selected_at=excluded.selected_at,updated_at=CURRENT_TIMESTAMP`).run(member.id,month,fragrance,status,req.body.deadline || deadlineFor(month),fragrance ? new Date().toISOString() : null);
  event({ memberId: member.id, type: "monthly_selection", description: fragrance ? `Maandkeuze ${month}: ${fragrance}.` : `Maandkeuze ${month} staat open.`, byUser: actor(req) });
  return res.json({ ok: true });
});
router.get("/selections", (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || "") ? req.query.month : monthKey();
  const rows = db.prepare(`SELECT m.id member_id,m.first_name,m.last_name,m.plan,s.fragrance_reference,COALESCE(s.status,'open') status,COALESCE(s.deadline,?) deadline FROM scent_club_members m LEFT JOIN scent_club_selections s ON s.member_id=m.id AND s.month=? WHERE m.status='active' ORDER BY status,m.last_name`).all(deadlineFor(month),month);
  res.json(req.query.status ? rows.filter(row => row.status === req.query.status) : rows);
});
router.get("/export.csv", (req, res) => {
  const rows = db.prepare(`SELECT m.first_name || ' ' || m.last_name name,m.email,m.plan,m.status,m.started_at,m.preference_gender || ' / ' || m.preference_family preference,s.fragrance_reference month_selection FROM scent_club_members m LEFT JOIN scent_club_selections s ON s.member_id=m.id AND s.month=? ORDER BY m.last_name`).all(monthKey());
  res.type("text/csv").attachment("orivea-scent-club-leden.csv").send(toCsv(rows,[{key:"name",label:"Naam"},{key:"email",label:"E-mail"},{key:"plan",label:"Abonnement"},{key:"status",label:"Status"},{key:"started_at",label:"Startdatum"},{key:"preference",label:"Voorkeur"},{key:"month_selection",label:"Maandkeuze"}]));
});

module.exports = router;
