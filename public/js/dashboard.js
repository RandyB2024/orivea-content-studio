const navItems = [
  ["Vandaag", "/dashboard"],
  ["Content", "/content"],
  ["Kennisbank", "/knowledge"],
  ["Nieuwe post", "/posts/new"],
  ["Kalender", "/calendar"],
  ["Campagnes", "/campaigns"],
  ["Publicaties", "/history"],
  ["Integraties", "/settings/integrations"],
  ["Scent Club", "/scent-club"],
  ["Orders", "/orders"],
  ["Klanten", "/customers"],
  ["Contact", "/contact"],
  ["Nieuwsbrief", "/newsletter"],
  ["Social Agent", "/social"],
  ["Afbeeldingen", "/assets"],
  ["Auditlog", "/audit"],
  ["Instellingen", "/settings"]
];
let csrfToken = "";

function money(value) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(value || 0));
}

async function api(url, options = {}) {
  if (!csrfToken) csrfToken = (await fetch("/api/studio/csrf").then((response) => response.json())).csrfToken;
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken, ...(options.headers || {}) },
    ...options
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function initNav() {
  document.querySelectorAll("[data-nav]").forEach((target) => {
    const current = window.location.pathname;
    target.innerHTML = `
      <div class="brand"><strong>ORIVÈA</strong><span>Content Studio</span></div>
      <nav class="nav">
        ${navItems.map(([label, href]) => `<a class="${current === href || (href === "/scent-club" && current.startsWith("/scent-club")) ? "active" : ""}" href="${href}">${label}</a>`).join("")}
        <form method="post" action="/logout"><button type="submit">Uitloggen</button></form>
      </nav>
    `;
  });
}

function bindSearch(loader) {
  const input = document.getElementById("search");
  if (!input) return;
  let timer;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => loader(input.value), 250);
  });
}

async function loadDashboard() {
  const [data, scent, commerce, health] = await Promise.all([api("/api/studio/summary"), api("/api/scent-club/summary"), api("/api/summary"), api("/api/integration-health")]);
  document.getElementById("summaryCards").innerHTML = [
    ["Content", data.content],
    ["Ongebruikt", data.unused],
    ["Rechten controleren", data.unknownRights],
    ["Gepland", data.scheduled],
    ["Actie vereist", data.failed],
    ["Scent Club actief", scent.active],
    ["Scent Club aanvragen", scent.newRequests],
    ["Scent Club actie nodig", scent.actionRequired]
    ,["Orders", commerce.orders]
    ,["Open orders", commerce.openOrders]
    ,["Omzet", money(commerce.revenue)]
  ].map(([label, value]) => `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`).join("");
  document.getElementById("summaryCards").insertAdjacentHTML("afterend", `<section class="panel"><p class="eyebrow">Webshop koppeling</p><h2>${health.webshop.status === "online" ? "Online" : "Aandacht nodig"}</h2><p>Laatste event: ${health.webshop.last_event_at || "Nog geen event"} · Laatste ordersync: ${health.webshop.last_order_sync_at || "Nog niet gesynchroniseerd"}</p><p>${health.pendingOrders} betaling(en) in afwachting · ${health.unreadNotifications} interne melding(en)</p></section>`);
  if (data.warning) {
    document.getElementById("summaryCards").insertAdjacentHTML("afterend", `<section class="panel notice"><p>${data.warning}</p></section>`);
  }
}

async function loadCustomers(q = "") {
  const rows = await api(`/api/customers?q=${encodeURIComponent(q)}`);
  document.getElementById("customersTable").innerHTML = rows.map((row) => `<tr><td><strong>${row.name || "-"}</strong><br><small>${row.email}</small><br><small>${row.phone || ""}</small></td><td>${row.order_count}</td><td>${money(row.total_spent)}</td><td>${row.newsletter_opt_in ? "Ja" : "Nee"}</td><td>${row.scent_club_member ? "Actief" : "Nee"}</td><td>${row.last_order || "-"}</td></tr>`).join("");
}

