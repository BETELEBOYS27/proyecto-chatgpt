import { api, isApiConfigured } from "./api.js";
import { CONFIG } from "./config.js";
import { createPos } from "./pos.js";
import { createInventory } from "./products.js";
import { createSales } from "./sales.js";
import { createReceipt } from "./receipt.js";
let inventory, sales, receipts;

// Solo se recuerda un token temporal. Ninguna contraseña se guarda en el navegador.
const SESSION_KEY = "jn_session_v1";
const $ = (id) => document.getElementById(id);
const state = {
  session: null,
  remember: true,
  products: [],
  loading: false,
  reloadQueued: false,
  catalogReady: false,
  expiryTimer: null,
  toastTimer: null,
  generation: 0,
};
const money = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  minimumFractionDigits: 2,
});
const sessionErrors = new Set(["UNAUTHORIZED", "SESSION_EXPIRED"]);

function clearStoredSession() {
  for (const storageName of ["localStorage", "sessionStorage"]) {
    try {
      const storage = window[storageName];
      storage.removeItem(SESSION_KEY);
      storage.removeItem("jn_cred");
    } catch {
      /* El modo privado puede impedir almacenamiento. */
    }
  }
}

function readStoredSession() {
  for (const [storageName, remember] of [
    ["localStorage", true],
    ["sessionStorage", false],
  ]) {
    try {
      const storage = window[storageName];
      // La versión antigua guardaba la contraseña: se elimina sin leerla.
      storage.removeItem("jn_cred");
      const item = JSON.parse(storage.getItem(SESSION_KEY));
      if (
        typeof item?.token !== "string" ||
        !item.token ||
        !Number.isFinite(Date.parse(item.expiresAt))
      )
        continue;
      if (Date.parse(item.expiresAt) <= Date.now()) {
        storage.removeItem(SESSION_KEY);
        continue;
      }
      return { session: item, remember };
    } catch {
      /* Sin sesión recordada; el acceso manual sigue disponible. */
    }
  }
  return null;
}

function saveSession(session, remember) {
  if (
    !session?.token ||
    !session.user ||
    !Number.isFinite(Date.parse(session.expiresAt))
  ) {
    throw new Error("La respuesta de la sesión no es válida.");
  }
  clearStoredSession();
  state.session = {
    token: session.token,
    expiresAt: session.expiresAt,
    user: session.user,
  };
  state.remember = remember;
  try {
    window[remember ? "localStorage" : "sessionStorage"].setItem(
      SESSION_KEY,
      JSON.stringify(state.session),
    );
  } catch {
    toast(
      "La sesión funcionará en esta pestaña; el navegador no permite recordarla.",
    );
  }
  window.clearTimeout(state.expiryTimer);
  const remaining = Date.parse(session.expiresAt) - Date.now();
  state.expiryTimer = window.setTimeout(
    () => expireSession(),
    Math.max(0, Math.min(remaining, 2147483647)),
  );
}

function setError(id, message = "") {
  $(id).textContent = message;
  $(id).hidden = !message;
}

function toast(message, error = false) {
  window.clearTimeout(state.toastTimer);
  $("toast-message").textContent = message;
  $("toast").classList.toggle("is-error", error);
  $("toast").hidden = false;
  state.toastTimer = window.setTimeout(
    () => {
      $("toast").hidden = true;
    },
    error ? 7000 : 4500,
  );
}

function setFormBusy(form, busy, button, normalText, busyText) {
  form.setAttribute("aria-busy", String(busy));
  for (const control of form.elements) control.disabled = busy;
  button.querySelector("span").textContent = busy ? busyText : normalText;
}

function hidePasswords() {
  document.querySelectorAll("[data-toggle]").forEach((button) => {
    $(button.dataset.toggle).type = "password";
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", "Mostrar contraseña");
  });
}

