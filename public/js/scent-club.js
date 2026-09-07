(() => {
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const eur = (value) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(value || 0));
  const date = (value) => value ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value.length === 10 ? `${value}T12:00:00` : value)) : "-";
  const badge = (status) => `<span class="status-badge status-${esc(status)}">${esc(status).replace("payment_failed", "betaling mislukt")}</span>`;
  const empty = (text) => `<p class="empty-state">${text}</p>`;
  let timer;
  const query = (ids) => new URLSearchParams(Object.fromEntries(ids.map(([key, id]) => [key, document.getElementById(id)?.value || ""]).filter(([, value]) => value))).toString();
  const bindFilters = (ids, loader) => ids.forEach(([, id]) => document.getElementById(id)?.addEventListener(id === "scentSearch" ? "input" : "change", () => { clearTimeout(timer); timer = setTimeout(loader, 180); }));

  async function overview() {
    const data = await api("/api/scent-club/summary");
    document.getElementById("scentMetrics").innerHTML = [["Actieve leden",data.active],["Nieuwe aanvragen",data.newRequests],["Deze maand gestart",data.startedThisMonth],["Gepauzeerd",data.paused],["Opgezegd",data.cancelled],["Actie vereist",data.actionRequired]].map(([label,value])=>`<article class="metric"><span>${label}</span><strong>${value}</strong></article>`).join("");
    document.getElementById("recentRequests").innerHTML = data.recentRequests.map(row=>`<a class="compact-row" href="/scent-club/requests"><span><strong>${esc(row.first_name)} ${esc(row.last_name)}</strong><small>${esc(row.plan)} · ${date(row.created_at)}</small></span>${badge(row.status)}</a>`).join("") || empty("Nog geen aanvragen.");
    document.getElementById("recentEvents").innerHTML = data.recentEvents.map(row=>`<div class="compact-row"><span><strong>${esc(row.description)}</strong><small>${date(row.created_at)} · ${esc(row.by_user || "systeem")}</small></span></div>`).join("") || empty("Nog geen wijzigingen.");
    document.getElementById("upcomingSelections").innerHTML = data.upcomingSelections.map(row=>`<a class="compact-row" href="/scent-club/members/${row.id}"><span><strong>${esc(row.first_name)} ${esc(row.last_name)}</strong><small>${esc(row.plan)} · deadline ${date(row.deadline)}</small></span><span>${esc(row.fragrance_reference || "Nog open")}</span></a>`).join("") || empty("Geen actieve maandkeuzes.");
  }

  async function requests() {
    const ids = [["q","scentSearch"],["plan","requestPlan"],["status","requestStatus"]];
    const rows = await api(`/api/scent-club/requests?${query(ids)}`);
    document.getElementById("requestsTable").innerHTML = rows.map(row=>`<tr><td data-label="Datum">${date(row.created_at)}</td><td data-label="Klant"><strong>${esc(row.first_name)} ${esc(row.last_name)}</strong><br><small>${esc(row.email)}<br>${esc(row.phone || "")}</small></td><td data-label="Abonnement">${esc(row.plan)}<br><small>${eur(row.monthly_price)} p/m</small></td><td data-label="Voorkeur">${esc(row.preference_gender)} · ${esc(row.preference_family)}<br><small>${esc(row.selection_mode)}</small></td><td data-label="Status">${badge(row.status)}<br><small>${date(row.last_action_at)}</small></td><td data-label="Acties"><div class="row-actions"><button data-view-request="${row.id}">Bekijken</button>${row.status==="new"?`<button data-request-status="contacted" data-id="${row.id}">Benaderd</button>`:""}${!["approved","converted","declined"].includes(row.status)?`<button data-request-status="approved" data-id="${row.id}">Goedkeuren</button>`:""}${!["declined","converted"].includes(row.status)?`<button data-request-status="declined" data-id="${row.id}">Afwijzen</button>`:""}${row.status!=="converted"&&row.status!=="declined"?`<button class="primary-action" data-convert-request="${row.id}">Actief lid</button>`:""}</div></td></tr>`).join("") || `<tr><td colspan="6">Geen aanvragen gevonden.</td></tr>`;
    document.querySelectorAll("[data-request-status]").forEach(button=>button.onclick=async()=>{await api(`/api/scent-club/requests/${button.dataset.id}/status`,{method:"POST",body:JSON.stringify({status:button.dataset.requestStatus})});requests();});
    document.querySelectorAll("[data-convert-request]").forEach(button=>button.onclick=async()=>{if(!confirm("Deze aanvraag omzetten naar een actief lid?"))return;const result=await api(`/api/scent-club/requests/${button.dataset.convertRequest}/convert`,{method:"POST",body:"{}"});location.href=`/scent-club/members/${result.id}`;});
    document.querySelectorAll("[data-view-request]").forEach(button=>button.onclick=()=>showRequest(button.dataset.viewRequest));
    if (!requests.bound) { bindFilters(ids, requests); requests.bound = true; }
  }
  async function showRequest(id) {
    const row=await api(`/api/scent-club/requests/${id}`); const dialog=document.getElementById("requestDialog");
    document.getElementById("requestDetail").innerHTML=`<p class="eyebrow">Aanvraag ${row.id}</p><h2>${esc(row.first_name)} ${esc(row.last_name)}</h2><dl class="detail-list"><dt>E-mail</dt><dd>${esc(row.email)}</dd><dt>Telefoon</dt><dd>${esc(row.phone||"-")}</dd><dt>Abonnement</dt><dd>${esc(row.plan)} · ${eur(row.monthly_price)}</dd><dt>Geurprofiel</dt><dd>${esc(row.preference_gender)} · ${esc(row.preference_family)}</dd><dt>Keuzevorm</dt><dd>${esc(row.selection_mode)}</dd><dt>Opmerkingen</dt><dd>${esc(row.notes||"-")}</dd><dt>Status</dt><dd>${badge(row.status)}</dd></dl>`; dialog.showModal();
  }

  async function members() {
    const ids=[["q","scentSearch"],["plan","memberPlan"],["status","memberStatus"],["preference","memberPreference"],["startMonth","memberStartMonth"]];
    const rows=await api(`/api/scent-club/members?${query(ids)}`);
    document.getElementById("membersTable").innerHTML=rows.map(row=>`<tr><td data-label="Klant"><a href="/scent-club/members/${row.id}"><strong>${esc(row.first_name)} ${esc(row.last_name)}</strong></a><br><small>${esc(row.email)}<br>${esc(row.phone||"")}</small></td><td data-label="Abonnement">${esc(row.plan)}<br><small>${eur(row.monthly_price)} p/m</small></td><td data-label="Status">${badge(row.status)}</td><td data-label="Start / verlenging">${date(row.started_at)}<br><small>${date(row.next_billing_date)}</small></td><td data-label="Geurprofiel">${esc(row.preference_gender)} · ${esc(row.preference_family)}<br><small>${esc(row.selection_mode)}</small></td><td data-label="Maandkeuze">${esc(row.current_selection||"Nog open")}</td><td data-label="Betaling">${esc(row.payment_status||"Niet bekend")}<br><small>${date(row.last_payment_at)}</small></td></tr>`).join("")||`<tr><td colspan="7">Geen leden gevonden.</td></tr>`;
    if(!members.bound){bindFilters(ids,members);members.bound=true;}
  }

  async function memberDetail() {
    const id=location.pathname.split("/").pop(); const row=await api(`/api/scent-club/members/${id}`); document.getElementById("memberTitle").textContent=`${row.first_name} ${row.last_name}`;
    const selections=row.selections.map(item=>`<div class="compact-row"><span><strong>${esc(item.month)}</strong><small>${esc(item.fragrance_reference||"Nog open")} · deadline ${date(item.deadline)}</small></span>${badge(item.status)}</div>`).join("")||empty("Nog geen maandkeuzes.");
    const events=row.events.map(item=>`<div class="compact-row"><span><strong>${esc(item.description)}</strong><small>${date(item.created_at)} · ${esc(item.by_user||"systeem")}</small></span></div>`).join("")||empty("Nog geen historie.");
    document.getElementById("memberDetail").innerHTML=`<section class="panel"><p class="eyebrow">Klant</p><h2>${esc(row.first_name)} ${esc(row.last_name)}</h2><p>${esc(row.email)}<br>${esc(row.phone||"Geen telefoonnummer")}</p></section><section class="panel"><p class="eyebrow">Abonnement</p><h2>${esc(row.plan)}</h2><p>${eur(row.monthly_price)} per maand<br>Gestart ${date(row.started_at)}<br>Volgende verlenging ${date(row.next_billing_date)}</p><label>Status<select id="memberStatusEdit">${["active","paused","cancelled","payment_failed"].map(status=>`<option ${status===row.status?"selected":""}>${status}</option>`).join("")}</select></label><button class="button button-secondary" id="saveMemberStatus">Status opslaan</button></section><section class="panel"><p class="eyebrow">Geurprofiel</p><h2>${esc(row.preference_gender)}</h2><p>${esc(row.preference_family)}<br>${esc(row.selection_mode)}</p><p>Betaling: ${esc(row.payment_status||"Niet bekend")}</p></section><section class="panel"><p class="eyebrow">Deze maand</p><h2>Geurkeuze</h2><form id="selectionForm" class="form-stack"><label>Maand<input type="month" name="month" value="${new Date().toISOString().slice(0,7)}"></label><label>Glantier referentie<input name="fragrance_reference" maxlength="50" placeholder="Bijvoorbeeld 528"></label><button class="button button-primary">Keuze vastleggen</button></form></section><section class="panel wide-panel"><p class="eyebrow">Maandkeuzes</p><div class="compact-list">${selections}</div></section><section class="panel wide-panel"><p class="eyebrow">Historie</p><div class="compact-list">${events}</div></section>`;
    document.getElementById("saveMemberStatus").onclick=async()=>{await api(`/api/scent-club/members/${id}/status`,{method:"POST",body:JSON.stringify({status:document.getElementById("memberStatusEdit").value})});memberDetail();};
    document.getElementById("selectionForm").onsubmit=async (event)=>{event.preventDefault();await api(`/api/scent-club/members/${id}/selections`,{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });memberDetail();};
  }

  document.querySelector("[data-close-dialog]")?.addEventListener("click",()=>document.getElementById("requestDialog").close());
  const page=document.body.dataset.page;
  ({"scent-club":overview,"scent-club-requests":requests,"scent-club-members":members,"scent-club-member-detail":memberDetail}[page]?.()).catch(error=>alert(error.message));
})();