async function loadOrderDetail() {
  const id = window.location.pathname.split("/").pop();
  const row = await api(`/api/orders/${id}`);
  document.getElementById("orderTitle").textContent = row.order_number;
  document.getElementById("orderDetail").innerHTML = `<section class="panel"><h2>Klant</h2><p><strong>${row.customer_name || "-"}</strong><br>${row.customer_email || ""}<br>${row.customer_phone || ""}<br>${row.customer_address || ""}</p></section><section class="panel"><h2>Bedragen en betaling</h2><p>Subtotaal ${money(row.subtotal)}<br>Korting ${money(row.discount_amount)}<br>Verzending ${money(row.shipping_cost)}<br><strong>Totaal ${money(row.total)}</strong></p><p>Status: ${row.payment_status || "-"}<br>PayPal order: ${row.paypal_order_id || "-"}<br>Transactie: ${row.paypal_transaction_id || "-"}</p></section><section class="panel"><h2>Producten</h2>${row.items.map((item) => `<p>${item.quantity}x ${item.product_name} · ${item.variant_label || item.variant || ""} <strong>${money(item.line_total)}</strong></p>`).join("") || "<p>Geen orderregels.</p>"}</section><section class="panel"><h2>Toestemming en verwerking</h2><p>Nieuwsbrief: ${row.newsletter_opt_in ? "Ja" : "Nee"}<br>Voorwaarden: ${row.terms_accepted ? "Akkoord" : "Niet vastgelegd"}<br>Retourbeleid: ${row.return_policy_accepted ? "Akkoord" : "Niet vastgelegd"}<br>Scent Club korting: ${row.scent_club_discount ? "Ja" : "Nee"}</p><form id="orderUpdate"><label>Status<select name="status">${["Nieuw","In behandeling","Verzonden","Afgerond","Geannuleerd"].map((value) => `<option ${row.status === value ? "selected" : ""}>${value}</option>`).join("")}</select></label><label>Fulfillment<select name="fulfillment_status">${["unfulfilled","processing","shipped","fulfilled","cancelled","refunded"].map((value) => `<option ${row.fulfillment_status === value ? "selected" : ""}>${value}</option>`).join("")}</select></label><label>Tracking<input name="tracking_code" value="${row.tracking_code || ""}"></label><label>Interne notitie<textarea name="notes">${row.notes || ""}</textarea></label><button class="button button-primary">Opslaan</button></form></section><section class="panel"><h2>Tijdlijn</h2>${row.timeline.map((item) => `<p><strong>${item.event_type}</strong><br><small>${item.created_at}</small></p>`).join("") || "<p>Nog geen events.</p>"}</section>`;
  document.getElementById("orderUpdate").addEventListener("submit", async (event) => {
    event.preventDefault();
    await api(`/api/orders/${id}`, { method:"PUT", body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())) });
    await loadOrderDetail();
  });
}

async function loadOrders(q = "") {
  const rows = await api(`/api/orders?q=${encodeURIComponent(q)}`);
  document.getElementById("ordersTable").innerHTML = rows.map((row) => `
    <tr>
      <td><strong>${row.order_number || "-"}</strong><br><small>${row.created_at || ""}</small></td>
      <td>${row.customer_name || "-"}<br><small>${row.customer_email || ""}</small></td>
      <td>${money(row.total)}</td>
      <td>${row.payment_status || "-"}<br><small>${row.payment_method || ""}</small></td>
      <td><select data-order-status="${row.id}">${["Nieuw","In behandeling","Verzonden","Afgerond","Geannuleerd"].map((s) => `<option ${row.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></td>
      <td><button class="button button-secondary" data-save-order="${row.id}">Opslaan</button> <a class="button button-secondary" href="/orders/${row.id}">Details</a></td>
    </tr>
  `).join("");
  document.querySelectorAll("[data-save-order]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.saveOrder;
      const status = document.querySelector(`[data-order-status="${id}"]`).value;
      await api(`/api/orders/${id}`, { method: "PUT", body: JSON.stringify({ status }) });
      loadOrders(document.getElementById("search")?.value || "");
    });
  });
}

async function loadContact(q = "") {
  const rows = await api(`/api/contact?q=${encodeURIComponent(q)}`);
  document.getElementById("contactTable").innerHTML = rows.map((row) => `
    <tr><td>${row.name || "-"}</td><td>${row.email || "-"}</td><td>${row.subject || row.message_type || "-"}</td><td>${row.message_body || "-"}</td><td>${row.status || "-"}</td></tr>
  `).join("");
}

async function loadNewsletter(q = "") {
  const rows = await api(`/api/newsletter?q=${encodeURIComponent(q)}`);
  document.getElementById("newsletterTable").innerHTML = rows.map((row) => `
    <tr><td>${row.email || "-"}</td><td>${row.name || "-"}</td><td>${row.event_type || "-"}</td><td>${row.created_at || ""}</td></tr>
  `).join("");
}

async function loadSocial() {
  const status = document.getElementById("socialStatus")?.value || "all";
  const rows = await api(`/api/social/posts/${status}`);
  document.getElementById("socialPosts").innerHTML = rows.map((post) => `
    <article class="post-card">
      <p class="post-meta">${post.date} · ${post.category} · ${post.status}</p>
      <h3>${post.theme}</h3>
      <p class="post-body">${post.instagram?.shortCaption || ""}\n\n${post.instagram?.caption || ""}</p>
      <div class="toolbar">
        <button class="button button-primary" data-social-action="approve" data-id="${post.id}">Goedkeuren</button>
        <button class="button button-secondary" data-social-action="schedule" data-id="${post.id}">Plannen</button>
        <button class="button button-danger" data-social-action="reject" data-id="${post.id}">Afkeuren</button>
        <button class="button button-secondary" data-social-action="published" data-id="${post.id}">Gepubliceerd</button>
      </div>
    </article>
  `).join("");
  document.querySelectorAll("[data-social-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.socialAction;
      const id = button.dataset.id;
      const payload = action === "schedule" ? { scheduledAt: prompt("Planmoment ISO datum/tijd", new Date().toISOString()) } : {};
      await api(`/api/social/post/${id}/${action}`, { method: "POST", body: JSON.stringify(payload) });
      loadSocial();
    });
  });
}

async function loadAssets() {
  const rows = await api("/api/assets");
  document.getElementById("assetGrid").innerHTML = rows.map((asset) => `
    <article class="asset-card">
      ${asset.mime_type?.startsWith("video") ? `<video src="${asset.url}" controls></video>` : `<img src="${asset.url}" alt="${asset.original_name}">`}
      <h3>${asset.original_name}</h3>
      <p>${asset.category} · ${Math.round((asset.size || 0) / 1024)} KB</p>
      <button class="button button-danger" data-delete-asset="${asset.id}">Verwijderen</button>
    </article>
  `).join("");
  document.querySelectorAll("[data-delete-asset]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/assets/${button.dataset.deleteAsset}`, { method: "DELETE" });
      loadAssets();
    });
  });
}