function resetLocalSession({ preserveStored = false } = {}) {
  inventory?.reset();
  sales?.reset();
  receipts?.reset();
  pos.reset();
  state.generation += 1;
  state.session = null;
  state.products = [];
  state.loading = false;
  state.reloadQueued = false;
  state.catalogReady = false;
  window.clearTimeout(state.expiryTimer);
  if (!preserveStored) clearStoredSession();
  $("product-list").replaceChildren();
  $("product-count").textContent = "—";
  $("refresh-button").disabled = false;
  $("retry-button").disabled = false;
  $("product-search").value = "";
  $("stock-filter").value = "all";
  $("login-form").reset();
  $("password-form").reset();
  setFormBusy(
    $("login-form"),
    false,
    $("login-submit"),
    "Ingresar a mi negocio",
    "Ingresando…",
  );
  setFormBusy(
    $("password-form"),
    false,
    $("password-submit"),
    "Guardar y continuar",
    "Guardando…",
  );
  hidePasswords();
  showLogin();
}

function showLogin() {
  $("app-view").hidden = true;
  $("auth-view").hidden = false;
  $("login-panel").hidden = false;
  $("password-panel").hidden = true;
  document.title = "Comercial J&N · Iniciar sesión";
}

function showPasswordChange() {
  inventory?.reset();
  sales?.reset();
  receipts?.reset();
  pos.reset();
  $("app-view").hidden = true;
  $("auth-view").hidden = false;
  $("login-panel").hidden = true;
  $("password-panel").hidden = false;
  $("password-form").reset();
  setError("password-error");
  $("current-password").focus();
  document.title = "Comercial J&N · Cambiar contraseña";
}

function expireSession() {
  if (!state.session) return;
  resetLocalSession();
  setError(
    "login-error",
    "Tu sesión terminó. Ingresa de nuevo para continuar.",
  );
  $("username").focus();
}

function handleSessionError(error) {
  if (sessionErrors.has(error.code)) {
    expireSession();
    return true;
  }
  if (error.code === "PASSWORD_CHANGE_REQUIRED") {
    showPasswordChange();
    return true;
  }
  return false;
}

async function logout() {
  const token = state.session?.token;
  resetLocalSession();
  setError("login-error");
  setError("password-error");
  $("username").focus();
  if (!token) return;
  try {
    await api("logout", {}, token);
    toast("Cerraste tu sesión. ¡Hasta pronto!");
  } catch {
    toast(
      "Sesión cerrada en este dispositivo. No se pudo revocar el token en el servidor; vencerá automáticamente.",
      true,
    );
  }
}

function showWorkspace() {
  const user = state.session.user;
  $("auth-view").hidden = true;
  $("app-view").hidden = false;
  const name = String(user.name || user.username || "Mi cuenta");
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => Array.from(part)[0] || "")
    .join("")
    .toUpperCase();
  document.querySelectorAll(".user-name").forEach((node) => {
    node.textContent = name;
  });
  document.querySelectorAll(".user-initials").forEach((node) => {
    node.textContent = initials;
    node.title = name;
  });
  document.querySelectorAll(".user-role").forEach((node) => {
    node.textContent = user.role === "Admin" ? "Administrador" : "Vendedor";
  });
  document.querySelectorAll(".accounts-nav").forEach((node) => {
    node.hidden = user.role !== "Admin";
  });
  $("today-label").textContent = new Intl.DateTimeFormat("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Lima",
  }).format(new Date());
  document.title = "Comercial J&N · Productos";
  $("main-content").focus({ preventScroll: true });
  pos.start(user);
  inventory.start(user);
  sales.start(user);
}

function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#icon-${name}`);
  svg.append(use);
  return svg;
}

// Las imágenes no admiten javascript:, SVG en data: ni archivos locales.
export function safeImageUrl(value) {
  if (typeof value !== "string" || !value || value.length > 100000) return "";
  if (/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(value))
    return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}

