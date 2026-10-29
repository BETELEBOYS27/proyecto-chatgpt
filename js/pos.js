import { scanBarcode, stopScanner } from "./scanner.js";

// La venta pendiente se conserva por usuario para reenviar siempre la misma operación.
// El token y las contraseñas nunca se guardan junto con la orden.
export function createPos({
  api,
  toast,
  getSession,
  reload,
  onAuthError,
  safeImageUrl,
  onNewProduct,
  onProductSubmit,
  onReceipt,
  onNavigate,
}) {
  const $ = (id) => document.getElementById(id);
  const money = new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  });
  const cash = (n) => money.format(Number(n) || 0);
  const cents = (n) => Math.round(Number(n || 0) * 100);
  const normalize = (text) =>
    String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  const knownRejections = new Set([
    "VALIDATION_ERROR",
    "INSUFFICIENT_STOCK",
    "INSUFFICIENT_PAYMENT",
    "STOCK_CHANGED",
    "PRICE_CHANGED",
    "FORBIDDEN",
    "DUPLICATE_CODE",
  ]);
  const state = {
    user: null,
    products: [],
    cart: new Map(),
    ready: false,
    loading: false,
    loadError: "",
    pending: null,
    productPending: null,
    busy: false,
    productBusy: false,
    epoch: 0,
    documentTimer: null,
    lookup: 0,
    autoName: "",
    customerEdited: false,
  };

  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = new URL("../css/pos.css", import.meta.url).href;
  document.head.append(stylesheet);

  // Únicamente se inserta HTML fijo. Los datos del negocio se muestran con textContent.
  const catalog = document.createElement("section");
  catalog.id = "catalog-view";
  catalog.setAttribute("aria-label", "Catálogo de productos");
  const main = $("main-content");
  while (main.firstChild) catalog.append(main.firstChild);
  main.append(catalog);
  const view = document.createElement("section");
  view.id = "pos-view";
  view.hidden = true;
  view.innerHTML = `
    <div class="page-heading"><div><div class="heading-kicker"><span class="tiny-square"></span> TU NEGOCIO EN MOVIMIENTO</div><h1>Vender<span class="heading-dot">.</span></h1><p>Una buena atención empieza aquí.</p></div><button id="pos-refresh" class="button button-secondary" type="button">Actualizar</button></div>
    <div id="pos-pending-notice" class="pos-notice" role="status" hidden>Hay una venta por confirmar. Retoma la orden para comprobar su resultado sin duplicarla.</div>
    <div class="pos-layout">
      <section class="pos-card pos-products" aria-label="Agregar productos a la venta">
        <button id="pos-scan" class="button button-primary pos-scan" type="button"><svg class="icon"><use href="#icon-search"></use></svg><span>Escanear código</span></button>
        <p class="pos-hint">Usa la cámara o busca por nombre o código.</p>
        <label class="sr-only" for="pos-search">Buscar producto por nombre o código</label><input id="pos-search" class="pos-input" type="search" autocomplete="off" placeholder="Nombre o código del producto">
        <div id="pos-results" class="pos-hint" role="status" aria-live="polite"></div>
        <div id="pos-product-list" class="pos-product-list"></div>
        <button id="pos-add-product" class="button button-secondary pos-wide" type="button" hidden>+ Agregar producto nuevo</button>
      </section>
      <section class="pos-card pos-basket" aria-label="Carrito de la venta"><div class="pos-basket-title"><h2>Tu venta</h2><button id="pos-clear" class="button button-text" type="button">Vaciar</button></div><div id="pos-cart" class="pos-cart" aria-live="polite"></div><div class="pos-cart-footer"><div class="pos-total"><span>Subtotal</span><strong id="pos-subtotal">S/ 0.00</strong></div><button id="pos-review" class="button button-primary pos-wide" type="button" disabled>Revisar orden</button></div></section>
    </div>`;
  main.prepend(view);

  const dialogs = document.createElement("div");
  dialogs.innerHTML = `
    <dialog id="pos-checkout" class="pos-dialog" aria-labelledby="pos-order-title"><div class="pos-dialog-head"><h2 id="pos-order-title">Revisar orden</h2><button type="button" class="icon-button" data-pos-close="pos-checkout" aria-label="Cerrar revisión">✕</button></div>
      <form id="pos-checkout-form"><div id="pos-order-lines" class="pos-order-lines"></div><fieldset id="pos-order-fields" class="pos-fields"><legend class="sr-only">Datos de la venta</legend>
        <label for="pos-document">DNI o RUC <small>Opcional</small></label><input id="pos-document" class="pos-input" inputmode="numeric" maxlength="11" pattern="[0-9]{8}|[0-9]{11}" autocomplete="off" placeholder="8 dígitos de DNI u 11 de RUC"><p id="pos-document-status" class="pos-hint" role="status" aria-live="polite"></p>
        <label for="pos-customer">Cliente <small>Opcional</small></label><input id="pos-customer" class="pos-input" maxlength="120" autocomplete="off" placeholder="Nombre del cliente">
        <label for="pos-discount">Descuento en soles <small>Opcional</small></label><input id="pos-discount" class="pos-input" type="number" min="0" step="0.01" inputmode="decimal" value="0">
        <label for="pos-payment">Medio de pago</label><select id="pos-payment" class="pos-input"><option value="Efectivo">Efectivo</option><option value="Yape/Plin">Yape / Plin</option></select>
        <div id="pos-cash-fields"><label for="pos-received">Monto recibido</label><input id="pos-received" class="pos-input" type="number" min="0" max="10000000" step="0.01" inputmode="decimal" placeholder="S/ 0.00"><div class="pos-bills"><button type="button" data-bill="exact">Exacto</button><button type="button" data-bill="10">S/ 10</button><button type="button" data-bill="20">S/ 20</button><button type="button" data-bill="50">S/ 50</button><button type="button" data-bill="100">S/ 100</button><button type="button" data-bill="200">S/ 200</button></div><div class="pos-change-row"><span>Vuelto</span><strong id="pos-change">S/ 0.00</strong></div></div>
      </fieldset><div class="pos-total pos-final-total"><span>Total a cobrar</span><strong id="pos-order-total">S/ 0.00</strong></div><p id="pos-checkout-error" class="pos-error" role="alert" hidden></p><button id="pos-complete" class="button button-primary pos-wide" type="submit">Completar venta</button><p class="pos-hint">Confirma que recibiste el efectivo o verificaste el abono en Yape/Plin.</p></form>
    </dialog>
    <dialog id="pos-receipt" class="pos-dialog" aria-labelledby="pos-success-title"><div class="pos-dialog-head"><h2 id="pos-success-title">¡Venta registrada!</h2></div><div class="pos-success-mark" aria-hidden="true">✓</div><p class="pos-hint">COMERCIAL J&N · RUC 10276754128</p><h3 id="pos-sale-number"></h3><p id="pos-sale-date" class="pos-hint"></p><div id="pos-sale-lines" class="pos-order-lines"></div><dl id="pos-sale-summary" class="pos-sale-summary"></dl><button id="pos-new-sale" class="button button-primary pos-wide" type="button">Nueva venta</button></dialog>
    <dialog id="pos-product-dialog" class="pos-dialog" aria-labelledby="pos-product-title"><div class="pos-dialog-head"><h2 id="pos-product-title">Agregar producto</h2><button type="button" class="icon-button" data-pos-close="pos-product-dialog" aria-label="Cerrar nuevo producto">✕</button></div><form id="pos-product-form"><fieldset id="pos-product-fields" class="pos-fields"><legend class="sr-only">Datos del nuevo producto</legend>
      <label for="pos-product-code">Código del producto</label><div class="pos-code-row"><input id="pos-product-code" class="pos-input" maxlength="100" autocomplete="off" required><button id="pos-product-scan" class="button button-secondary" type="button">Escanear</button></div><label for="pos-product-name">Nombre</label><input id="pos-product-name" class="pos-input" maxlength="120" required><div class="pos-form-grid"><div><label for="pos-product-price">Precio de venta (S/)</label><input id="pos-product-price" class="pos-input" type="number" min="0" max="10000000" step="0.01" inputmode="decimal" required></div><div><label for="pos-product-stock">Stock inicial</label><input id="pos-product-stock" class="pos-input" type="number" min="0" max="1000000" step="1" inputmode="numeric" required></div></div></fieldset><p id="pos-product-error" class="pos-error" role="alert" hidden></p><button id="pos-product-save" class="button button-primary pos-wide" type="submit">Guardar producto</button></form></dialog>`;
  document.body.append(dialogs);

  const nav = document.querySelectorAll(".main-nav .nav-item");
  const sellButton = nav[0],
    productsButton = nav[1];
  sellButton.id = "nav-sell";
  sellButton.disabled = false;
  sellButton.removeAttribute("title");
  sellButton.querySelector("small")?.remove();
  productsButton.id = "nav-products";
  const newProduct = document.createElement("button");
  newProduct.id = "pos-new-product";
  newProduct.type = "button";
  newProduct.className = "button button-secondary";
  newProduct.textContent = "+ Agregar producto";
  newProduct.hidden = true;
  const actions = document.createElement("div");
  actions.className = "pos-catalog-actions";
  $("refresh-button").before(actions);
  actions.append(newProduct, $("refresh-button"));
  document.querySelector(".stage-note strong").textContent =
    "Tu punto de venta, a la mano";
  document.querySelector(".stage-note p").textContent =
    "Escanea, revisa tu orden y registra el cobro desde Vender.";
  document.querySelector(".stage-tag").textContent = onNewProduct
    ? "ETAPA 3"
    : "ETAPA 2";
  document.querySelector(".read-only-label").lastChild.textContent =
    " Consulta de productos";

  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "icon");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#icon-${name}`);
    svg.append(use);
    return svg;
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }
  function error(id, message = "") {
    $(id).textContent = message;
    $(id).hidden = !message;
  }
  function session() {
    return getSession();
  }
  function current(epoch, token) {
    return epoch === state.epoch && session()?.token === token;
  }
  function key(kind) {
    return `jn_pos_${kind}_${encodeURIComponent(state.user.username)}`;
  }
  function store(kind, value) {
    try {
      if (value == null) sessionStorage.removeItem(key(kind));
      else sessionStorage.setItem(key(kind), JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }
  function restore(kind) {
    try {
      const data = JSON.parse(sessionStorage.getItem(key(kind)));
      return data?.payload && typeof data.payload.operation === "string"
        ? data
        : null;
    } catch {
      return null;
    }
  }
  function operationId() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    if (!globalThis.crypto?.getRandomValues)
      throw new Error(
        "Este navegador no puede crear una operación segura. Actualiza el navegador.",
      );
    return Array.from(crypto.getRandomValues(new Uint8Array(24)), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("");
  }
  function open(dialog) {
    if (!dialog.open) dialog.showModal();
  }
  function close(dialog) {
    if (dialog.open) dialog.close();
    stopScanner();
  }
  function navigate(screen) {
    stopScanner();
    const selling = screen === "sell";
    view.hidden = !selling;
    catalog.hidden = screen !== "products";
    sellButton.classList.toggle("is-active", selling);
    productsButton.classList.toggle("is-active", screen === "products");
    for (const [button, active] of [
      [sellButton, selling],
      [productsButton, screen === "products"],
    ]) {
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
    const title =
      { sell: "Vender", products: "Productos", sales: "Ventas" }[screen] ||
      "Productos";
    document.querySelector(".breadcrumb strong").textContent = title;
    document.title = `Comercial J&N · ${title}`;
    onNavigate?.(screen);
    main.focus({ preventScroll: true });
  }
  function subtotal() {
    return [...state.cart.values()].reduce(
      (sum, line) => sum + cents(line.product.precio) * line.quantity,
      0,
    );
  }
  function total() {
    return Math.max(0, subtotal() - cents($("pos-discount").value));
  }
  function draftPreview() {
    return [...state.cart.values()].map((line) => ({
      id: line.product.id,
      name: line.product.nombre,
      price: Number(line.product.precio),
      quantity: line.quantity,
      subtotal: (cents(line.product.precio) * line.quantity) / 100,
    }));
  }
  function renderProducts() {
    const list = $("pos-product-list");
    list.replaceChildren();
    if (state.loading) {
      $("pos-results").textContent = "Cargando productos…";
      return;
    }
    if (!state.ready) {
      $("pos-results").textContent =
        state.loadError || "Actualiza el catálogo para comenzar.";
      return;
    }
    const query = normalize($("pos-search").value);
    const visible = state.products.filter((p) =>
      normalize(`${p.nombre} ${p.codigo}`).includes(query),
    );
    $("pos-results").textContent = visible.length
      ? `${visible.length} ${visible.length === 1 ? "producto" : "productos"}`
      : "No encontramos productos. Prueba otro nombre o código.";
    const fragment = document.createDocumentFragment();
    for (const product of visible) {
      const row = element("div", "pos-product");
      const picture = element("span", "product-picture");
      const image = safeImageUrl(product.foto);
      if (image) {
        const img = document.createElement("img");
        img.src = image;
        img.alt = "";
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";
        img.addEventListener(
          "error",
          () => picture.replaceChildren(icon("box")),
          { once: true },
        );
        picture.append(img);
      } else picture.append(icon("box"));
      const copy = element("div", "pos-product-copy");
      copy.append(
        element("strong", "", product.nombre),
        element(
          "small",
          "",
          `${product.codigo || "Sin código"} · Stock: ${product.stock}`,
        ),
      );
      const action = element(
        "button",
        "button button-secondary pos-product-add",
        "+",
      );
      action.type = "button";
      action.dataset.add = product.id;
      action.setAttribute("aria-label", `Agregar ${product.nombre}`);
      action.disabled =
        !!state.pending ||
        Number(product.stock) <= (state.cart.get(product.id)?.quantity || 0);
      row.append(
        picture,
        copy,
        element("strong", "pos-product-price", cash(product.precio)),
        action,
      );
      fragment.append(row);
    }
    list.append(fragment);
  }
  function renderCart() {
    const cart = $("pos-cart");
    cart.replaceChildren();
    if (!state.cart.size)
      cart.append(
        element(
          "p",
          "pos-empty-cart",
          "Tu venta empieza aquí. Escanea o agrega un producto.",
        ),
      );
    for (const [id, line] of state.cart) {
      const row = element("div", "pos-cart-line");
      const description = element("div", "pos-cart-description");
      description.append(
        element("strong", "", line.product.nombre),
        element("small", "", `${cash(line.product.precio)} por unidad`),
      );
      const controls = element("div", "pos-quantity");
      const minus = element("button", "", "−"),
        plus = element("button", "", "+");
      minus.type = plus.type = "button";
      minus.dataset.decrease = id;
      plus.dataset.increase = id;
      minus.setAttribute(
        "aria-label",
        `Quitar una unidad de ${line.product.nombre}`,
      );
      plus.setAttribute(
        "aria-label",
        `Agregar una unidad de ${line.product.nombre}`,
      );
      minus.disabled = !!state.pending || state.busy;
      plus.disabled =
        !!state.pending ||
        state.busy ||
        !state.ready ||
        line.quantity >= Number(line.product.stock);
      controls.append(minus, element("span", "", line.quantity), plus);
      row.append(
        description,
        controls,
        element(
          "strong",
          "pos-line-total",
          cash((cents(line.product.precio) * line.quantity) / 100),
        ),
      );
      cart.append(row);
    }
    $("pos-subtotal").textContent = cash(subtotal() / 100);
    $("pos-clear").disabled = !!state.pending || !state.cart.size || state.busy;
    $("pos-review").disabled =
      !state.pending && (!state.cart.size || !state.ready);
    $("pos-review").textContent = state.pending
      ? "Retomar venta pendiente"
      : "Revisar orden";
    $("pos-pending-notice").hidden = !state.pending;
    $("pos-scan").disabled = !!state.pending || !state.ready;
  }
  function render() {
    renderProducts();
    renderCart();
  }
  function addProduct(id) {
    if (state.pending || !state.ready) return;
    const product = state.products.find((p) => p.id === id);
    if (!product) return;
    if (!state.cart.has(id) && state.cart.size >= 50) {
      toast("Una venta admite hasta 50 productos distintos.", true);
      return;
    }
    const quantity = (state.cart.get(id)?.quantity || 0) + 1;
    if (quantity > Number(product.stock) || quantity > 10000) {
      toast("No hay más stock disponible de este producto.", true);
      return;
    }
    state.cart.set(id, { product, quantity });
    toast(`${product.nombre} agregado a la venta.`);
    if (navigator.vibrate) navigator.vibrate(60);
    render();
  }
  function scanResult(code, format) {
    let matches = state.products.filter(
      (p) => String(p.codigo).toLowerCase() === code.toLowerCase(),
    );
    // UPC-A puede leerse como EAN-13 con un único cero inicial. No eliminar
    // ceros de otros códigos: también pueden pertenecer a Code128.
    if (
      !matches.length &&
      ["upc_a", "ean_13"].includes(format) &&
      (/^\d{12}$/.test(code) || /^0\d{12}$/.test(code))
    ) {
      const alias = code.length === 12 ? "0" + code : code.slice(1);
      matches = state.products.filter((p) => String(p.codigo) === alias);
    }
    if (matches.length === 1) addProduct(matches[0].id);
    else
      toast(
        matches.length
          ? "Hay códigos repetidos en el catálogo. Busca el producto por nombre."
          : `No encontramos el código ${code}. Puedes buscarlo manualmente.`,
        true,
      );
  }
  async function scan(target) {
    const epoch = state.epoch,
      token = session()?.token;
    try {
      let format = "";
      // La lectura se agrega una sola vez, usando el retorno. El callback solo
      // conserva el formato para distinguir UPC de códigos Code128 numéricos.
      const code = await scanBarcode({
        onDetected: (_value, info) => {
          format = info?.format || "";
        },
        onMessage: (message) => toast(message),
      });
      if (!current(epoch, token) || !code) return;
      if (target === "product") {
        $("pos-product-code").value = code;
        $("pos-product-name").focus();
      } else scanResult(code, format);
    } catch (e) {
      if (current(epoch, token))
        toast(
          e.message || "No se pudo abrir la cámara. Usa la búsqueda manual.",
          true,
        );
    }
  }
  function renderOrder() {
    const lines = state.pending?.preview || draftPreview();
    $("pos-order-lines").replaceChildren();
    for (const line of lines) {
      const row = element("div", "pos-order-line");
      row.append(
        element("span", "", `${line.quantity} × ${line.name}`),
        element("strong", "", cash(line.subtotal)),
      );
      $("pos-order-lines").append(row);
    }
    const pending = !!state.pending;
    $("pos-order-fields").disabled = pending || state.busy;
    $("pos-complete").disabled = state.busy;
    $("pos-complete").textContent = state.busy
      ? "Confirmando venta…"
      : pending
        ? "Reintentar misma venta"
        : "Completar venta";
    $("pos-checkout-form").setAttribute("aria-busy", String(state.busy));
    renderTotals();
  }
  function renderTotals() {
    const payload = state.pending?.payload;
    const amount = payload ? cents(payload.expectedTotal) : total();
    const payment = payload?.payment || $("pos-payment").value;
    const received = payload
      ? cents(payload.received)
      : cents($("pos-received").value);
    $("pos-cash-fields").hidden = payment !== "Efectivo";
    $("pos-received").required = payment === "Efectivo";
    $("pos-received").min = (amount / 100).toFixed(2);
    $("pos-order-total").textContent = cash(amount / 100);
    $("pos-change").textContent =
      received >= amount
        ? cash((received - amount) / 100)
        : `Faltan ${cash((amount - received) / 100)}`;
    $("pos-discount").max = (subtotal() / 100).toFixed(2);
  }
  function review() {
    if (!state.cart.size && !state.pending) return;
    error("pos-checkout-error");
    if (state.pending)
      error(
        "pos-checkout-error",
        "Hay una venta por confirmar. Reintenta esta misma orden; no hagas un segundo cobro.",
      );
    renderOrder();
    open($("pos-checkout"));
  }
  function receipt(sale) {
    $("pos-sale-number").textContent = `Comprobante N.º ${sale.nro}`;
    $("pos-sale-date").textContent = sale.fecha;
    $("pos-sale-lines").replaceChildren();
    for (const line of sale.lineas || []) {
      const row = element("div", "pos-order-line");
      row.append(
        element("span", "", `${line.cant} × ${line.nombre}`),
        element("strong", "", cash(line.sub)),
      );
      $("pos-sale-lines").append(row);
    }
    const summary = $("pos-sale-summary");
    summary.replaceChildren();
    const entries = [
      ["Cliente", sale.cliente || "Público general"],
      ["Vendedor", sale.vendedor],
      ["Subtotal", cash(sale.subtotal)],
      ["Descuento", cash(sale.descuento)],
      ["Total", cash(sale.total)],
      ["Pago", sale.medio],
    ];
    if (sale.doc) entries.splice(1, 0, ["DNI / RUC", sale.doc]);
    if (sale.medio === "Efectivo")
      entries.push(
        ["Recibido", cash(sale.recibido)],
        ["Vuelto", cash(sale.vuelto)],
      );
    for (const [name, value] of entries)
      summary.append(element("dt", "", name), element("dd", "", value));
    open($("pos-receipt"));
    onReceipt?.(sale);
  }
  async function complete(event) {
    event.preventDefault();
    if (state.busy || !session()) return;
    error("pos-checkout-error");
    if (!state.pending) {
      if (!$("pos-checkout-form").reportValidity()) return;
      if (!state.cart.size || cents($("pos-discount").value) > subtotal()) {
        error("pos-checkout-error", "Revisa los productos y el descuento.");
        return;
      }
      const payment = $("pos-payment").value;
      const payload = {
        operation: operationId(),
        items: [...state.cart].map(([id, line]) => ({
          id,
          quantity: line.quantity,
        })),
        customer: $("pos-customer").value.trim(),
        document: $("pos-document").value.trim(),
        payment,
        discount: cents($("pos-discount").value) / 100,
        received:
          payment === "Efectivo" ? Number($("pos-received").value) : null,
        expectedTotal: total() / 100,
      };
      const pending = {
        payload,
        preview: draftPreview(),
        createdAt: Date.now(),
      };
      if (!store("sale", pending)) {
        error(
          "pos-checkout-error",
          "El navegador bloqueó el guardado temporal de la orden. Permite el almacenamiento de este sitio antes de cobrar; así podremos recuperar una venta si la conexión falla.",
        );
        return;
      }
      state.pending = pending;
    }
    const payload = state.pending.payload;
    const epoch = state.epoch,
      token = session().token;
    state.busy = true;
    renderOrder();
    render();
    try {
      const data = await api("sales.create", payload, token);
      if (!current(epoch, token)) return;
      if (
        !data?.sale ||
        data.sale.operation !== payload.operation ||
        !Array.isArray(data.sale.lineas)
      )
        throw new Error(
          "La respuesta de la venta no se pudo confirmar. Reintenta la misma orden.",
        );
      store("sale", null);
      state.pending = null;
      state.cart.clear();
      close($("pos-checkout"));
      $("pos-checkout-form").reset();
      state.autoName = "";
      state.customerEdited = false;
      receipt(data.sale);
      render();
      await reload();
    } catch (e) {
      if (!current(epoch, token)) return;
      if (onAuthError(e)) return;
      if (knownRejections.has(e.code)) {
        store("sale", null);
        state.pending = null;
        error("pos-checkout-error", e.message);
        if (
          ["INSUFFICIENT_STOCK", "STOCK_CHANGED", "PRICE_CHANGED"].includes(
            e.code,
          )
        ) {
          await reload();
          if (current(epoch, token))
            error(
              "pos-checkout-error",
              `${e.message} Revisa la orden actualizada antes de volver a confirmar.`,
            );
        }
      } else
        error(
          "pos-checkout-error",
          `${e.message || "No se pudo confirmar la venta."} No hagas otro cobro ni cambies la orden. Reintenta la misma venta para comprobar el resultado.`,
        );
    } finally {
      if (current(epoch, token)) {
        state.busy = false;
        renderOrder();
        render();
      }
    }
  }
  function scheduleDocument() {
    clearTimeout(state.documentTimer);
    state.lookup += 1;
    const input = $("pos-document");
    input.value = input.value.replace(/\D/g, "").slice(0, 11);
    if (!state.customerEdited && $("pos-customer").value === state.autoName)
      $("pos-customer").value = "";
    $("pos-document-status").textContent = "";
    const doc = input.value;
    if (![8, 11].includes(doc.length) || state.pending) return;
    const lookup = state.lookup,
      epoch = state.epoch,
      token = session()?.token;
    state.documentTimer = window.setTimeout(
      async () => {
        if (!current(epoch, token) || state.lookup !== lookup) return;
        $("pos-document-status").textContent = "Buscando nombre…";
        try {
          const data = await api("documents.lookup", { document: doc }, token);
          if (
            !current(epoch, token) ||
            lookup !== state.lookup ||
            $("pos-document").value !== doc
          )
            return;
          if (state.pending || state.busy) return;
          if (!state.customerEdited || !$("pos-customer").value.trim()) {
            $("pos-customer").value = String(data.nombre || "").slice(0, 120);
            state.autoName = $("pos-customer").value;
          }
          $("pos-document-status").textContent = state.customerEdited
            ? `Nombre encontrado: ${String(data.nombre || "")}`
            : "Nombre encontrado.";
        } catch (e) {
          if (
            !current(epoch, token) ||
            lookup !== state.lookup ||
            $("pos-document").value !== doc
          )
            return;
          if (!onAuthError(e))
            $("pos-document-status").textContent =
              e.message || "Puedes escribir el nombre manualmente.";
        }
      },
      doc.length === 8 ? 850 : 150,
    );
  }
  function openProduct() {
    if (onNewProduct) {
      onNewProduct();
      return;
    }
    if (state.user?.role !== "Admin") return;
    error("pos-product-error");
    if (state.productPending) {
      const p = state.productPending.payload;
      $("pos-product-name").value = p.name;
      $("pos-product-code").value = p.code;
      $("pos-product-price").value = p.price;
      $("pos-product-stock").value = p.stock;
      error(
        "pos-product-error",
        "Este producto está por confirmar. Reintenta el mismo guardado para comprobar si ya se creó.",
      );
    }
    productFormState();
    open($("pos-product-dialog"));
  }
  function productFormState() {
    $("pos-product-fields").disabled =
      state.productBusy || !!state.productPending;
    $("pos-product-save").disabled = state.productBusy;
    $("pos-product-save").textContent = state.productBusy
      ? "Guardando…"
      : state.productPending
        ? "Reintentar mismo producto"
        : "Guardar producto";
    $("pos-product-form").setAttribute("aria-busy", String(state.productBusy));
    for (const id of ["pos-new-product", "pos-add-product"]) {
      $(id).textContent = state.productPending
        ? "Retomar producto pendiente"
        : "+ Agregar producto";
    }
  }
  async function saveProduct(event) {
    if (onProductSubmit) {
      await onProductSubmit(event);
      return;
    }
    event.preventDefault();
    if (state.productBusy || state.user?.role !== "Admin" || !session()) return;
    error("pos-product-error");
    if (!state.productPending) {
      if (!$("pos-product-form").reportValidity()) return;
      const payload = {
        operation: operationId(),
        name: $("pos-product-name").value.trim(),
        code: $("pos-product-code").value.trim(),
        price: Number($("pos-product-price").value),
        stock: Number($("pos-product-stock").value),
      };
      if (!payload.name || !payload.code) {
        error("pos-product-error", "Escribe nombre y código del producto.");
        return;
      }
      const pending = { payload };
      if (!store("product", pending)) {
        error(
          "pos-product-error",
          "Permite el almacenamiento temporal del sitio antes de guardar, para poder recuperar el resultado si falla la conexión.",
        );
        return;
      }
      state.productPending = pending;
    }
    const epoch = state.epoch,
      token = session().token;
    state.productBusy = true;
    productFormState();
    try {
      const data = await api(
        "products.create",
        state.productPending.payload,
        token,
      );
      if (!current(epoch, token)) return;
      if (!data?.product?.id)
        throw new Error(
          "No se pudo confirmar el producto. Reintenta el mismo guardado.",
        );
      store("product", null);
      state.productPending = null;
      $("pos-product-form").reset();
      close($("pos-product-dialog"));
      toast("Producto agregado al catálogo.");
      await reload();
    } catch (e) {
      if (!current(epoch, token)) return;
      if (onAuthError(e)) return;
      if (knownRejections.has(e.code)) {
        store("product", null);
        state.productPending = null;
        error("pos-product-error", e.message);
      } else
        error(
          "pos-product-error",
          `${e.message || "No se pudo confirmar el producto."} Reintenta el mismo guardado.`,
        );
    } finally {
      if (current(epoch, token)) {
        state.productBusy = false;
        productFormState();
      }
    }
  }

  sellButton.addEventListener("click", () => navigate("sell"));
  productsButton.addEventListener("click", () => navigate("products"));
  document
    .querySelector(".sidebar-brand")
    .addEventListener("click", (event) => {
      event.preventDefault();
      navigate("products");
    });
  $("pos-refresh").addEventListener("click", reload);
  $("pos-search").addEventListener("input", renderProducts);
  $("pos-search").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const query = normalize($("pos-search").value);
    if (!query) return;
    const exact = state.products.filter((p) => normalize(p.codigo) === query);
    const matching = exact.length
      ? exact
      : state.products.filter((p) =>
          normalize(`${p.nombre} ${p.codigo}`).includes(query),
        );
    if (matching.length === 1) addProduct(matching[0].id);
    else toast("Elige el producto de la lista para agregarlo.", true);
  });
  $("pos-product-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-add]");
    if (button && !button.disabled) addProduct(button.dataset.add);
  });
  $("pos-cart").addEventListener("click", (event) => {
    if (state.pending || state.busy) return;
    const plus = event.target.closest("[data-increase]");
    if (plus && !plus.disabled) {
      addProduct(plus.dataset.increase);
      return;
    }
    const minus = event.target.closest("[data-decrease]");
    if (!minus || minus.disabled) return;
    const line = state.cart.get(minus.dataset.decrease);
    if (line && --line.quantity <= 0) state.cart.delete(minus.dataset.decrease);
    render();
  });
  $("pos-clear").addEventListener("click", () => {
    if (!state.pending && !state.busy) {
      state.cart.clear();
      render();
    }
  });
  $("pos-review").addEventListener("click", review);
  $("pos-scan").addEventListener("click", () => scan("sell"));
  $("pos-product-scan").addEventListener("click", () => scan("product"));
  $("pos-checkout-form").addEventListener("submit", complete);
  $("pos-discount").addEventListener("input", renderTotals);
  $("pos-payment").addEventListener("change", renderTotals);
  $("pos-received").addEventListener("input", renderTotals);
  $("pos-document").addEventListener("input", scheduleDocument);
  $("pos-customer").addEventListener("input", () => {
    state.customerEdited = true;
  });
  dialogs.querySelectorAll("[data-bill]").forEach((button) =>
    button.addEventListener("click", () => {
      $("pos-received").value =
        button.dataset.bill === "exact"
          ? (total() / 100).toFixed(2)
          : button.dataset.bill;
      renderTotals();
    }),
  );
  dialogs.querySelectorAll("[data-pos-close]").forEach((button) =>
    button.addEventListener("click", () => {
      if (!state.busy && !state.productBusy) close($(button.dataset.posClose));
    }),
  );
  dialogs.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("cancel", (event) => {
      if (state.busy || state.productBusy) event.preventDefault();
    });
    dialog.addEventListener("close", stopScanner);
  });
  $("pos-new-product").addEventListener("click", openProduct);
  $("pos-add-product").addEventListener("click", openProduct);
  $("pos-product-form").addEventListener("submit", saveProduct);
  $("pos-new-sale").addEventListener("click", () => {
    close($("pos-receipt"));
    navigate("sell");
    $("pos-search").focus();
  });

  return {
    navigate,
    start(user) {
      state.epoch += 1;
      state.user = user;
      state.cart.clear();
      state.products = [];
      state.ready = false;
      state.loading = true;
      state.loadError = "";
      state.pending = restore("sale");
      state.productPending = restore("product");
      if (state.pending) {
        const p = state.pending.payload;
        if (!Array.isArray(state.pending.preview) || !Array.isArray(p.items))
          state.pending = null;
        else {
          for (const line of state.pending.preview)
            state.cart.set(line.id, {
              product: {
                id: line.id,
                nombre: line.name,
                precio: line.price,
                stock: line.quantity,
              },
              quantity: line.quantity,
            });
          $("pos-customer").value = p.customer || "";
          $("pos-document").value = p.document || "";
          $("pos-discount").value = p.discount || 0;
          $("pos-payment").value = p.payment;
          $("pos-received").value = p.received == null ? "" : p.received;
        }
      }
      for (const id of ["pos-new-product", "pos-add-product"])
        $(id).hidden = user.role !== "Admin";
      productFormState();
      navigate("sell");
      render();
    },
    reset() {
      state.epoch += 1;
      state.user = null;
      state.cart.clear();
      state.products = [];
      state.ready = false;
      state.pending = null;
      state.productPending = null;
      state.busy = false;
      state.productBusy = false;
      state.autoName = "";
      state.customerEdited = false;
      state.lookup += 1;
      clearTimeout(state.documentTimer);
      stopScanner();
      dialogs.querySelectorAll("dialog").forEach(close);
      $("pos-checkout-form").reset();
      $("pos-product-form").reset();
      error("pos-checkout-error");
      error("pos-product-error");
      $("pos-document-status").textContent = "";
      $("pos-search").value = "";
      $("pos-order-lines").replaceChildren();
      $("pos-sale-lines").replaceChildren();
      $("pos-sale-summary").replaceChildren();
      $("pos-sale-number").textContent = "";
      $("pos-sale-date").textContent = "";
      render();
    },
    setLoading() {
      state.loading = true;
      state.ready = false;
      $("pos-refresh").disabled = true;
      render();
    },
    setProducts(products) {
      state.products = products;
      state.ready = true;
      state.loading = false;
      state.loadError = "";
      $("pos-refresh").disabled = false;
      if (!state.pending)
        for (const [id, line] of state.cart) {
          const fresh = products.find((p) => p.id === id);
          line.product = fresh || { ...line.product, stock: 0 };
        }
      render();
      if ($("pos-checkout").open) renderOrder();
    },
    setLoadError(message) {
      state.loading = false;
      state.ready = false;
      state.loadError = message;
      $("pos-refresh").disabled = false;
      render();
    },
  };
}