async function loadAudit() {
  const rows = await api("/api/audit-log");
  document.getElementById("auditTable").innerHTML = rows.map((row) => `
    <tr><td>${row.created_at}</td><td>${row.entity_type}</td><td>${row.action}</td><td>${row.by_user || "-"}</td><td>${row.reason || row.entity_id || ""}</td></tr>
  `).join("");
}

async function loadSettings() {
  const data = await api("/api/settings");
  const form = document.getElementById("settingsForm");
  form.innerHTML = Object.entries(data).map(([key, value]) => `
    <label>${key}<input name="${key}" value="${value}"></label>
  `).join("");
}

function initPage() {
  initNav();
  const page = document.body.dataset.page;
  if (page === "dashboard") loadDashboard();
  if (page === "orders") { loadOrders(); bindSearch(loadOrders); }
  if (page === "customers") { loadCustomers(); bindSearch(loadCustomers); }
  if (page === "order-detail") loadOrderDetail();
  if (page === "contact") { loadContact(); bindSearch(loadContact); }
  if (page === "newsletter") { loadNewsletter(); bindSearch(loadNewsletter); }
  if (page === "audit") loadAudit();
  if (page === "settings") {
    loadSettings();
    document.getElementById("saveSettings").addEventListener("click", async () => {
      const payload = Object.fromEntries(new FormData(document.getElementById("settingsForm")).entries());
      await api("/api/settings", { method: "PUT", body: JSON.stringify(payload) });
      loadSettings();
    });
  }
  if (page === "social") {
    loadSocial();
    document.getElementById("socialStatus").addEventListener("change", loadSocial);
    document.getElementById("generateDaily").addEventListener("click", async () => { await api("/api/social/generate/daily", { method: "POST", body: "{}" }); loadSocial(); });
    document.getElementById("generateWeek").addEventListener("click", async () => { await api("/api/social/generate/week", { method: "POST", body: "{}" }); loadSocial(); });
  }
  if (page === "assets") {
    loadAssets();
    document.getElementById("uploadForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!csrfToken) csrfToken = (await fetch("/api/studio/csrf").then((response) => response.json())).csrfToken;
      const response = await fetch("/api/assets/upload", { method: "POST", headers: { "X-CSRF-Token": csrfToken }, body: new FormData(event.currentTarget) });
      if (!response.ok) alert(await response.text());
      event.currentTarget.reset();
      loadAssets();
    });
  }
}

document.addEventListener("DOMContentLoaded", initPage);