function productRow(product) {
  const tr = document.createElement("tr");
  const identityCell = document.createElement("td");
  const identity = document.createElement("div");
  identity.className = "product-identity";
  const picture = document.createElement("span");
  picture.className = "product-picture";
  picture.append(icon("box"));
  const photo = safeImageUrl(product.foto);
  if (photo) {
    const img = document.createElement("img");
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.addEventListener(
      "error",
      () => {
        picture.replaceChildren(icon("box"));
      },
      { once: true },
    );
    img.src = photo;
    picture.replaceChildren(img);
  }
  const copy = document.createElement("span");
  copy.className = "product-name";
  const name = document.createElement("span");
  name.textContent = String(product.nombre || "Producto sin nombre");
  const mobileCode = document.createElement("span");
  mobileCode.className = "product-mobile-code";
  mobileCode.textContent = product.codigo
    ? String(product.codigo)
    : "Sin código";
  copy.append(name, mobileCode);
  identity.append(picture, copy);
  identityCell.append(identity);
  const code = document.createElement("td");
  code.textContent = product.codigo ? String(product.codigo) : "—";
  const price = document.createElement("td");
  price.className = "price-cell";
  price.textContent =
    Number.isFinite(Number(product.precio)) && Number(product.precio) >= 0
      ? money.format(Number(product.precio))
      : "—";
  const stock = document.createElement("td");
  stock.className = "stock-cell";
  const badge = document.createElement("span");
  const amount = Number(product.stock);
  const hasStock = Number.isFinite(amount) && amount > 0;
  badge.className = `stock-badge${!hasStock ? " empty" : amount <= CONFIG.LOW_STOCK_LIMIT ? " low" : ""}`;
  badge.textContent =
    Number.isFinite(amount) && amount >= 0 ? String(amount) : "—";
  badge.title = !hasStock
    ? "Sin stock"
    : amount <= CONFIG.LOW_STOCK_LIMIT
      ? "Stock bajo"
      : "Disponible";
  stock.append(badge);
  tr.append(identityCell, code, price, stock);
  inventory?.decorateRow(tr, product);
  return tr;
}

function normalized(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

function renderProducts() {
  const query = normalized($("product-search").value);
  const filter = $("stock-filter").value;
  const products = state.products.filter((product) => {
    const matchesQuery =
      !query ||
      normalized(`${product.nombre} ${product.codigo}`).includes(query);
    const stock = Number(product.stock);
    const matchesFilter =
      filter === "all" ||
      (filter === "available" && stock > 0) ||
      (filter === "low" && stock > 0 && stock <= CONFIG.LOW_STOCK_LIMIT) ||
      (filter === "empty" && stock === 0);
    return matchesQuery && matchesFilter;
  });
  $("catalog-error").hidden = true;
  $("product-loading").hidden = true;
  $("product-table-wrap").hidden = !products.length;
  $("catalog-empty").hidden = products.length > 0;
  const fragment = document.createDocumentFragment();
  for (const product of products) fragment.append(productRow(product));
  $("product-list").replaceChildren(fragment);
  $("results-label").textContent =
    `${products.length} ${products.length === 1 ? "producto" : "productos"}${query || filter !== "all" ? ` de ${state.products.length}` : " en tu catálogo"}`;
  const hasFilters = Boolean(query || filter !== "all");
  $("empty-title").textContent = hasFilters
    ? "No encontramos coincidencias"
    : "Tu catálogo empieza aquí";
  $("empty-description").textContent = hasFilters
    ? "Prueba con otro nombre o código, o cambia el filtro de stock."
    : "Los productos de tu hoja de Google aparecerán en este espacio.";
  $("clear-filters").hidden = !hasFilters;
}

async function loadProducts() {
  if (!state.session) return;
  if (state.loading) {
    // Un cobro puede terminar mientras una consulta anterior sigue en vuelo.
    // Repetir al terminar evita que esa respuesta deje stock anterior en pantalla.
    state.reloadQueued = true;
    return;
  }
  const token = state.session.token;
  const generation = state.generation;
  state.loading = true;
  pos.setLoading();
  state.catalogReady = false;
  $("refresh-button").disabled = true;
  $("retry-button").disabled = true;
  $("product-loading").hidden = false;
  $("catalog-empty").hidden = true;
  $("catalog-error").hidden = true;
  $("product-table-wrap").hidden = true;
  $("results-label").textContent = "Cargando catálogo…";
  $("sync-label").textContent = "Actualizando productos…";
  document.querySelector(".catalog-overview").classList.remove("is-synced");
  document.querySelector(".catalog-panel").setAttribute("aria-busy", "true");
  try {
    const data = await api("products.list", {}, token);
    if (state.generation !== generation || state.session?.token !== token)
      return;
    if (!Array.isArray(data?.products))
      throw new Error("El catálogo recibido no tiene un formato válido.");
    state.products = data.products.filter(
      (product) => product && typeof product === "object",
    );
    state.catalogReady = true;
    pos.setProducts(state.products);
    inventory.setProducts(state.products);
    $("product-count").textContent = String(state.products.length);
    $("sync-label").textContent =
      `Actualizado a las ${new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" }).format(new Date())}`;
    document.querySelector(".catalog-overview").classList.add("is-synced");
    renderProducts();
  } catch (error) {
    if (
      state.generation !== generation ||
      state.session?.token !== token ||
      handleSessionError(error)
    )
      return;
    $("product-count").textContent = "—";
    $("sync-label").textContent = "No se pudo actualizar";
    $("results-label").textContent = "Catálogo no disponible";
    $("product-loading").hidden = true;
    $("catalog-error").hidden = false;
    $("catalog-error-message").textContent = error.message;
    pos.setLoadError(error.message);
  } finally {
    if (state.generation === generation) {
      state.loading = false;
      $("refresh-button").disabled = false;
      $("retry-button").disabled = false;
      document
        .querySelector(".catalog-panel")
        .setAttribute("aria-busy", "false");
      if (state.reloadQueued) {
        state.reloadQueued = false;
        void loadProducts();
      }
    }
  }
}

async function completeAuthentication(data, remember) {
  state.generation += 1;
  saveSession(data, remember);
  $("login-form").reset();
  $("password-form").reset();
  hidePasswords();
  if (data.user.mustChangePassword) {
    showPasswordChange();
    return;
  }
  showWorkspace();
  await loadProducts();
}

$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.getAttribute("aria-busy") === "true") return;
  setError("login-error");
  const username = $("username").value.trim();
  const password = $("password").value;
  const remember = $("remember").checked;
  if (!username || !password) return;
  setFormBusy(
    form,
    true,
    $("login-submit"),
    "Ingresar a mi negocio",
    "Ingresando…",
  );
  try {
    const data = await api("login", { username, password });
    await completeAuthentication(data, remember);
  } catch (error) {
    setError("login-error", error.message);
    $("password").value = "";
  } finally {
    setFormBusy(
      form,
      false,
      $("login-submit"),
      "Ingresar a mi negocio",
      "Ingresando…",
    );
  }
});

