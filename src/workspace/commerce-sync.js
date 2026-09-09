const { db } = require("./db");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const paymentMap = { payment_completed: "paid", payment_cancelled: "cancelled", payment_failed: "payment_failed", order_created: "payment_pending", pay_later_order_created:"unpaid" };
const notificationTitles = { payment_completed: "Nieuwe betaalde order", payment_failed: "Betaling mislukt", pay_later_order_created:"Achterafbetaling vereist controle", scent_club_request: "Nieuwe Scent Club aanvraag", subscription_cancel_requested: "Abonnement opzegging aangevraagd" };

function ingestEvent(event) {
  if (!event?.event_id || !event?.event_type || !event?.payload) throw new Error("Ongeldig webshop-event.");
  const existing = db.prepare("SELECT id FROM webshop_events WHERE event_id=?").get(event.event_id);
  if (existing) return { duplicate: true };
  const run = db.transaction(() => {
    const payload = event.payload;
    db.prepare("INSERT INTO webshop_events (event_id,event_type,aggregate_id,payload,created_at) VALUES (?,?,?,?,?)").run(event.event_id,event.event_type,event.aggregate_id || payload.order_number || null,JSON.stringify(payload),event.created_at || new Date().toISOString());
    if (["order_created","payment_completed","payment_cancelled","payment_failed","pay_later_order_created"].includes(event.event_type)) upsertOrder(payload,event.event_type);
    if (event.event_type === "newsletter_opt_in") upsertCustomer(payload.customer || payload,true,payload.newsletter_opt_in_at);
    if (event.event_type === "newsletter_opt_out") {
      upsertCustomer(payload.customer || payload,false,null);
      db.prepare("UPDATE customers SET newsletter_opt_in=0,newsletter_opt_in_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE lower(email)=lower(?)").run(payload.email);
    }
    if (event.event_type === "scent_club_request") {
      db.prepare(`INSERT INTO scent_club_requests (external_id,first_name,last_name,email,phone,plan,monthly_price,preference_gender,preference_family,selection_mode,source,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(external_id) DO NOTHING`).run(payload.external_id,payload.first_name,payload.last_name,payload.email,payload.phone,payload.plan,payload.monthly_price,payload.preference_gender,payload.preference_family,payload.selection_mode,payload.source||"orivea.nl",payload.notes||"");
    }
    if (notificationTitles[event.event_type]) db.prepare("INSERT INTO notifications (type,title,entity_type,entity_id) VALUES (?,?,?,?)").run(event.event_type,notificationTitles[event.event_type],event.event_type.startsWith("scent") ? "scent_club" : "order",event.aggregate_id || payload.order_number || "");
    db.prepare(`INSERT INTO integration_health (integration,status,last_event_at,last_order_sync_at,last_scent_club_sync_at,last_error,updated_at) VALUES ('webshop','online',?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(integration) DO UPDATE SET status='online',last_event_at=excluded.last_event_at,last_order_sync_at=COALESCE(excluded.last_order_sync_at,integration_health.last_order_sync_at),last_scent_club_sync_at=COALESCE(excluded.last_scent_club_sync_at,integration_health.last_scent_club_sync_at),last_error=NULL,updated_at=CURRENT_TIMESTAMP`).run(new Date().toISOString(),event.event_type.includes("order") || event.event_type.includes("payment") ? new Date().toISOString() : null,event.event_type.includes("scent") || event.event_type.includes("subscription") ? new Date().toISOString() : null,null);
  });
  run();
  return { duplicate: false };
}

