// Etapa 4: cuentas, usuarios y respaldo. Los permisos se verifican también en la API.
export function createAdministration({ api, toast, getSession, onAuthError, navigate, onChangePassword }) {
  const $ = (id) => document.getElementById(id);
  const currency = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
  const cash = (n) => currency.format(Number(n) || 0);
  const state = { user: null, epoch: 0, reportRequest: 0, usersRequest: 0, users: [], tab: "overview", busy: false, pending: null, target: null, mode: "create", backupBusy: false, backupFile: null };
  const current = (epoch, token) => epoch === state.epoch && getSession()?.token === token && state.user?.role === "Admin";
  const allowed = () => state.user?.role === "Admin" && getSession()?.user?.role === "Admin";
  const node = (tag, text, className) => {
    const item = document.createElement(tag);
    if (text != null) item.textContent = String(text);
    if (className) item.className = className;
    return item;
  };
  function error(id, message = "") { $(id).textContent = message; $(id).hidden = !message; }
  function today() {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const part = (kind) => parts.find((p) => p.type === kind).value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  }
  const shortDate = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso;
  function operation() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return Array.from(crypto.getRandomValues(new Uint8Array(24)), (n) => n.toString(16).padStart(2, "0")).join("");
  }

  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = new URL("../css/admin.css", import.meta.url).href;
  document.head.append(stylesheet);
  const nav = document.querySelector(".main-nav .accounts-nav");
  nav.id = "nav-accounts";
  nav.disabled = false;
  nav.hidden = true;
  nav.removeAttribute("title");
  nav.querySelector("small")?.remove();
  const view = node("section");
  view.id = "accounts-view";
  view.hidden = true;
  // Solo se inserta HTML fijo. Nombres, importes y datos del servidor usan textContent.
  view.innerHTML = `
    <div class="page-heading"><div><div class="heading-kicker"><span class="tiny-square"></span> TU NEGOCIO, EN NÚMEROS</div><h1>Cuentas<span class="heading-dot">.</span></h1><p>Conoce tus resultados y administra tu equipo.</p></div><span class="admin-access">Solo administrador</span></div>
    <div id="accounts-tabs" class="admin-tabs" role="tablist" aria-label="Administración"><button id="admin-tab-overview" data-admin-tab="overview" role="tab" aria-controls="admin-panel-overview" aria-selected="true" type="button">Resumen</button><button id="admin-tab-users" data-admin-tab="users" role="tab" aria-controls="admin-panel-users" aria-selected="false" tabindex="-1" type="button">Usuarios</button><button id="admin-tab-backup" data-admin-tab="backup" role="tab" aria-controls="admin-panel-backup" aria-selected="false" tabindex="-1" type="button">Respaldo</button></div>
    <section id="admin-panel-overview" role="tabpanel" aria-labelledby="admin-tab-overview">
      <div id="accounts-periods" class="admin-periods"></div>
      <section class="pos-card admin-range"><div class="admin-presets"><button type="button" data-account-period="today">Hoy</button><button type="button" data-account-period="week">Esta semana</button><button type="button" data-account-period="month">Este mes</button></div><form id="accounts-filters" class="sales-filters"><div><label for="accounts-from">Desde</label><input id="accounts-from" class="pos-input" type="date" required></div><div><label for="accounts-to">Hasta</label><input id="accounts-to" class="pos-input" type="date" required></div><button id="accounts-apply" class="button button-primary" type="submit">Ver cuentas</button><button id="accounts-refresh" class="button button-secondary" type="button">Actualizar</button></form><p id="accounts-status" class="pos-hint" role="status" aria-live="polite"></p><p id="accounts-error" class="pos-error" role="alert" hidden></p></section>
      <div id="accounts-results" hidden><div id="accounts-metrics" class="admin-metrics"></div><p id="accounts-profit-note" class="admin-note"></p><p id="accounts-warning" class="pos-notice" hidden></p><section class="pos-card admin-chart-card"><h2>Ventas por día</h2><div id="accounts-chart"></div></section><div class="admin-breakdowns"><section class="pos-card"><h2>Por vendedor</h2><div id="accounts-sellers"></div></section><section class="pos-card"><h2>Por medio de pago</h2><div id="accounts-payments"></div></section><section class="pos-card admin-products"><h2>Productos más vendidos</h2><div id="accounts-products"></div></section></div></div>
    </section>
    <section id="admin-panel-users" role="tabpanel" aria-labelledby="admin-tab-users" hidden><section class="pos-card"><div class="admin-section-heading"><div><h2>Tu equipo</h2><p class="pos-hint">Cada persona ingresa con su usuario y su propia clave.</p></div><button id="users-my-password" class="button button-secondary" type="button">Cambiar mi clave</button><button id="users-create" class="button button-primary" type="button">Nuevo usuario</button></div><p class="admin-note">El vendedor vende y consulta sus propias ventas. El administrador también gestiona productos, cuentas, usuarios y respaldos.</p><p id="users-status" class="pos-hint" role="status" aria-live="polite"></p><p id="users-error" class="pos-error" role="alert" hidden></p><div class="sales-table-wrap"><table class="sales-table admin-users-table"><thead><tr><th>Persona / Usuario</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead><tbody id="users-list"></tbody></table></div><button id="users-refresh" class="button button-secondary" type="button">Actualizar usuarios</button></section></section>
    <section id="admin-panel-backup" role="tabpanel" aria-labelledby="admin-tab-backup" hidden><section class="pos-card admin-backup"><span class="admin-backup-icon" aria-hidden="true">↓</span><h2>Una copia de tus datos</h2><p>Descarga productos con sus fotos y costos, ventas, detalle, clientes y la lista de usuarios.</p><p class="admin-note">El respaldo no incluye contraseñas. Conserva el archivo en un lugar privado: contiene información de tu negocio y de tus clientes.</p><button id="backup-download" class="button button-primary" type="button">Descargar respaldo JSON</button><button id="backup-share" class="button button-secondary" type="button" disabled>Compartir copia</button><p id="backup-status" class="pos-hint" role="status" aria-live="polite"></p><p id="backup-error" class="pos-error" role="alert" hidden></p></section></section>`;
  $("main-content").append(view);
  const dialog = node("dialog", null, "pos-dialog admin-dialog");
  dialog.id = "user-dialog";
  dialog.setAttribute("aria-labelledby", "user-dialog-title");
  dialog.innerHTML = `<div class="pos-dialog-head"><h2 id="user-dialog-title">Nuevo usuario</h2><button id="user-close" class="icon-button" type="button" aria-label="Cerrar usuario">✕</button></div><p id="user-dialog-note" class="pos-hint"></p><form id="user-form"><fieldset id="user-fields" class="pos-fields"><legend class="sr-only">Datos del usuario</legend><div id="user-name-field"><label for="user-name">Nombre de la persona</label><input id="user-name" class="pos-input" maxlength="120" autocomplete="name" required></div><div id="user-username-field"><label for="user-username">Usuario para ingresar</label><input id="user-username" class="pos-input" minlength="3" maxlength="80" pattern="[A-Za-z0-9][A-Za-z0-9._\\-]{2,79}" autocomplete="off" autocapitalize="none" spellcheck="false" required><p class="pos-hint">Usa letras sin espacios, números, punto, guion o guion bajo.</p></div><div id="user-role-field"><label for="user-role">Permisos</label><select id="user-role" class="pos-input"><option value="Vendedor">Vendedor</option><option value="Admin">Administrador</option></select></div><div id="user-active-field" class="admin-checkbox"><label for="user-active"><input id="user-active" type="checkbox"> Cuenta activa</label></div><div id="user-password-field"><label for="user-password">Clave temporal</label><input id="user-password" class="pos-input" type="password" minlength="12" maxlength="128" autocomplete="new-password" required><p class="pos-hint">Entre 12 y 128 caracteres. Puedes usar una frase; esta persona deberá cambiarla al ingresar.</p></div></fieldset><p id="user-error" class="pos-error" role="alert" hidden></p><button id="user-save" class="button button-primary pos-wide" type="submit">Crear usuario</button></form>`;
  const confirm = node("dialog", null, "pos-dialog admin-dialog");
  confirm.id = "user-confirm-dialog";
  confirm.setAttribute("aria-labelledby", "user-confirm-title");
  confirm.innerHTML = `<div class="pos-dialog-head"><h2 id="user-confirm-title">Desactivar usuario</h2></div><p id="user-confirm-description"></p><div class="admin-confirm-actions"><button id="user-confirm-cancel" class="button button-secondary" type="button">Volver</button><button id="user-confirm-save" class="button inventory-danger" type="button">Desactivar cuenta</button></div>`;
  document.body.append(dialog, confirm);
  let confirmPayload = null;

  function showTab(tab, load = true) {
    if (!allowed()) return;
    state.tab = tab;
    for (const button of $("accounts-tabs").querySelectorAll("[data-admin-tab]")) {
      const active = button.dataset.adminTab === tab;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
      $(`admin-panel-${button.dataset.adminTab}`).hidden = !active;
    }
    if (load && tab === "overview") void loadReport();
    if (load && tab === "users") void loadUsers();
  }
  function preset(period, load = true) {
    const end = today();
    let from = end;
    if (period === "month") from = end.slice(0, 8) + "01";
    if (period === "week") {
      const day = new Date(end + "T00:00:00Z");
      day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
      from = day.toISOString().slice(0, 10);
    }
    $("accounts-from").value = from; $("accounts-to").value = end;
    if (load) void loadReport();
  }
  function table(container, labels, values) {
    const root = $(container); root.replaceChildren();
    if (!values.length) { root.append(node("p", "No hay ventas en este período.", "admin-empty")); return; }
    const table = node("table", null, "sales-table"), heading = node("tr"), head = node("thead"), body = node("tbody");
    labels.forEach((label) => heading.append(node("th", label))); head.append(heading);
    for (const row of values) { const tr = node("tr"); row.forEach((cell) => tr.append(node("td", cell))); body.append(tr); }
    table.append(head, body); root.append(table);
  }
  function change(total, previous, percent) {
    if (!previous) return total ? "Sin ventas en el período anterior" : "Sin cambios";
    const difference = percent ?? ((total - previous) / previous * 100);
    return `${difference > 0 ? "+" : ""}${Number(difference).toFixed(1)} % frente al período anterior`;
  }
  function renderChart(days) {
    const container = $("accounts-chart"); container.replaceChildren();
    if (!days.some((day) => day.count > 0)) { container.append(node("p", "Tu gráfico aparecerá cuando haya ventas en estas fechas.", "admin-empty")); return; }
    const make = (tag) => document.createElementNS("http://www.w3.org/2000/svg", tag);
    const svg = make("svg"), title = make("title");
    svg.setAttribute("viewBox", "0 0 1000 200"); svg.setAttribute("role", "img");
    title.textContent = `Ventas diarias de ${shortDate(days[0].date)} a ${shortDate(days.at(-1).date)}. Los importes también están en la tabla de datos.`;
    svg.append(title); svg.classList.add("admin-chart");
    const max = Math.max(1, ...days.map((day) => day.total)), step = 1000 / days.length;
    for (const [i, day] of days.entries()) {
      const bar = make("rect"), label = make("title"), height = day.total / max * 180;
      bar.setAttribute("x", String(i * step + step * 0.1)); bar.setAttribute("y", String(190 - height));
      bar.setAttribute("width", String(Math.max(0.5, step * 0.8))); bar.setAttribute("height", String(height)); bar.setAttribute("rx", String(Math.min(4, step / 5)));
      label.textContent = `${shortDate(day.date)}: ${cash(day.total)}, ${day.count} ventas`; bar.append(label); svg.append(bar);
    }
    container.append(svg);
    const axis = node("div", null, "admin-chart-axis"); axis.append(node("span", shortDate(days[0].date)), node("span", `Máximo diario: ${cash(max)}`), node("span", shortDate(days.at(-1).date))); container.append(axis);
    const details = node("details"), summary = node("summary", "Ver datos del gráfico");
    const detailTable = node("table", null, "sales-table"), head = node("thead"), headings = node("tr"), body = node("tbody");
    ["Fecha", "Ventas", "Importe"].forEach((label) => headings.append(node("th", label))); head.append(headings);
    for (const day of days) { const row = node("tr"); [shortDate(day.date), day.count, cash(day.total)].forEach((value) => row.append(node("td", value))); body.append(row); }
    detailTable.append(head, body); details.append(summary, detailTable); container.append(details);
  }
  function renderReport(data) {
    if (!data?.current || !data.previous || !data.periods || !Array.isArray(data.daily)) throw new Error("No se pudo leer el resumen de cuentas.");
    const periods = $("accounts-periods"); periods.replaceChildren();
    for (const [key, label] of [["today", "Hoy"], ["week", "Esta semana"], ["month", "Este mes"]]) {
      const p = data.periods[key];
      if (!p) continue;
      const card = node("section", null, "admin-period");
      card.append(node("span", label), node("strong", cash(p.total)), node("small", change(p.total, p.previousTotal, p.changePercent)));
      periods.append(card);
    }
    const metrics = $("accounts-metrics"); metrics.replaceChildren();
    for (const [label, value, detail] of [
      ["Ventas del período", cash(data.current.total), change(data.current.total, data.previous.total)],
      ["Número de ventas", data.current.count, `Antes: ${data.previous.count}`],
      ["Ticket promedio", cash(data.current.average), `Antes: ${cash(data.previous.average)}`],
      ["Utilidad bruta conocida", data.current.profit == null ? "Sin costo registrado" : cash(data.current.profit), "Ingresos menos costo de compra conocido"],
    ]) { const card = node("section", null, "admin-metric"); card.append(node("span", label), node("strong", value), node("small", detail)); metrics.append(card); }
    const p = data.current;
    $("accounts-profit-note").textContent = p.unknownLines > 0
      ? `La utilidad es parcial: ${p.unknownLines} ${p.unknownLines === 1 ? "línea de venta no tiene" : "líneas de venta no tienen"} costo guardado. Ingresos sin costo conocido: ${cash(p.unknownRevenue)}. Cobertura de costo: ${p.costCoverage == null ? "sin ingresos" : Number(p.costCoverage).toFixed(1) + " %"}.`
      : p.profit == null ? "No hay ventas con costo registrado en estas fechas." : "Utilidad bruta calculada con los costos guardados al vender y los descuentos aplicados. No descuenta gastos del negocio.";
    const warnings = data.warnings || {};
    $("accounts-warning").hidden = !(warnings.invalidDates || warnings.invalidDetails);
    $("accounts-warning").textContent = `Hay datos antiguos para revisar: ${warnings.invalidDates || 0} fechas y ${warnings.invalidDetails || 0} detalles incompletos. La utilidad puede estar incompleta.`;
    $("accounts-status").textContent = `${shortDate(data.from)}–${shortDate(data.to)} · Comparación: ${shortDate(data.previous.from)}–${shortDate(data.previous.to)} · Hora de Lima`;
    renderChart(data.daily);
    table("accounts-sellers", ["Vendedor", "Ventas", "Importe"], (data.sellers || []).map((s) => [s.name, s.count, cash(s.total)]));
    table("accounts-payments", ["Medio", "Ventas", "Importe"], (data.payments || []).map((p) => [p.method, p.count, cash(p.total)]));
    table("accounts-products", ["Producto", "Unidades", "Importe"], (data.products || []).map((p) => [p.name, p.quantity, cash(p.total)]));
    $("accounts-results").hidden = false;
  }
  async function loadReport() {
    if (!allowed()) return;
    const from = $("accounts-from").value, to = $("accounts-to").value;
    if (!from || !to || from > to) { error("accounts-error", "Elige fechas válidas: Desde debe ser anterior o igual a Hasta."); return; }
    const epoch = state.epoch, token = getSession().token, request = ++state.reportRequest;
    error("accounts-error"); $("accounts-results").hidden = true; $("accounts-periods").replaceChildren();
    $("accounts-status").textContent = "Preparando tus cuentas…"; $("accounts-filters").setAttribute("aria-busy", "true");
    $("accounts-apply").disabled = $("accounts-refresh").disabled = true;
    try { const data = await api("reports.summary", { from, to }, token); if (current(epoch, token) && request === state.reportRequest) renderReport(data); }
    catch (e) { if (current(epoch, token) && request === state.reportRequest && !onAuthError(e)) { error("accounts-error", e.message); $("accounts-status").textContent = "No se pudieron cargar las cuentas. Puedes volver a intentar."; } }
    finally { if (current(epoch, token) && request === state.reportRequest) { $("accounts-apply").disabled = $("accounts-refresh").disabled = false; $("accounts-filters").setAttribute("aria-busy", "false"); } }
  }
  function renderUsers() {
    const root = $("users-list"); root.replaceChildren();
    for (const user of state.users) {
      const row = node("tr"), person = node("td"), actions = node("td");
      person.append(node("strong", user.name), node("small", user.username));
      if (user.username === state.user.username) person.append(node("small", "Tu cuenta"));
      if (user.mustChangePassword) person.append(node("small", "Debe cambiar su clave al ingresar"));
      for (const [action, label] of [["edit", "Editar"], ["password", "Restablecer clave"]]) {
        const button = node("button", label, "button button-secondary");
        button.type = "button"; button.dataset.userAction = action; button.dataset.username = user.username;
        button.disabled = user.username === state.user.username;
        if (button.disabled) button.title = "Tu propia cuenta está protegida en esta pantalla.";
        actions.append(button);
      }
      const status = node("td"), badge = node("span", user.active ? "Activo" : "Desactivado", `admin-badge${user.active ? "" : " is-inactive"}`); status.append(badge);
      row.append(person, node("td", user.role === "Admin" ? "Administrador" : "Vendedor"), status, actions); root.append(row);
    }
    $("users-status").textContent = `${state.users.length} ${state.users.length === 1 ? "usuario" : "usuarios"}. Tu propia cuenta está protegida frente a cambios en esta pantalla.`;
  }
  async function loadUsers() {
    if (!allowed()) return;
    const epoch = state.epoch, token = getSession().token, request = ++state.usersRequest;
    error("users-error"); $("users-status").textContent = "Cargando equipo…"; $("users-list").replaceChildren();
    $("users-create").disabled = $("users-refresh").disabled = true;
    try {
      const data = await api("users.list", {}, token);
      if (!current(epoch, token) || request !== state.usersRequest) return;
      if (!Array.isArray(data?.users)) throw new Error("No se pudo leer la lista de usuarios.");
      state.users = data.users; renderUsers();
    } catch (e) { if (current(epoch, token) && request === state.usersRequest && !onAuthError(e)) { error("users-error", e.message); $("users-status").textContent = "No se pudieron cargar los usuarios."; } }
    finally { if (current(epoch, token) && request === state.usersRequest) $("users-create").disabled = $("users-refresh").disabled = false; }
  }
  function closeUser() {
    if (state.busy) return;
    const uncertain = !!state.pending;
    state.pending = null; state.target = null; $("user-form").reset(); error("user-error"); dialog.close();
    if (uncertain && allowed()) { toast("Actualiza los usuarios para comprobar el resultado de la operación."); void loadUsers(); }
  }
  function userControls() {
    $("user-fields").disabled = state.busy || !!state.pending;
    $("user-save").disabled = state.busy;
    $("user-close").disabled = state.busy;
    $("user-form").setAttribute("aria-busy", String(state.busy));
    $("user-save").textContent = state.busy ? "Guardando…" : state.pending ? "Reintentar la misma operación" : state.mode === "create" ? "Crear usuario" : state.mode === "password" ? "Restablecer clave" : "Guardar cambios";
  }
  function openUser(mode, target = null) {
    if (!allowed() || (target && target.username === state.user.username)) return;
    state.mode = mode; state.target = target; state.pending = null; state.busy = false;
    $("user-form").reset(); error("user-error");
    for (const [field, visible] of [["name", mode !== "password"], ["username", mode === "create"], ["role", mode !== "password"], ["active", mode === "edit"], ["password", mode !== "edit"]]) {
      $(`user-${field}-field`).hidden = !visible; $(`user-${field}`).disabled = !visible;
    }
    $("user-name").value = target?.name || ""; $("user-username").value = target?.username || ""; $("user-role").value = target?.role || "Vendedor"; $("user-active").checked = target?.active ?? true;
    $("user-dialog-title").textContent = mode === "create" ? "Nuevo usuario" : mode === "password" ? `Restablecer clave de ${target.username}` : `Editar a ${target.username}`;
    $("user-dialog-note").textContent = mode === "edit" ? "Al guardar se cerrarán las sesiones anteriores de esta persona. Su historial de ventas se conserva." : "Entrega la clave temporal a esta persona. Deberá elegir una nueva al ingresar.";
    userControls(); if (!dialog.open) dialog.showModal(); $(mode === "password" ? "user-password" : "user-name").focus();
  }
  async function saveUser(action, payload) {
    if (!allowed() || state.busy) return;
    const epoch = state.epoch, token = getSession().token;
    state.pending = { action, payload }; state.busy = true; userControls(); error("user-error");
    try {
      const data = await api(action, payload, token);
      if (!current(epoch, token)) return;
      if (data?.user?.username !== payload.username) {
        const e = new Error("No se pudo confirmar el usuario guardado."); e.code = "INVALID_RESPONSE"; throw e;
      }
      state.pending = null; state.busy = false; $("user-password").value = ""; closeUser(); toast("Usuario guardado correctamente."); await loadUsers();
    } catch (e) {
      if (!current(epoch, token) || onAuthError(e)) return;
      const uncertain = ["TIMEOUT", "NETWORK_ERROR", "HTTP_ERROR", "INVALID_RESPONSE", "INTERNAL_ERROR", "BUSY"].includes(e.code);
      if (!uncertain) state.pending = null;
      error("user-error", uncertain ? "No se pudo confirmar la respuesta. Reintenta la misma operación para comprobarla sin duplicarla." : e.message);
    } finally { if (current(epoch, token)) { state.busy = false; userControls(); } }
  }
  function submitUser(event) {
    event.preventDefault(); if (!allowed() || state.busy) return;
    if (state.pending) { void saveUser(state.pending.action, state.pending.payload); return; }
    const mode = state.mode, target = state.target;
    const payload = { operation: operation(), username: mode === "create" ? $("user-username").value.trim().toLowerCase() : target.username };
    let action = "users.create";
    if (mode !== "password") { payload.name = $("user-name").value.trim(); payload.role = $("user-role").value; }
    if (mode !== "edit") payload.password = $("user-password").value;
    if (mode !== "create") payload.version = target.version;
    if (mode === "edit") { action = "users.update"; payload.active = $("user-active").checked; }
    if (mode === "password") action = "users.password";
    if (mode === "edit" && target.active && !payload.active) {
      confirmPayload = { action, payload };
      $("user-confirm-description").textContent = `${target.name} (${target.username}) ya no podrá ingresar. Sus ventas se conservarán. ¿Desactivar esta cuenta?`;
      confirm.showModal(); $("user-confirm-cancel").focus(); return;
    }
    void saveUser(action, payload);
  }
  async function backup() {
    if (!allowed() || state.backupBusy) return;
    const epoch = state.epoch, token = getSession().token;
    state.backupBusy = true; state.backupFile = null; $("backup-share").disabled = true; $("backup-download").disabled = true; error("backup-error"); $("backup-status").textContent = "Preparando una copia de tus datos…";
    try {
      const data = await api("backup.export", {}, token);
      if (!current(epoch, token)) return;
      if (data?.format !== "comercial-jn-backup" || !data.tables) throw new Error("El respaldo recibido no tiene un formato válido.");
      state.backupFile = new File([JSON.stringify(data, null, 2)], `COMERCIAL-JN-respaldo-${today()}.json`, { type: "application/json" });
      downloadBackup(state.backupFile); $("backup-share").disabled = false;
      $("backup-status").textContent = "Se inició la descarga. Busca el archivo COMERCIAL-JN-respaldo en Descargas y comprueba que se guardó.";
      toast("Se inició la descarga del respaldo.");
    } catch (e) { if (current(epoch, token) && !onAuthError(e)) { error("backup-error", e.message); $("backup-status").textContent = "No se pudo preparar el respaldo. Puedes volver a intentar."; } }
    finally { if (current(epoch, token)) { state.backupBusy = false; $("backup-download").disabled = false; } }
  }
  function downloadBackup(file) {
    const url = URL.createObjectURL(file), anchor = node("a");
    anchor.href = url; anchor.download = file.name; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function shareBackup() {
    if (!allowed() || !state.backupFile) return;
    const file = state.backupFile, epoch = state.epoch, token = getSession().token;
    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: "Respaldo COMERCIAL J&N" }); return; }
    } catch (e) { if (e.name === "AbortError" || !current(epoch, token)) return; }
    if (current(epoch, token)) { downloadBackup(file); toast("Se inició la descarga del respaldo."); }
  }

  nav.addEventListener("click", () => { if (allowed()) navigate("accounts"); });
  $("accounts-tabs").addEventListener("click", (event) => { const button = event.target.closest("[data-admin-tab]"); if (button) showTab(button.dataset.adminTab); });
  $("accounts-tabs").addEventListener("keydown", (event) => {
    const buttons = [...$("accounts-tabs").querySelectorAll("[data-admin-tab]")], index = buttons.indexOf(document.activeElement);
    if (index < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus(); showTab(buttons[next].dataset.adminTab);
  });
  $("accounts-filters").addEventListener("submit", (event) => { event.preventDefault(); void loadReport(); });
  $("accounts-refresh").addEventListener("click", loadReport);
  view.querySelectorAll("[data-account-period]").forEach((button) => button.addEventListener("click", () => preset(button.dataset.accountPeriod)));
  $("users-create").addEventListener("click", () => openUser("create"));
  $("users-my-password").addEventListener("click", () => { if (allowed()) onChangePassword?.(); });
  $("users-refresh").addEventListener("click", loadUsers);
  $("users-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-user-action]");
    if (!button || button.disabled) return;
    const user = state.users.find((row) => row.username === button.dataset.username);
    if (user) openUser(button.dataset.userAction, user);
  });
  $("user-form").addEventListener("submit", submitUser);
  $("user-close").addEventListener("click", closeUser);
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); closeUser(); });
  $("user-confirm-cancel").addEventListener("click", () => { confirmPayload = null; confirm.close(); });
  confirm.addEventListener("cancel", () => { confirmPayload = null; });
  $("user-confirm-save").addEventListener("click", () => { const pending = confirmPayload; confirmPayload = null; confirm.close(); if (pending) void saveUser(pending.action, pending.payload); });
  $("backup-download").addEventListener("click", backup);
  $("backup-share").addEventListener("click", shareBackup);

  return {
    start(user) {
      this.reset(); state.user = user; nav.hidden = user.role !== "Admin";
      preset("today", false); if (user.role === "Admin") showTab("overview", false);
      document.querySelector(".stage-tag").textContent = "ETAPA 4";
    },
    navigate(screen) {
      const active = screen === "accounts" && allowed(); view.hidden = !active;
      nav.classList.toggle("is-active", active); if (active) nav.setAttribute("aria-current", "page"); else nav.removeAttribute("aria-current");
      if (active) { document.title = "Comercial J&N · Cuentas"; document.querySelector(".breadcrumb strong").textContent = "Cuentas"; showTab(state.tab); }
    },
    reset() {
      state.epoch++; state.reportRequest++; state.usersRequest++; state.user = null; state.users = []; state.pending = null; state.target = null; state.busy = false; state.backupBusy = false; state.backupFile = null; confirmPayload = null;
      nav.hidden = true; nav.classList.remove("is-active"); nav.removeAttribute("aria-current"); view.hidden = true; $("accounts-results").hidden = true;
      for (const id of ["accounts-periods", "accounts-metrics", "accounts-chart", "accounts-sellers", "accounts-payments", "accounts-products", "users-list"]) $(id).replaceChildren();
      for (const id of ["accounts-status", "accounts-profit-note", "accounts-warning", "users-status", "backup-status"]) $(id).textContent = "";
      for (const id of ["accounts-error", "users-error", "backup-error", "user-error"]) error(id);
      $("accounts-filters").reset(); $("user-form").reset(); $("user-password").value = "";
      $("user-dialog-title").textContent = "Nuevo usuario"; $("user-dialog-note").textContent = ""; $("user-confirm-description").textContent = "";
      $("accounts-filters").setAttribute("aria-busy", "false"); $("accounts-warning").hidden = true;
      for (const id of ["accounts-apply", "accounts-refresh", "users-create", "users-refresh", "backup-download"]) $(id).disabled = false;
      $("backup-share").disabled = true;
      if (dialog.open) dialog.close(); if (confirm.open) confirm.close(); userControls();
    },
  };
}