$("password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.getAttribute("aria-busy") === "true") return;
  setError("password-error");
  const currentPassword = $("current-password").value;
  const newPassword = $("new-password").value;
  if (newPassword !== $("confirm-password").value) {
    setError("password-error", "Las nuevas contraseñas no coinciden.");
    return;
  }
  if (newPassword.length < 12 || newPassword.length > 128) {
    setError(
      "password-error",
      "La nueva contraseña debe tener entre 12 y 128 caracteres.",
    );
    return;
  }
  const token = state.session?.token;
  if (!token) {
    expireSession();
    return;
  }
  const remember = state.remember;
  const generation = state.generation;
  let handledGeneration = generation;
  setFormBusy(
    form,
    true,
    $("password-submit"),
    "Guardar y continuar",
    "Guardando…",
  );
  try {
    const data = await api(
      "password.change",
      { currentPassword, newPassword },
      token,
    );
    // Otra pestaña puede cerrar o cambiar la sesión mientras Google responde.
    // Una respuesta tardía nunca debe volver a abrir la cuenta anterior.
    if (state.generation !== generation || state.session?.token !== token) {
      if (data?.token) void api("logout", {}, data.token).catch(() => {});
      return;
    }
    handledGeneration = generation + 1;
    await completeAuthentication(data, remember);
    if (state.generation === handledGeneration)
      toast("Tu contraseña se actualizó correctamente.");
  } catch (error) {
    if (state.generation !== handledGeneration) return;
    if (!handleSessionError(error)) setError("password-error", error.message);
  } finally {
    if (state.generation === handledGeneration) {
      form.reset();
      setFormBusy(
        form,
        false,
        $("password-submit"),
        "Guardar y continuar",
        "Guardando…",
      );
    }
  }
});

document.querySelectorAll("[data-toggle]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = $(button.dataset.toggle);
    const showing = input.type === "password";
    input.type = showing ? "text" : "password";
    button.setAttribute("aria-pressed", String(showing));
    button.setAttribute(
      "aria-label",
      `${showing ? "Ocultar" : "Mostrar"} contraseña`,
    );
  });
});
document
  .querySelectorAll(".logout-button")
  .forEach((button) => button.addEventListener("click", logout));