function upsertCustomer(customer, newsletterOptIn, optInAt) {
  const email = String(customer?.email || "").trim().toLowerCase();
  if (!email) return null;
  db.prepare(`INSERT INTO customers (email,name,phone,address,newsletter_opt_in,newsletter_opt_in_at) VALUES (?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET name=COALESCE(NULLIF(excluded.name,''),customers.name),phone=COALESCE(NULLIF(excluded.phone,''),customers.phone),address=COALESCE(NULLIF(excluded.address,''),customers.address),newsletter_opt_in=MAX(customers.newsletter_opt_in,excluded.newsletter_opt_in),newsletter_opt_in_at=COALESCE(excluded.newsletter_opt_in_at,customers.newsletter_opt_in_at),updated_at=CURRENT_TIMESTAMP`).run(email,customer.name || "",customer.phone || "",customer.address || "",newsletterOptIn ? 1 : 0,optInAt || null);
  return db.prepare("SELECT id FROM customers WHERE email=?").get(email)?.id || null;
}

function upsertOrder(payload, eventType) {
  if (!payload.order_number) throw new Error("order_number ontbreekt.");
  const customer = payload.customer || {};
  const paymentStatus = paymentMap[eventType] || payload.payment_status || "payment_pending";
  upsertCustomer(customer,payload.newsletter_opt_in,payload.newsletter_opt_in_at);
  const items = Array.isArray(payload.items) ? payload.items : [];
  const address = customer.address || payload.customer_address || "";
  db.prepare(`INSERT INTO orders (order_number,customer_name,customer_email,customer_phone,customer_address,order_date,order_items,subtotal,discounts,discount_amount,shipping_cost,vat_rate,vat_amount,total,paypal_order_id,paypal_transaction_id,payment_status,payment_method,status,newsletter_opt_in,terms_accepted,return_policy_accepted,scent_club_discount,scent_club_member_id,fulfillment_status,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(order_number) DO UPDATE SET customer_name=excluded.customer_name,customer_email=excluded.customer_email,customer_phone=excluded.customer_phone,customer_address=excluded.customer_address,order_items=excluded.order_items,subtotal=excluded.subtotal,discounts=excluded.discounts,discount_amount=excluded.discount_amount,shipping_cost=excluded.shipping_cost,total=excluded.total,paypal_order_id=excluded.paypal_order_id,paypal_transaction_id=excluded.paypal_transaction_id,payment_status=excluded.payment_status,payment_method=excluded.payment_method,status=excluded.status,newsletter_opt_in=excluded.newsletter_opt_in,terms_accepted=excluded.terms_accepted,return_policy_accepted=excluded.return_policy_accepted,scent_club_discount=excluded.scent_club_discount,scent_club_member_id=excluded.scent_club_member_id,updated_at=CURRENT_TIMESTAMP`).run(payload.order_number,customer.name || payload.customer_name,customer.email || payload.customer_email,customer.phone || payload.customer_phone,address,payload.created_at || new Date().toISOString(),JSON.stringify(items),Number(payload.subtotal)||0,JSON.stringify(payload.discounts||[]),Number(payload.discount_amount)||0,Number(payload.shipping_cost)||0,21,Number(payload.vat_amount)||0,Number(payload.total)||0,payload.paypal_order_id||null,payload.paypal_transaction_id||null,paymentStatus,payload.payment_method||"PayPal",paymentStatus === "paid" ? "Nieuw" : paymentStatus,payload.newsletter_opt_in?1:0,payload.terms_accepted?1:0,payload.return_policy_accepted?1:0,payload.scent_club_discount_applied?1:0,payload.scent_club_member_id||null,"unfulfilled");
  const order = db.prepare("SELECT id FROM orders WHERE order_number=?").get(payload.order_number);
  db.prepare("DELETE FROM order_items WHERE order_id=?").run(order.id);
  const insert = db.prepare("INSERT INTO order_items (order_id,product_id,product_name,product_reference,variant,variant_label,quantity,unit_price,line_total) VALUES (?,?,?,?,?,?,?,?,?)");
  items.forEach((item) => insert.run(order.id,item.product_id,item.product_name,item.reference||null,item.variant||null,item.variant_label||null,Number(item.quantity)||1,Number(item.unit_price)||0,Number(item.line_total)||0));
  if (payload.payment_method === "pay_later") db.prepare("UPDATE orders SET pay_later_status=?,pay_later_due_date=?,pay_later_approved_at=?,pay_later_shipped_at=?,pay_later_paid_at=?,pay_later_reminder_count=?,pay_later_last_reminder_at=?,age_confirmed=?,status=? WHERE id=?").run(payload.pay_later_status||"review_required",payload.pay_later_due_date||null,payload.pay_later_approved_at||null,payload.pay_later_shipped_at||null,payload.pay_later_paid_at||null,Number(payload.pay_later_reminder_count)||0,payload.pay_later_last_reminder_at||null,payload.age_confirmed?1:0,payload.order_status||"review_required",order.id);
}

