// Historial paginado. El servidor vuelve a comprobar quién puede ver cada venta.
export function createSales({
  api,
  toast,
  getSession,
  onAuthError,
  showReceipt,
  navigate,
}) {
  const $ = (id) => document.getElementById(id);
  const state = {
    user: null,
    epoch: 0,
    request: 0,
    offset: 0,
    total: 0,
    loading: false,
    rows: [],
    filters: null,
  };
  const money = (n) =>
    new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: "PEN",
    }).format(Number(n) || 0);
  const button = document.querySelectorAll(".main-nav .nav-item")[2];
  button.id = "nav-sales";
  button.disabled = false;
  button.removeAttribute("title");
  button.querySelector("small")?.remove();
  const view = document.createElement("section");
  view.id = "sales-view";
  view.hidden = true;
  view.innerHTML = `<div class="page-heading"><div><div class="heading-kicker"><span class="tiny-square"></span> CADA VENTA CUENTA</div><h1>Ventas<span class="heading-dot">.</span></h1><p>Consulta y vuelve a imprimir tus comprobantes.</p></div><button id="sales-refresh" class="button button-secondary" type="button">Actualizar</button></div><section class="pos-card"><form id="sales-filters" class="sales-filters"><div><label for="sales-from">Desde</label><input id="sales-from" class="pos-input" type="date"></div><div><label for="sales-to">Hasta</label><input id="sales-to" class="pos-input" type="date"></div><div id="sales-seller-field"><label for="sales-seller">Vendedor</label><select id="sales-seller" class="pos-input"><option value="">Todos los vendedores</option></select></div><button class="button button-primary" id="sales-apply" type="submit">Buscar ventas</button></form><p id="sales-status" class="pos-hint" role="status" aria-live="polite"></p><p id="sales-error" class="pos-error" role="alert" hidden></p><div class="sales-table-wrap"><table class="sales-table"><thead><tr><th>N.º / Fecha</th><th>Cliente</th><th>Vendedor</th><th>Pago</th><th>Total</th><th>Comprobante</th></tr></thead><tbody id="sales-list"></tbody></table></div><div class="sales-pages"><button id="sales-previous" class="button button-secondary" type="button" disabled>Anterior</button><span id="sales-page" class="pos-hint"></span><button id="sales-next" class="button button-secondary" type="button" disabled>Siguiente</button></div></section>`;
  $("main-content").append(view);
  const cell = (text) => {
    const td = document.createElement("td");
    td.textContent = String(text ?? "");
    return td;
  };
  const current = (epoch, token) =>
    state.epoch === epoch && getSession()?.token === token;
  function controls() {
    $("sales-previous").disabled = state.loading || state.offset === 0;
    $("sales-next").disabled =
      state.loading || state.offset + 40 >= state.total;
    $("sales-refresh").disabled = state.loading;
    $("sales-apply").disabled = state.loading;
    $("sales-filters").setAttribute("aria-busy", String(state.loading));
  }
  async function load(reset = false) {
    if (!state.user || !getSession()) return;
    if (reset) {
      state.offset = 0;
      state.filters = {
        from: $("sales-from").value,
        to: $("sales-to").value,
        seller: state.user.role === "Admin" ? $("sales-seller").value : "",
      };
    }
    if (!state.filters) return load(true);
    const epoch = state.epoch,
      token = getSession().token,
      request = ++state.request;
    state.loading = true;
    controls();
    $("sales-error").hidden = true;
    $("sales-status").textContent = "Cargando ventas…";
    $("sales-list").replaceChildren();
    try {
      const data = await api(
        "sales.list",
        { ...state.filters, offset: state.offset, limit: 40 },
        token,
      );
      if (!current(epoch, token) || request !== state.request) return;
      if (!Array.isArray(data?.sales) || !Number.isInteger(data.total))
        throw new Error("El historial recibido no tiene un formato válido.");
      state.rows = data.sales;
      state.total = data.total;
      if (state.user.role === "Admin") {
        const selected = state.filters.seller,
          select = $("sales-seller");
        select.replaceChildren(new Option("Todos los vendedores", ""));
        for (const seller of data.sellers || [])
          select.append(new Option(seller.label, seller.id));
        select.value = selected;
      }
      for (const sale of state.rows) {
        const tr = document.createElement("tr"),
          first = cell("");
        const number = document.createElement("strong");
        number.textContent = String(sale.nro).padStart(6, "0");
        const date = document.createElement("small");
        date.textContent = sale.fecha;
        first.append(number, date);
        const action = cell(""),
          open = document.createElement("button");
        open.type = "button";
        open.className = "button button-secondary";
        open.textContent = "Ver voucher";
        open.dataset.saleId = sale.id;
        open.setAttribute("aria-label", `Ver comprobante ${sale.nro}`);
        action.append(open);
        tr.append(
          first,
          cell(sale.cliente || "Público general"),
          cell(sale.vendedor),
          cell(sale.medio),
          cell(money(sale.total)),
          action,
        );
        $("sales-list").append(tr);
      }
      $("sales-status").textContent = state.total
        ? `${state.total} ${state.total === 1 ? "venta encontrada" : "ventas encontradas"}`
        : "No hay ventas en estas fechas.";
      $("sales-page").textContent = state.total
        ? `${state.offset + 1}–${Math.min(state.offset + 40, state.total)} de ${state.total}`
        : "";
    } catch (e) {
      if (
        current(epoch, token) &&
        request === state.request &&
        !onAuthError(e)
      ) {
        $("sales-status").textContent = "No se pudo cargar el historial.";
        $("sales-error").textContent = e.message;
        $("sales-error").hidden = false;
      }
    } finally {
      if (current(epoch, token) && request === state.request) {
        state.loading = false;
        controls();
      }
    }
  }
  button.addEventListener("click", () => navigate("sales"));
  $("sales-filters").addEventListener("submit", (event) => {
    event.preventDefault();
    void load(true);
  });
  $("sales-refresh").addEventListener("click", () => load(true));
  $("sales-next").addEventListener("click", () => {
    if (!state.loading) {
      state.offset += 40;
      void load();
    }
  });
  $("sales-previous").addEventListener("click", () => {
    if (!state.loading) {
      state.offset = Math.max(0, state.offset - 40);
      void load();
    }
  });
  $("sales-list").addEventListener("click", async (event) => {
    const open = event.target.closest("[data-sale-id]");
    if (!open || open.disabled) return;
    const epoch = state.epoch,
      token = getSession()?.token;
    open.disabled = true;
    open.textContent = "Cargando…";
    try {
      const data = await api("sales.get", { id: open.dataset.saleId }, token);
      if (current(epoch, token)) {
        if (!data?.sale?.lineas)
          throw new Error("No se pudo leer el comprobante.");
        showReceipt(data.sale, { historical: true });
      }
    } catch (e) {
      if (current(epoch, token) && !onAuthError(e)) toast(e.message, true);
    } finally {
      if (open.isConnected && current(epoch, token)) {
        open.disabled = false;
        open.textContent = "Ver voucher";
      }
    }
  });
  return {
    start(user) {
      state.epoch++;
      state.user = user;
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Lima",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());
      const get = (name) => parts.find((p) => p.type === name).value;
      $("sales-from").value = `${get("year")}-${get("month")}-01`;
      $("sales-to").value = `${get("year")}-${get("month")}-${get("day")}`;
      $("sales-seller-field").hidden = user.role !== "Admin";
      state.filters = null;
    },
    navigate(screen) {
      const active = screen === "sales";
      view.hidden = !active;
      button.classList.toggle("is-active", active);
      if (active) {
        button.setAttribute("aria-current", "page");
        void load(true);
      } else button.removeAttribute("aria-current");
    },
    reset() {
      state.epoch++;
      state.request++;
      state.user = null;
      state.rows = [];
      state.filters = null;
      state.total = state.offset = 0;
      state.loading = false;
      view.hidden = true;
      $("sales-list").replaceChildren();
      $("sales-status").textContent = "";
      $("sales-page").textContent = "";
      $("sales-error").hidden = true;
      $("sales-seller").replaceChildren(new Option("Todos los vendedores", ""));
      controls();
    },
  };
}