$("password-logout").addEventListener("click", logout);
$("refresh-button").addEventListener("click", loadProducts);
$("retry-button").addEventListener("click", loadProducts);
$("product-search").addEventListener("input", () => {
  if (!state.loading && state.catalogReady) renderProducts();
});
$("stock-filter").addEventListener("change", () => {
  if (!state.loading && state.catalogReady) renderProducts();
});
$("clear-filters").addEventListener("click", () => {
  $("product-search").value = "";
  $("stock-filter").value = "all";
  renderProducts();
  $("product-search").focus();
});
document.addEventListener("keydown", (event) => {
  if (
    event.key === "/" &&
    !event.ctrlKey &&
    !event.metaKey &&
    !$("app-view").hidden &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)
  ) {
    event.preventDefault();
    $("product-search").focus();
  }
});
document.addEventListener("visibilitychange", () => {
  if (
    !document.hidden &&
    state.session &&
    Date.parse(state.session.expiresAt) <= Date.now()
  )
    expireSession();
});
window.addEventListener("offline", () =>
  toast(
    "Estás sin conexión. Necesitas internet para actualizar los datos.",
    true,
  ),
);
window.addEventListener("storage", (event) => {
  if (event.key === SESSION_KEY && state.remember && state.session) {
    // Si otra pestaña sale o cambia de cuenta, no se conserva una sesión distinta en memoria.
    const otherTabChangedSession = () => {
      resetLocalSession({ preserveStored: true });
      setError(
        "login-error",
        "La sesión cambió en otra pestaña. Ingresa nuevamente para continuar.",
      );
    };
    try {
      if (
        !event.newValue ||
        JSON.parse(event.newValue)?.token !== state.session.token
      )
        otherTabChangedSession();
    } catch {
      otherTabChangedSession();
    }
  }
});
document.querySelectorAll("[data-brand]").forEach((brand) => {
  const img = brand.querySelector("img");
  const showImage = () => {
    img.hidden = false;
    brand.querySelector(".brand-fallback").hidden = true;
  };
  img.addEventListener("load", showImage);
  if (img.complete && img.naturalWidth) showImage();
});

async function initialize() {
  $("configuration-notice").hidden = isApiConfigured();
  const stored = readStoredSession();
  if (!stored || !isApiConfigured()) return;
  $("auth-view").classList.add("is-restoring");
  setFormBusy(
    $("login-form"),
    true,
    $("login-submit"),
    "Ingresar a mi negocio",
    "Recuperando sesión…",
  );
  try {
    const data = await api("session", {}, stored.session.token);
    await completeAuthentication(
      { ...data, token: stored.session.token },
      stored.remember,
    );
  } catch (error) {
    if (sessionErrors.has(error.code)) clearStoredSession();
    setError(
      "login-error",
      sessionErrors.has(error.code)
        ? "Tu sesión terminó. Ingresa de nuevo para continuar."
        : error.message,
    );
  } finally {
    $("auth-view").classList.remove("is-restoring");
    setFormBusy(
      $("login-form"),
      false,
      $("login-submit"),
      "Ingresar a mi negocio",
      "Recuperando sesión…",
    );
  }
}

// Puente de la etapa 2: recibe la sesión en memoria, sin copiar contraseñas.
const pos = createPos({
  api,
  toast,
  getSession: () => state.session,
  reload: loadProducts,
  onAuthError: handleSessionError,
  safeImageUrl,
  onNewProduct: () => inventory.open(),
  onProductSubmit: (event) => inventory.save(event),
  onReceipt: (sale) => receipts.show(sale),
  onNavigate: (screen) => sales?.navigate(screen),
});
const managementStyles = document.createElement("link");
managementStyles.rel = "stylesheet";
managementStyles.href = new URL("../css/management.css", import.meta.url).href;
document.head.append(managementStyles);
receipts = createReceipt({ toast });
inventory = createInventory({
  api,
  toast,
  getSession: () => state.session,
  reload: loadProducts,
  onAuthError: handleSessionError,
  safeImageUrl,
});
sales = createSales({
  api,
  toast,
  getSession: () => state.session,
  onAuthError: handleSessionError,
  showReceipt: receipts.show,
  navigate: pos.navigate,
});
initialize();