async function syncOnce() {
  const base = process.env.WEBSHOP_SYNC_URL;
  const secret = process.env.WEBSHOP_SYNC_SECRET;
  if (!base || !secret) return { configured: false };
  const response = await fetch(`${base.replace(/\/$/,"")}/api/sync/pending`,{headers:{Authorization:`Bearer ${secret}`}});
  if (!response.ok) throw new Error(`Webshop sync HTTP ${response.status}`);
  const { events = [] } = await response.json();
  const acknowledged = [];
  for (const event of events) { ingestEvent(event); acknowledged.push(event.event_id); }
  if (acknowledged.length) await fetch(`${base.replace(/\/$/,"")}/api/sync/ack`,{method:"POST",headers:{Authorization:`Bearer ${secret}`,"Content-Type":"application/json"},body:JSON.stringify({eventIds:acknowledged})});
  return { configured: true, count: acknowledged.length };
}

function startCommerceSync() {
  syncProductsFromWebshop();
  if (!process.env.WEBSHOP_SYNC_URL || !process.env.WEBSHOP_SYNC_SECRET) { console.warn("Webshop sync niet geconfigureerd; events kunnen nog via webhook binnenkomen."); return; }
  const run = () => syncOnce().catch((error) => {
    console.error("Webshop sync error:",error);
    db.prepare(`INSERT INTO integration_health (integration,status,last_error,updated_at) VALUES ('webshop','error',?,CURRENT_TIMESTAMP) ON CONFLICT(integration) DO UPDATE SET status='error',last_error=excluded.last_error,updated_at=CURRENT_TIMESTAMP`).run(error.message);
  });
  run();
  setInterval(run,Math.max(30000,Number(process.env.WEBSHOP_SYNC_INTERVAL_MS)||60000)).unref();
}

function syncProductsFromWebshop() {
  try {
    const sourcePath=path.resolve(process.cwd(),process.env.ORIVEA_PRODUCTS_PATH||"../Orivea/products.js");
    const sandbox={window:{}};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(sourcePath,"utf8"),sandbox);
    const upsert=db.prepare(`INSERT INTO products (product_id,name,category,glantier_reference,price,active,payload,updated_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(product_id) DO UPDATE SET name=excluded.name,category=excluded.category,glantier_reference=excluded.glantier_reference,price=excluded.price,active=excluded.active,payload=excluded.payload,updated_at=CURRENT_TIMESTAMP`);
    const transaction=db.transaction((products)=>products.forEach((product)=>upsert.run(String(product.id),product.naam,product.categorie||"",product.glantierNummer||null,Number(product.prijs)||0,product.availableForSale===false||product.pricePending?0:1,JSON.stringify(product))));
    transaction(sandbox.window.ORIVEA_PRODUCTS||[]);
    console.log(`Webshop productcatalogus gesynchroniseerd: ${(sandbox.window.ORIVEA_PRODUCTS||[]).length} producten.`);
  } catch(error){console.error("Productcatalogus sync mislukt:",error);}
}

module.exports = { ingestEvent, startCommerceSync, syncOnce, syncProductsFromWebshop };
