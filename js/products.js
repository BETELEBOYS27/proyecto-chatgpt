import { productPhoto, importPhoto } from "./images.js";

// Edición e importación con versión de inventario y recuperación por usuario.
export function createInventory({
  api,
  toast,
  getSession,
  reload,
  onAuthError,
  safeImageUrl,
}) {
  const $ = (id) => document.getElementById(id);
  const state = {
    user: null,
    products: [],
    editing: null,
    photo: "",
    pending: null,
    deletion: null,
    importPending: null,
    batchRows: null,
    index: 0,
    added: 0,
    skipped: 0,
    busy: false,
    photoBusy: false,
    conflict: false,
    epoch: 0,
  };
  const rejected = new Set([
    "VALIDATION_ERROR",
    "FORBIDDEN",
    "DUPLICATE_CODE",
    "PRODUCT_CHANGED",
    "NOT_FOUND",
  ]);
  const fields = $("pos-product-fields");
  const more = document.createElement("div");
  more.innerHTML = `<label for="product-cost">Costo de compra (S/) <small>Opcional</small></label><input id="product-cost" class="pos-input" type="number" min="0" max="10000000" step="0.01" inputmode="decimal" placeholder="Sin costo registrado"><label for="product-photo-file">Foto del producto <small>Opcional</small></label><input id="product-photo-file" class="pos-photo-file" type="file" accept="image/jpeg,image/png,image/webp"><div class="inventory-photo"><img id="product-photo-preview" alt="Vista previa de la foto del producto" hidden><button id="product-photo-remove" class="button button-text" type="button" hidden>Quitar foto</button></div><p id="product-photo-status" class="pos-hint" role="status"></p>`;
  fields.append(more);
  const header = document.createElement("th");
  header.textContent = "Acciones";
  header.className = "inventory-actions-heading";
  header.hidden = true;
  document.querySelector("#product-table-wrap thead tr").append(header);
  const importButton = document.createElement("button");
  importButton.id = "catalog-import";
  importButton.type = "button";
  importButton.className = "button button-secondary";
  importButton.textContent = "Importar JSON";
  importButton.hidden = true;
  const file = document.createElement("input");
  file.type = "file";
  file.accept = ".json,application/json";
  file.hidden = true;
  file.id = "catalog-import-file";
  document.querySelector(".pos-catalog-actions").append(importButton, file);
  const extra = document.createElement("div");
  extra.innerHTML = `<dialog id="product-delete-dialog" class="pos-dialog" aria-labelledby="product-delete-title"><div class="pos-dialog-head"><h2 id="product-delete-title">Eliminar producto</h2><button class="icon-button" id="product-delete-close" type="button" aria-label="Cerrar">✕</button></div><p id="product-delete-name"></p><p class="pos-hint">Se quitará del catálogo. Sus ventas anteriores seguirán en el historial.</p><p class="pos-error" id="product-delete-error" role="alert" hidden></p><button id="product-delete-confirm" class="button inventory-danger pos-wide" type="button">Eliminar producto</button></dialog>
  <dialog id="product-import-dialog" class="pos-dialog" aria-labelledby="product-import-title"><div class="pos-dialog-head"><h2 id="product-import-title">Importar productos</h2><button id="product-import-close" class="icon-button" type="button" aria-label="Cerrar">✕</button></div><p id="product-import-info"></p><p class="pos-hint">Se agregarán los productos nuevos. Los códigos o nombres que ya existan se omiten; no se reemplazan productos.</p><p id="product-import-progress" role="status" class="pos-hint"></p><p id="product-import-error" class="pos-error" role="alert" hidden></p><button id="product-import-confirm" class="button button-primary pos-wide" type="button">Importar productos</button></dialog>`;
  document.body.append(extra);
  const esc = (id, text = "") => {
    $(id).textContent = text;
    $(id).hidden = !text;
  };
  const id = () => crypto.randomUUID();
  const storageKey = (kind) =>
    `jn_pos_${kind}_${encodeURIComponent(state.user.username)}`;
  function store(kind, data) {
    try {
      if (data == null) sessionStorage.removeItem(storageKey(kind));
      else sessionStorage.setItem(storageKey(kind), JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }
  function restore(kind) {
    try {
      const v = JSON.parse(sessionStorage.getItem(storageKey(kind)));
      return typeof v?.payload?.operation === "string" ? v : null;
    } catch {
      return null;
    }
  }
  const valid = (epoch, token) =>
    epoch === state.epoch && getSession()?.token === token;
  function preview() {
    const url = safeImageUrl(state.photo);
    $("product-photo-preview").hidden = !url;
    $("product-photo-remove").hidden = !url;
    if (url) $("product-photo-preview").src = url;
    else $("product-photo-preview").removeAttribute("src");
  }
  function mode() {
    fields.disabled =
      state.busy || state.photoBusy || !!state.pending || state.conflict;
    $("pos-product-save").disabled = state.busy || state.photoBusy;
    $("pos-product-save").textContent = state.busy
      ? "Guardando…"
      : state.photoBusy
        ? "Preparando foto…"
        : state.pending
          ? "Reintentar mismo guardado"
          : state.conflict
            ? "Volver a cargar producto"
            : "Guardar producto";
    $("pos-product-form").setAttribute(
      "aria-busy",
      String(state.busy || state.photoBusy),
    );
    const blocked = state.busy || state.photoBusy;
    document.querySelector('[data-pos-close="pos-product-dialog"]').disabled =
      blocked;
    for (const item of [
      importButton,
      $("pos-new-product"),
      $("pos-add-product"),
    ])
      item.disabled = blocked;
    for (const item of [$("product-delete-close"), $("product-import-close")])
      item.disabled = state.busy;
    $("product-delete-confirm").disabled = state.busy;
    $("product-delete-confirm").textContent = state.busy
      ? "Confirmando…"
      : state.deletion?.payload
        ? "Reintentar misma eliminación"
        : "Eliminar producto";
    $("product-import-confirm").disabled = state.busy;
    $("product-import-confirm").textContent = state.busy
      ? "Importando…"
      : state.importPending
        ? "Reintentar mismo lote"
        : "Importar productos";
    $("pos-new-product").textContent = state.pending
      ? "Retomar producto pendiente"
      : "+ Agregar producto";
    $("pos-add-product").textContent = $("pos-new-product").textContent;
    importButton.textContent = state.importPending
      ? "Retomar importación"
      : "Importar JSON";
  }
  function setForm(p) {
    $("pos-product-code").value = p?.codigo || "";
    $("pos-product-code").required = !p || !!p.codigo;
    $("pos-product-name").value = p?.nombre || "";
    $("pos-product-price").value = p?.precio ?? "";
    $("pos-product-stock").value = p?.stock ?? "";
    $("product-cost").value = p?.costo ?? "";
    state.photo = p?.foto || "";
    $("product-photo-file").value = "";
    $("product-photo-status").textContent = "";
    preview();
  }
  function open(product = null) {
    if (state.user?.role !== "Admin" || state.busy) return;
    if (state.importPending) {
      openImport();
      return;
    }
    if (state.deletion?.payload) {
      openDelete();
      return;
    }
    esc("pos-product-error");
    state.conflict = false;
    if (state.pending) {
      const p = state.pending.payload;
      state.editing = p.id
        ? { id: p.id, version: p.expectedVersion, codigo: p.code }
        : null;
      setForm({
        codigo: p.code,
        nombre: p.name,
        precio: p.price,
        stock: p.stock,
        costo: p.cost,
        foto: p.photo,
      });
      esc(
        "pos-product-error",
        "Este guardado está por confirmar. Reintenta la misma operación.",
      );
    } else {
      state.editing = product;
      setForm(product);
    }
    $("pos-product-title").textContent = state.editing
      ? "Editar producto"
      : "Agregar producto";
    mode();
    if (!$("pos-product-dialog").open) $("pos-product-dialog").showModal();
  }
  async function save(event) {
    event.preventDefault();
    if (state.busy || state.photoBusy || state.user?.role !== "Admin") return;
    if (state.conflict) {
      const epoch = state.epoch,
        token = getSession()?.token,
        productId = state.editing?.id;
      await reload();
      if (!valid(epoch, token)) return;
      const fresh = state.products.find((p) => p.id === productId);
      if (!fresh) {
        $("pos-product-dialog").close();
        toast("El producto ya no está disponible.", true);
        return;
      }
      state.conflict = false;
      state.editing = fresh;
      setForm(fresh);
      mode();
      esc(
        "pos-product-error",
        "Datos actualizados. Revisa los valores antes de guardar.",
      );
      return;
    }
    esc("pos-product-error");
    if (!state.pending) {
      if (!$("pos-product-form").reportValidity()) return;
      const payload = {
        operation: id(),
        name: $("pos-product-name").value.trim(),
        code: $("pos-product-code").value.trim(),
        price: Number($("pos-product-price").value),
        stock: Number($("pos-product-stock").value),
        cost:
          $("product-cost").value === ""
            ? null
            : Number($("product-cost").value),
        photo: state.photo,
      };
      if (!payload.name) {
        esc("pos-product-error", "Escribe el nombre del producto.");
        return;
      }
      if (state.editing) {
        payload.id = state.editing.id;
        payload.expectedVersion = state.editing.version;
      }
      const pending = {
        action: state.editing ? "products.update" : "products.create",
        payload,
      };
      if (!store("product", pending)) {
        esc(
          "pos-product-error",
          "Permite el almacenamiento temporal del sitio antes de guardar.",
        );
        return;
      }
      state.pending = pending;
    }
    const epoch = state.epoch,
      token = getSession()?.token;
    state.busy = true;
    mode();
    try {
      const result = await api(
        state.pending.action || "products.create",
        state.pending.payload,
        token,
      );
      if (!valid(epoch, token)) return;
      if (!result?.product?.id)
        throw new Error(
          "No se pudo confirmar el resultado. Reintenta el mismo guardado.",
        );
      store("product", null);
      state.pending = null;
      $("pos-product-dialog").close();
      toast(
        result.deleted
          ? "El guardado anterior se confirmó; el producto ya fue eliminado."
          : state.editing
            ? "Producto actualizado."
            : "Producto agregado al catálogo.",
      );
      await reload();
    } catch (e) {
      if (!valid(epoch, token) || onAuthError(e)) return;
      if (rejected.has(e.code)) {
        store("product", null);
        state.pending = null;
        state.conflict = e.code === "PRODUCT_CHANGED";
      }
      esc(
        "pos-product-error",
        state.pending
          ? `${e.message} Reintenta el mismo guardado para comprobar el resultado.`
          : e.message,
      );
    } finally {
      if (valid(epoch, token)) {
        state.busy = false;
        mode();
      }
    }
  }
  function openDelete(product) {
    if (state.busy || state.user?.role !== "Admin") return;
    if (state.pending) {
      open();
      return;
    }
    if (state.importPending) {
      openImport();
      return;
    }
    if (!state.deletion?.payload) state.deletion = { product };
    const name =
      state.deletion.payload?.name || state.deletion.product?.nombre || "";
    $("product-delete-name").textContent = name;
    esc(
      "product-delete-error",
      state.deletion.payload
        ? "La eliminación está por confirmar. Reintenta la misma operación."
        : "",
    );
    mode();
    if (!$("product-delete-dialog").open)
      $("product-delete-dialog").showModal();
  }
  async function remove() {
    if (state.busy || !state.deletion || state.user?.role !== "Admin") return;
    if (!state.deletion.payload) {
      const p = state.deletion.product;
      const pending = {
        payload: {
          id: p.id,
          expectedVersion: p.version,
          operation: id(),
          name: p.nombre,
        },
      };
      if (!store("delete", pending)) {
        esc(
          "product-delete-error",
          "Permite el almacenamiento temporal del sitio antes de eliminar.",
        );
        return;
      }
      state.deletion = pending;
    }
    const epoch = state.epoch,
      token = getSession()?.token;
    state.busy = true;
    mode();
    esc("product-delete-error");
    try {
      const data = await api("products.delete", state.deletion.payload, token);
      if (!valid(epoch, token)) return;
      if (data?.deleted !== true)
        throw new Error("No se pudo confirmar la eliminación.");
      store("delete", null);
      state.deletion = null;
      $("product-delete-dialog").close();
      toast("Producto eliminado del catálogo.");
      await reload();
    } catch (e) {
      if (!valid(epoch, token) || onAuthError(e)) return;
      if (rejected.has(e.code)) {
        store("delete", null);
        state.deletion = null;
        $("product-delete-dialog").close();
        toast(e.message, true);
        await reload();
      } else
        esc(
          "product-delete-error",
          `${e.message} Reintenta la misma eliminación.`,
        );
    } finally {
      if (valid(epoch, token)) {
        state.busy = false;
        mode();
      }
    }
  }
  function openImport() {
    if (state.user?.role !== "Admin") return;
    if (!state.importPending && !state.batchRows) {
      file.click();
      return;
    }
    $("product-import-info").textContent = state.batchRows
      ? `${state.batchRows.length} productos en el archivo.`
      : "Hay un lote por confirmar. Al recuperarlo puedes volver a importar el archivo para continuar.";
    esc(
      "product-import-error",
      state.importPending
        ? "Reintenta este mismo lote para comprobar su resultado."
        : "",
    );
    mode();
    if (!$("product-import-dialog").open)
      $("product-import-dialog").showModal();
  }
  async function importBatch() {
    if (state.busy || state.user?.role !== "Admin") return;
    const epoch = state.epoch,
      token = getSession()?.token;
    state.busy = true;
    mode();
    esc("product-import-error");
    try {
      do {
        if (!state.importPending) {
          if (!state.batchRows || state.index >= state.batchRows.length) break;
          const pending = {
            payload: {
              operation: id(),
              products: state.batchRows.slice(state.index, state.index + 3),
            },
          };
          if (!store("import", pending))
            throw new Error(
              "Permite el almacenamiento temporal del sitio antes de importar.",
            );
          state.importPending = pending;
        }
        const result = await api(
          "products.import",
          state.importPending.payload,
          token,
        );
        if (!valid(epoch, token)) return;
        if (
          !Number.isInteger(result?.added) ||
          !Number.isInteger(result?.skipped)
        )
          throw new Error("No se pudo confirmar el lote.");
        state.index += state.importPending.payload.products.length;
        state.added += result.added;
        state.skipped += result.skipped;
        store("import", null);
        state.importPending = null;
        $("product-import-progress").textContent =
          `${state.added} agregados · ${state.skipped} omitidos`;
      } while (state.batchRows && state.index < state.batchRows.length);
      state.batchRows = null;
      $("product-import-dialog").close();
      toast(
        `Importación confirmada: ${state.added} agregados y ${state.skipped} omitidos.`,
      );
      await reload();
    } catch (e) {
      if (!valid(epoch, token) || onAuthError(e)) return;
      if (rejected.has(e.code) && state.importPending) {
        store("import", null);
        state.importPending = null;
        state.batchRows = null;
      }
      esc(
        "product-import-error",
        `${e.message}${state.importPending ? " Reintenta el mismo lote." : ""}`,
      );
    } finally {
      if (valid(epoch, token)) {
        state.busy = false;
        mode();
      }
    }
  }
  $("product-photo-file").addEventListener("change", async (event) => {
    const chosen = event.target.files[0];
    if (!chosen) return;
    const epoch = state.epoch;
    state.photoBusy = true;
    mode();
    $("product-photo-status").textContent = "Preparando foto…";
    try {
      const image = await productPhoto(chosen);
      if (epoch !== state.epoch) return;
      state.photo = image;
      preview();
      $("product-photo-status").textContent = "Foto lista para guardar.";
    } catch (e) {
      if (epoch === state.epoch) esc("pos-product-error", e.message);
    } finally {
      if (epoch === state.epoch) {
        state.photoBusy = false;
        mode();
      }
    }
  });
  $("product-photo-remove").addEventListener("click", () => {
    state.photo = "";
    $("product-photo-file").value = "";
    $("product-photo-status").textContent = "";
    preview();
  });
  $("product-list").addEventListener("click", (event) => {
    const button = event.target.closest(
      "[data-product-edit],[data-product-delete]",
    );
    if (!button || state.busy) return;
    const p = state.products.find(
      (p) =>
        p.id === (button.dataset.productEdit || button.dataset.productDelete),
    );
    if (p) button.dataset.productEdit ? open(p) : openDelete(p);
  });
  importButton.addEventListener("click", () => {
    if (state.pending) open();
    else if (state.deletion?.payload) openDelete();
    else openImport();
  });
  file.addEventListener("change", async () => {
    const chosen = file.files[0];
    file.value = "";
    if (!chosen) return;
    const epoch = state.epoch;
    if (chosen.size > 30 * 1024 * 1024) {
      toast("El archivo debe pesar menos de 30 MB.", true);
      return;
    }
    state.busy = true;
    mode();
    try {
      const data = JSON.parse(await chosen.text());
      if (
        !Array.isArray(data.productos) ||
        !data.productos.length ||
        data.productos.length > 1000
      )
        throw new Error(
          "El JSON debe contener productos: entre 1 y 1000 registros.",
        );
      const rows = [];
      for (let i = 0; i < data.productos.length; i++) {
        const p = data.productos[i];
        const validAmount = (n) =>
          Number.isFinite(n) &&
          n >= 0 &&
          n <= 10000000 &&
          Math.abs(n * 100 - Math.round(n * 100)) < 0.00001;
        if (
          !p ||
          !String(p.nombre || "").trim() ||
          String(p.nombre).trim().length > 120 ||
          String(p.codigo || "").length > 100 ||
          /[\u0000-\u001f\u007f]/.test(
            String(p.nombre) + String(p.codigo || ""),
          ) ||
          !validAmount(Number(p.precio)) ||
          !Number.isInteger(Number(p.stock)) ||
          Number(p.stock) < 0 ||
          Number(p.stock) > 1000000 ||
          (p.costo != null && p.costo !== "" && !validAmount(Number(p.costo)))
        )
          throw new Error(`Revisa el producto ${i + 1} del archivo.`);
        rows.push({
          name: String(p.nombre).trim(),
          code: String(p.codigo || ""),
          price: Number(p.precio),
          stock: Number(p.stock),
          cost: p.costo == null || p.costo === "" ? null : Number(p.costo),
          photo: await importPhoto(p.foto),
        });
        if (epoch !== state.epoch) return;
      }
      state.batchRows = rows;
      state.index = state.added = state.skipped = 0;
      $("product-import-progress").textContent = "";
      openImport();
    } catch (e) {
      if (epoch === state.epoch)
        toast(e.message || "No se pudo leer el archivo JSON.", true);
    } finally {
      if (epoch === state.epoch) {
        state.busy = false;
        mode();
      }
    }
  });
  $("product-delete-confirm").addEventListener("click", remove);
  $("product-import-confirm").addEventListener("click", importBatch);
  for (const [button, dialog] of [
    ["product-delete-close", "product-delete-dialog"],
    ["product-import-close", "product-import-dialog"],
  ])
    $(button).addEventListener("click", () => {
      if (!state.busy) $(dialog).close();
    });
  for (const dialog of [
    $("pos-product-dialog"),
    $("product-delete-dialog"),
    $("product-import-dialog"),
  ])
    dialog.addEventListener("cancel", (e) => {
      if (state.busy || state.photoBusy) e.preventDefault();
    });
  return {
    open,
    save,
    start(user) {
      state.user = user;
      state.epoch++;
      state.pending = restore("product");
      state.deletion = restore("delete");
      state.importPending = restore("import");
      importButton.hidden = header.hidden = user.role !== "Admin";
      mode();
    },
    reset() {
      state.epoch++;
      Object.assign(state, {
        user: null,
        products: [],
        editing: null,
        photo: "",
        pending: null,
        deletion: null,
        importPending: null,
        batchRows: null,
        index: 0,
        added: 0,
        skipped: 0,
        busy: false,
        photoBusy: false,
        conflict: false,
      });
      $("product-delete-dialog").close();
      $("product-import-dialog").close();
      setForm(null);
      $("product-delete-name").textContent = "";
      $("product-import-info").textContent = "";
      $("product-import-progress").textContent = "";
      esc("product-delete-error");
      esc("product-import-error");
    },
    setProducts(products) {
      state.products = products;
    },
    decorateRow(row, product) {
      const cell = document.createElement("td");
      cell.className = "inventory-actions";
      cell.hidden = state.user?.role !== "Admin";
      for (const action of ["edit", "delete"]) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "button button-text";
        button.textContent = action === "edit" ? "Editar" : "Eliminar";
        button.dataset[action === "edit" ? "productEdit" : "productDelete"] =
          product.id;
        button.setAttribute(
          "aria-label",
          `${button.textContent} ${product.nombre}`,
        );
        cell.append(button);
      }
      row.append(cell);
    },
  };
}
