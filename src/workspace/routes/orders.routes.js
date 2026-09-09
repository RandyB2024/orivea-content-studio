const express = require("express");
const { db } = require("../db");
const { writeAudit } = require("../audit");
const { toCsv } = require("../utils");

const router = express.Router();
const payLaterDays = Math.max(1,Number(process.env.PAY_LATER_DAYS)||14);

async function sendPayLaterMail(order,action) {
  const service_id=process.env.PAY_LATER_EMAILJS_SERVICE_ID;
  const template_id=process.env.PAY_LATER_EMAILJS_TEMPLATE_ID;
  const public_key=process.env.PAY_LATER_EMAILJS_PUBLIC_KEY;
  if(!service_id||!template_id||!public_key)return {sent:false,warning:"EmailJS voor achteraf betalen is nog niet geconfigureerd."};
  const messages={ship:"Je bestelling is verzonden. Betaal het totaalbedrag uiterlijk op de vermelde vervaldatum.",remind:"Volgens onze administratie staat de betaling voor je bestelling nog open.",reject:"Je aanvraag voor achteraf betalen is niet goedgekeurd. De bestelling is geannuleerd."};
  if(!messages[action])return {sent:false,skipped:true};
  const response=await fetch("https://api.emailjs.com/api/v1.0/email/send",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({service_id,template_id,user_id:public_key,template_params:{to_email:order.customer_email,customer_name:order.customer_name,order_number:order.order_number,total:new Intl.NumberFormat("nl-NL",{style:"currency",currency:"EUR"}).format(order.total),due_date:order.pay_later_due_date||"wordt na verzending vastgesteld",account_name:process.env.PAY_LATER_ACCOUNT_NAME||"",iban:process.env.PAY_LATER_IBAN||"",payment_reference:order.order_number,message:messages[action]}})});
  if(!response.ok)throw new Error(`EmailJS HTTP ${response.status}`);
  return {sent:true};
}

router.get("/pay-later",(req,res)=>{
  const status=String(req.query.status||"");
  const allowed=["review_required","approved","shipped","unpaid","overdue","paid","cancelled","rejected"];
  let where="WHERE payment_method='pay_later'"; const args=[];
  if(status&&allowed.includes(status)) {
    if(status==="unpaid") where+=" AND payment_status='unpaid'";
    else if(status==="paid") where+=" AND payment_status='paid'";
    else if(status==="cancelled") where+=" AND pay_later_status IN ('cancelled','rejected')";
    else {where+=" AND pay_later_status=?";args.push(status);}
  }
  res.json(db.prepare(`SELECT *,CAST(julianday('now')-julianday(COALESCE(pay_later_shipped_at,created_at)) AS INTEGER) days_open FROM orders ${where} ORDER BY CASE WHEN pay_later_due_date IS NOT NULL AND date(pay_later_due_date)<date('now') AND payment_status!='paid' THEN 0 ELSE 1 END,pay_later_due_date,created_at DESC`).all(...args));
});

router.post("/:id/pay-later/:action",async(req,res)=>{
  const order=db.prepare("SELECT * FROM orders WHERE id=? AND payment_method='pay_later'").get(req.params.id);
  if(!order)return res.status(404).json({error:"Achterafbetaalorder niet gevonden."});
  const now=new Date(); const iso=now.toISOString(); const action=req.params.action;
  let sql; let params=[]; let nextStatus=order.pay_later_status;
  if(action==="approve"){nextStatus="approved";sql="UPDATE orders SET pay_later_status='approved',status='Goedgekeurd',pay_later_approved_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?";params=[iso,order.id];}
  else if(action==="reject"){nextStatus="rejected";sql="UPDATE orders SET pay_later_status='rejected',status='Geannuleerd',payment_status='cancelled',fulfillment_status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=?";params=[order.id];}
  else if(action==="ship"){if(!["approved","shipped"].includes(order.pay_later_status))return res.status(409).json({error:"Keur de order eerst goed."});const due=new Date(now.getTime()+payLaterDays*86400000).toISOString();nextStatus="shipped";sql="UPDATE orders SET pay_later_status='shipped',status='Verzonden',fulfillment_status='shipped',pay_later_shipped_at=?,pay_later_due_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=?";params=[iso,due,order.id];}
  else if(action==="paid"){nextStatus="paid";sql="UPDATE orders SET pay_later_status='paid',payment_status='paid',pay_later_paid_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?";params=[iso,order.id];}
  else if(action==="remind"){if(order.payment_status==="paid")return res.status(409).json({error:"Deze order is al betaald."});nextStatus=order.pay_later_status;sql="UPDATE orders SET pay_later_reminder_count=pay_later_reminder_count+1,pay_later_last_reminder_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?";params=[iso,order.id];}
  else return res.status(400).json({error:"Onbekende actie."});
  if(!process.env.WEBSHOP_SYNC_URL||!process.env.WEBSHOP_SYNC_SECRET)return res.status(503).json({error:"Webshop-terugkoppeling is niet geconfigureerd; status is niet gewijzigd."});
  try { const response=await fetch(`${process.env.WEBSHOP_SYNC_URL.replace(/\/$/,"")}/api/pay-later/manage`,{method:"POST",headers:{Authorization:`Bearer ${process.env.WEBSHOP_SYNC_SECRET}`,"Content-Type":"application/json"},body:JSON.stringify({orderNumber:order.order_number,action})}); if(!response.ok)throw new Error(`HTTP ${response.status}`); }
  catch(error){console.error("Pay-later webshop update mislukt:",error);return res.status(502).json({error:"De webshopstatus kon niet veilig worden bijgewerkt; lokaal is niets gewijzigd."});}
  db.prepare(sql).run(...params);
  const updated=db.prepare("SELECT * FROM orders WHERE id=?").get(order.id);
  let email={sent:false,skipped:true};
  try{email=await sendPayLaterMail(updated,action);}catch(error){console.error("Pay-later e-mail mislukt:",error);email={sent:false,warning:"De status is opgeslagen, maar de klantmail kon niet worden verzonden."};}
  writeAudit({entityType:"order",entityId:order.order_number,action:`pay_later_${action}`,previousStatus:order.pay_later_status,newStatus:nextStatus,byUser:req.session.user.username,metadata:{amount:order.total,due_date:order.pay_later_due_date}});
  res.json({...updated,email});
});

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
