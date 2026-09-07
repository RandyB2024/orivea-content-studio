const navItems = [
  ["Vandaag", "/dashboard"],
  ["Content", "/content"],
  ["Kennisbank", "/knowledge"],
  ["Nieuwe post", "/posts/new"],
  ["Kalender", "/calendar"],
  ["Campagnes", "/campaigns"],
  ["Publicaties", "/history"],
  ["Integraties", "/settings/integrations"],
  ["Orders", "/orders"],
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
        ${navItems.map(([label, href]) => `<a class="${current === href ? "active" : ""}" href="${href}">${label}</a>`).join("")}
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
  const data = await api("/api/studio/summary");
  document.getElementById("summaryCards").innerHTML = [
    ["Content", data.content],
    ["Ongebruikt", data.unused],
    ["Rechten controleren", data.unknownRights],
    ["Gepland", data.scheduled],
    ["Actie vereist", data.failed]
  ].map(([label, value]) => `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`).join("");
  if (data.warning) {
    document.getElementById("summaryCards").insertAdjacentHTML("afterend", `<section class="panel notice"><p>${data.warning}</p></section>`);
  }
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
      <td><button class="button button-secondary" data-save-order="${row.id}">Opslaan</button></td>
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
