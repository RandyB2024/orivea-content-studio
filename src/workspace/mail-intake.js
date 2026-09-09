const { db } = require("./db");
const { emitEvent, state } = require("./agent");

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
const PLAN_PRICES = { essential: 17.95, signature: 22.95, duo: 34.95 };
let timer;
let running = false;

function configured() {
  return Boolean(process.env.MAIL_TENANT_ID && process.env.MAIL_CLIENT_ID && process.env.MAIL_CLIENT_SECRET && process.env.MAILBOX_ADDRESS);
}

function stripHtml(value = "") {
  return String(value)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"');
}

function parseDataBlock(body) {
  const text = stripHtml(body);
  const match = text.match(/---\s*ORIVEA-DATA\s*---([\s\S]*?)---\s*END ORIVEA-DATA\s*---/i);
  if (!match) return null;
  const raw = match[1].trim();
  try { return JSON.parse(raw); } catch {}
  const data = {};
  for (const line of raw.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator > 0) data[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return Object.keys(data).length ? data : null;
}

function classify(message, data) {
  const type = String(data?.type || "").toLowerCase();
  if (["scent_club_request", "order", "newsletter", "contact", "b2b_request"].includes(type)) return type;
  const haystack = `${message.subject || ""}\n${stripHtml(message.body?.content || message.body || "")}`.toLowerCase();
  if (haystack.includes("scent club aanvraag")) return "scent_club_request";
  if (/ordernummer|bestelling|paypal transaction/.test(haystack)) return "order";
  if (/zakelijke b2b aanvraag|zakelijke aanvraag/.test(haystack)) return "b2b_request";
  if (/nieuwsbrief (aanmelding|afmelding)/.test(haystack)) return "newsletter";
  if (/contactaanvraag|contactformulier/.test(haystack)) return "contact";
  return "unknown";
}

function money(value) {
  if (typeof value === "number") return value;
  const normalized = String(value || "").replace(/[^0-9,.-]/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function bool(value) { return /^(1|true|yes|ja|on|akkoord)$/i.test(String(value || "")); }
function required(data, fields) {
  const missing = fields.filter((field) => !String(data[field] ?? "").trim());
  if (missing.length) throw new Error(`Ontbrekende velden: ${missing.join(", ")}`);
}

function importScent(data) {
  required(data, ["request_id", "first_name", "last_name", "email", "plan", "preference_gender", "preference_family", "selection_mode"]);
  const plan = String(data.plan).toLowerCase();
  if (!PLAN_PRICES[plan]) throw new Error("Onbekend Scent Club-abonnement");
  const existing = db.prepare("SELECT id FROM scent_club_requests WHERE external_id=?").get(data.request_id);
  if (existing) return { type: "scent_club_request", id: existing.id, duplicate: true };
  const result = db.prepare(`INSERT INTO scent_club_requests (external_id,first_name,last_name,email,phone,plan,monthly_price,preference_gender,preference_family,selection_mode,status,source,notes) VALUES (?,?,?,?,?,?,?,?,?,?,'new','emailjs_email',?)`).run(data.request_id,data.first_name,data.last_name,data.email,data.phone || "",plan,PLAN_PRICES[plan],data.preference_gender,data.preference_family,data.selection_mode,data.notes || "");
  return { type: "scent_club_request", id: Number(result.lastInsertRowid) };
}

function importOrder(data, messageId) {
  required(data, ["order_number", "customer_email"]);
  const existing = db.prepare("SELECT id FROM orders WHERE order_number=?").get(data.order_number);
  const isPayLater = String(data.payment_method || "").toLowerCase() === "pay_later";
  const verified = String(data.payment_status || "").toUpperCase() === "COMPLETED" && Boolean(data.capture_id || data.paypal_transaction_id);
  const paymentStatus = isPayLater ? "unpaid" : "verification_required";
  if (existing) {
    db.prepare(`UPDATE orders SET customer_name=COALESCE(NULLIF(?,''),customer_name),customer_email=COALESCE(NULLIF(?,''),customer_email),customer_phone=COALESCE(NULLIF(?,''),customer_phone),customer_address=COALESCE(NULLIF(?,''),customer_address),order_items=COALESCE(NULLIF(?,''),order_items),subtotal=?,shipping_cost=?,total=?,paypal_order_id=COALESCE(NULLIF(?,''),paypal_order_id),paypal_transaction_id=COALESCE(NULLIF(?,''),paypal_transaction_id),newsletter_opt_in=?,source=COALESCE(source,'emailjs_email'),mail_message_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(data.customer_name || "",data.customer_email,data.customer_phone || "",data.customer_address || "",typeof data.items === "string" ? data.items : JSON.stringify(data.items || []),money(data.subtotal),money(data.shipping),money(data.total),data.paypal_order_id || "",data.capture_id || data.paypal_transaction_id || "",bool(data.newsletter),messageId,existing.id);
    return { type: "order", id: existing.id, duplicate: true };
  }
  const result = db.prepare(`INSERT INTO orders (order_number,customer_name,customer_email,customer_phone,customer_address,order_date,order_items,subtotal,shipping_cost,total,paypal_order_id,paypal_transaction_id,payment_status,payment_method,status,newsletter_opt_in,source,mail_message_id,notes,pay_later_status,age_confirmed) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(data.order_number,data.customer_name || "",data.customer_email,data.customer_phone || "",data.customer_address || "",data.created_at || new Date().toISOString(),typeof data.items === "string" ? data.items : JSON.stringify(data.items || []),money(data.subtotal),money(data.shipping),money(data.total),data.paypal_order_id || "",data.capture_id || data.paypal_transaction_id || "",paymentStatus,isPayLater?"pay_later":"PayPal",isPayLater?"review_required":"Nieuw",bool(data.newsletter)?1:0,"emailjs_email",messageId,isPayLater?"Fallback ontvangen; verifieer tegen de webshop-outbox.":verified?"PayPal-identificatie aanwezig; betaling nog server-side verifiëren.":"Betaling niet geverifieerd vanuit e-mail.",isPayLater?"review_required":null,isPayLater?1:0);
  return { type: "order", id: Number(result.lastInsertRowid) };
}

function importNewsletter(data) {
  required(data, ["request_id", "email"]);
  const eventType = String(data.action || "subscribe") === "unsubscribe" ? "unsubscribe" : "subscribe";
  const existing = db.prepare("SELECT id FROM newsletter_events WHERE request_id=?").get(data.request_id);
  if (existing) return { type: "newsletter", id: existing.id, duplicate: true };
  const result = db.prepare("INSERT INTO newsletter_events (email,name,event_type,request_id,source) VALUES (?,?,?,?, 'emailjs_email')").run(data.email,data.name || "",eventType,data.request_id);
  db.prepare(`INSERT INTO customers (email,name,newsletter_opt_in,newsletter_opt_in_at) VALUES (?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(email) DO UPDATE SET name=COALESCE(NULLIF(excluded.name,''),customers.name),newsletter_opt_in=excluded.newsletter_opt_in,newsletter_opt_in_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`).run(data.email,data.name || "",eventType === "subscribe" ? 1 : 0);
  return { type: "newsletter", id: Number(result.lastInsertRowid) };
}

function importContact(data) {
  required(data, ["request_id", "email"]);
  const existing = db.prepare("SELECT id FROM customer_messages WHERE request_id=?").get(data.request_id);
  if (existing) return { type: "customer_message", id: existing.id, duplicate: true };
  const result = db.prepare("INSERT INTO customer_messages (request_id,name,email,phone,subject,message) VALUES (?,?,?,?,?,?)").run(data.request_id,data.name || "",data.email,data.phone || "",data.subject || "Contactaanvraag",data.message || "");
  db.prepare("INSERT INTO contact_requests (name,email,phone,subject,message_type,message_body,status,notes) VALUES (?,?,?,?,? ,?,'Nieuw',?)").run(data.name || "",data.email,data.phone || "",data.subject || "Contactaanvraag","emailjs_email",data.message || "",`request_id=${data.request_id}`);
  return { type: "customer_message", id: Number(result.lastInsertRowid) };
}

function importB2b(data) {
  required(data, ["request_id", "email"]);
  const existing = db.prepare("SELECT id FROM b2b_requests WHERE request_id=?").get(data.request_id);
  if (existing) return { type: "b2b_request", id: existing.id, duplicate: true };
  const result = db.prepare("INSERT INTO b2b_requests (request_id,name,company,email,phone,business_type,message) VALUES (?,?,?,?,?,?,?)").run(data.request_id,data.name || "",data.company || "",data.email,data.phone || "",data.business_type || "",data.message || "");
  db.prepare("INSERT INTO contact_requests (name,email,phone,subject,message_type,message_body,status,notes) VALUES (?,?,?,?,?,?,'Nieuw',?)").run(data.name || "",data.email,data.phone || "","Zakelijke B2B aanvraag","emailjs_email",data.message || "",`request_id=${data.request_id}; company=${data.company || ""}; business_type=${data.business_type || ""}`);
  return { type: "b2b_request", id: Number(result.lastInsertRowid) };
}

function processMessage(message) {
  const messageId = message.internetMessageId || message.id;
  if (!messageId) throw new Error("Mail heeft geen message-ID");
  const known = db.prepare("SELECT * FROM mail_intake_events WHERE message_id=?").get(messageId);
  if (known) return { status: "duplicate", event: known };
  const body = message.body?.content || message.body || "";
  const data = parseDataBlock(body);
  const type = classify(message, data);
  const sender = message.sender?.emailAddress?.address || message.from?.emailAddress?.address || "";
  const eventId = Number(db.prepare("INSERT INTO mail_intake_events (message_id,request_id,message_type,subject,sender,received_at) VALUES (?,?,?,?,?,?)").run(messageId,data?.request_id || data?.order_number || null,type,message.subject || "",sender,message.receivedDateTime || new Date().toISOString()).lastInsertRowid);
  try {
    if (!data) throw new Error("Machineleesbaar ORIVEA-DATA-blok ontbreekt");
    const linked = db.transaction(() => {
      if (type === "scent_club_request") return importScent(data);
      if (type === "order") return importOrder(data, messageId);
      if (type === "newsletter") return importNewsletter(data);
      if (type === "contact") return importContact(data);
      if (type === "b2b_request") return importB2b(data);
      throw new Error("Mailtype kon niet betrouwbaar worden vastgesteld");
    })();
    const status = linked.duplicate ? "duplicate" : "processed";
    db.prepare("UPDATE mail_intake_events SET status=?,processed_at=CURRENT_TIMESTAMP,linked_entity_type=?,linked_entity_id=? WHERE id=?").run(status,linked.type,String(linked.id),eventId);
    emitEvent(linked.duplicate ? "mail_duplicate" : "mail_imported", linked.duplicate ? `Dubbele ${type}-aanvraag genegeerd.` : `${type === "order" ? `Order ${data.order_number}` : "Nieuwe " + type.replaceAll("_", " ")} ontvangen via e-mail.`, linked.duplicate ? "info" : "success");
    return { status, linked };
  } catch (error) {
    db.prepare("UPDATE mail_intake_events SET status='review_required',processed_at=CURRENT_TIMESTAMP,error=? WHERE id=?").run(error.message,eventId);
    emitEvent("mail_review_required",`Mail vraagt handmatige controle: ${message.subject || "zonder onderwerp"}.`,"warning");
    return { status: "review_required", error: error.message };
  }
}

async function accessToken(fetchImpl = fetch) {
  const body = new URLSearchParams({ client_id:process.env.MAIL_CLIENT_ID,client_secret:process.env.MAIL_CLIENT_SECRET,scope:"https://graph.microsoft.com/.default",grant_type:"client_credentials" });
  const response = await fetchImpl(`https://login.microsoftonline.com/${encodeURIComponent(process.env.MAIL_TENANT_ID)}/oauth2/v2.0/token`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});
  if (!response.ok) throw new Error(`Microsoft token geweigerd (${response.status})`);
  return (await response.json()).access_token;
}

async function graphMessages(fetchImpl = fetch) {
  const token = await accessToken(fetchImpl);
  const checkpoint = db.prepare("SELECT value FROM agent_state WHERE key='last_mail_sync_at'").get()?.value || new Date(Date.now() - 14 * 86400000).toISOString();
  const params = new URLSearchParams({"$select":"id,internetMessageId,subject,sender,from,receivedDateTime,body,bodyPreview","$filter":`receivedDateTime ge ${checkpoint}`,"$orderby":"receivedDateTime asc","$top":"100"});
  let url = `${GRAPH_ROOT}/users/${encodeURIComponent(process.env.MAILBOX_ADDRESS)}/mailFolders/inbox/messages?${params}`;
  const messages = [];
  while (url && messages.length < 500) {
    const response = await fetchImpl(url,{headers:{Authorization:`Bearer ${token}`,Prefer:'outlook.body-content-type="text"'}});
    if (!response.ok) throw new Error(`Microsoft Graph mailboxfout (${response.status})`);
    const page = await response.json();
    messages.push(...(page.value || []));
    url = page["@odata.nextLink"] || null;
  }
  return messages;
}

async function syncMailbox({ fetchImpl = fetch } = {}) {
  if (running) return { status:"busy", processed:0, reviewRequired:0, duplicates:0 };
  if (!configured()) return { status:"offline", reason:"Microsoft Graph is niet geconfigureerd", processed:0, reviewRequired:0, duplicates:0 };
  running = true;
  const checkedAt = new Date().toISOString();
  try {
    const messages = await graphMessages(fetchImpl);
    const report = { status:"active", checkedAt, found:messages.length, processed:0, reviewRequired:0, duplicates:0 };
    for (const message of messages) {
      const result = processMessage(message);
      if (result.status === "processed") report.processed += 1;
      else if (result.status === "review_required") report.reviewRequired += 1;
      else report.duplicates += 1;
      state("last_processed_message_id", message.internetMessageId || message.id || "");
    }
    state("last_mail_sync_at", checkedAt); state("mail_intake_status", "active"); state("mail_intake_last_error", "");
    return report;
  } catch (error) {
    state("mail_intake_status", "error"); state("mail_intake_last_error", error.message);
    console.error("Mail Intake Agent error:", error); emitEvent("mail_intake_error",`Mail Intake Agent: ${error.message}`,"error");
    throw error;
  } finally { running = false; }
}

function summary() {
  const today = db.prepare("SELECT COUNT(*) count FROM mail_intake_events WHERE status='processed' AND date(processed_at)=date('now','localtime')").get().count;
  const review = db.prepare("SELECT COUNT(*) count FROM mail_intake_events WHERE status='review_required'").get().count;
  const get = (key) => db.prepare("SELECT value FROM agent_state WHERE key=?").get(key)?.value || "";
  return { configured:configured(), status:configured() ? (get("mail_intake_status") || "offline") : "offline", lastCheck:get("last_mail_sync_at") || null, todayProcessed:today, reviewRequired:review, lastError:get("mail_intake_last_error") || null };
}

function startMailIntake() {
  if (timer) return timer;
  const interval = Math.max(1, Number(process.env.MAIL_POLL_INTERVAL_MINUTES || 3)) * 60000;
  setTimeout(() => syncMailbox().catch(() => {}), 3000).unref?.();
  timer = setInterval(() => syncMailbox().catch(() => {}), interval);
  timer.unref?.();
  return timer;
}

module.exports = { parseDataBlock, classify, processMessage, syncMailbox, summary, startMailIntake };
