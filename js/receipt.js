// Ticket de 58/80 mm y PDF. La impresora directa se incorpora en la etapa 5.
const PDF_URL =
  "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js";
const PDF_SRI =
  "sha384-weMABwrltA6jWR8DDe9Jp5blk+tZQh7ugpCsF3JwSA53WZM9/14PjS5LAJNHNjAI";
const BUSINESS = {
  name: "COMERCIAL J&N",
  ruc: "10276754128",
  address: "Asociación Familiar La Fontana de Carabayllo",
};
let libraryPromise;
function pdfLibrary() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  if (libraryPromise) return libraryPromise;
  libraryPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      script.onload = script.onerror = null;
      if (error) {
        script.remove();
        libraryPromise = null;
        reject(error);
      } else resolve(window.PDFLib);
    };
    const timeout = setTimeout(
      () =>
        finish(
          new Error(
            "No se pudo preparar el PDF. Usa Imprimir y Guardar como PDF.",
          ),
        ),
      15000,
    );
    script.src = PDF_URL;
    script.integrity = PDF_SRI;
    script.crossOrigin = "anonymous";
    script.referrerPolicy = "no-referrer";
    script.onload = () =>
      finish(window.PDFLib ? null : new Error("No se pudo preparar el PDF."));
    script.onerror = () =>
      finish(new Error("No se pudo descargar la herramienta de PDF."));
    document.head.append(script);
  });
  return libraryPromise;
}
const logoUrl = new URL("../assets/logo.png", import.meta.url).href;
let logoPromise;
function monochromeLogo() {
  if (logoPromise) return logoPromise;
  logoPromise = (async () => {
    let url;
    try {
      const response = await fetch(logoUrl);
      if (!response.ok) return null;
      url = URL.createObjectURL(await response.blob());
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 300;
      canvas.height = Math.max(
        1,
        Math.round((300 * image.naturalHeight) / image.naturalWidth),
      );
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.filter = "grayscale(1) contrast(1.8)";
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      return new Uint8Array(
        await (await fetch(canvas.toDataURL("image/jpeg", 0.9))).arrayBuffer(),
      );
    } catch {
      return null;
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  })();
  return logoPromise;
}
const value = (n) => (Number(n) || 0).toFixed(2);
const money = (n) => `S/ ${value(n)}`;
const saleNumber = (sale) => String(sale.nro).padStart(6, "0");
function summary(sale) {
  const lines = sale.lineas || [];
  const subtotal =
    sale.subtotal ??
    lines.reduce((sum, line) => sum + Number(line.sub || 0), 0);
  const discount = sale.descuento ?? Math.max(0, subtotal - Number(sale.total));
  const rows = [["Subtotal", money(subtotal)]];
  if (Number(discount) > 0) rows.push(["Descuento", money(discount)]);
  rows.push(["TOTAL", money(sale.total)], ["Pago", sale.medio]);
  if (sale.medio === "Efectivo" && sale.recibido != null)
    rows.push(
      ["Recibido", money(sale.recibido)],
      ["Vuelto", money(sale.vuelto)],
    );
  return rows;
}
export async function buildReceiptPdf(sale, paper = 58) {
  const lib = await pdfLibrary(),
    doc = await lib.PDFDocument.create();
  const font = await doc.embedFont(lib.StandardFonts.Helvetica),
    bold = await doc.embedFont(lib.StandardFonts.HelveticaBold);
  // Los tipos estándar de PDF cubren español; los símbolos ajenos se sustituyen.
  const clean = (text) =>
    Array.from(String(text ?? ""))
      .map((char) => {
        try {
          font.encodeText(char);
          return char;
        } catch {
          return "?";
        }
      })
      .join("");
  const width = Number(paper) === 80 ? (80 * 72) / 25.4 : (58 * 72) / 25.4,
    margin = 8,
    usable = width - margin * 2,
    actions = [];
  let y = 8;
  function wrap(text, size, available, face = font) {
    const result = [];
    let line = "";
    for (const word of clean(text).split(/\s+/)) {
      const combined = line ? `${line} ${word}` : word;
      if (face.widthOfTextAtSize(combined, size) <= available) {
        line = combined;
        continue;
      }
      if (line) {
        result.push(line);
        line = "";
      }
      for (const char of word) {
        if (line && face.widthOfTextAtSize(line + char, size) > available) {
          result.push(line);
          line = "";
        }
        line += char;
      }
    }
    if (line || !result.length) result.push(line);
    return result;
  }
  function text(content, { size = 8, strong = false, center = false } = {}) {
    const face = strong ? bold : font;
    for (const line of wrap(content, size, usable, face)) {
      actions.push({
        text: line,
        x: center ? (width - face.widthOfTextAtSize(line, size)) / 2 : margin,
        y,
        size,
        face,
      });
      y += size + 3;
    }
  }
  function rule() {
    y += 4;
    actions.push({ rule: true, y });
    y += 6;
  }
  const logo = await monochromeLogo();
  if (logo) {
    const image = await doc.embedJpg(logo),
      imageWidth = 64,
      imageHeight = Math.min(90, (imageWidth * image.height) / image.width);
    actions.push({
      image,
      x: (width - imageWidth) / 2,
      y,
      w: imageWidth,
      h: imageHeight,
    });
    y += imageHeight + 5;
  }
  text(BUSINESS.name, { size: 10, strong: true, center: true });
  text(`RUC ${BUSINESS.ruc}`, { center: true });
  text(BUSINESS.address, { size: 7, center: true });
  rule();
  text(`COMPROBANTE N.º ${saleNumber(sale)}`, { strong: true, center: true });
  text(sale.fecha, { center: true });
  text(`Cliente: ${sale.cliente || "Público general"}`);
  if (sale.doc)
    text(`${String(sale.doc).length === 11 ? "RUC" : "DNI"}: ${sale.doc}`);
  text(`Cajero: ${sale.vendedor || "—"}`);
  rule();
  const xs = [margin, margin + 18, width - margin - 62, width - margin - 30],
    widths = [15, usable - 83, 29, 30];
  function row(cells, strong = false) {
    const face = strong ? bold : font,
      size = 7;
    const wrapped = cells.map((cell, i) => wrap(cell, size, widths[i], face));
    const height = Math.max(...wrapped.map((v) => v.length)) * 10;
    wrapped.forEach((lines, i) =>
      lines.forEach((line, j) =>
        actions.push({
          text: line,
          x:
            i >= 2
              ? xs[i] + widths[i] - face.widthOfTextAtSize(line, size)
              : xs[i],
          y: y + j * 10,
          size,
          face,
        }),
      ),
    );
    y += height + 3;
  }
  row(["Cnt.", "Producto", "P.U.", "Total"], true);
  for (const line of sale.lineas || [])
    row([String(line.cant), line.nombre, value(line.precio), value(line.sub)]);
  rule();
  for (const [label, amount] of summary(sale))
    text(`${label}: ${amount}`, {
      size: label === "TOTAL" ? 10 : 8,
      strong: label === "TOTAL",
    });
  rule();
  text("¡GRACIAS POR SU COMPRA!", { size: 9, strong: true, center: true });
  text("Importes expresados en soles (S/).", { size: 6, center: true });
  const height = y + 10,
    page = doc.addPage([width, height]);
  for (const action of actions) {
    if (action.rule)
      page.drawLine({
        start: { x: margin, y: height - action.y },
        end: { x: width - margin, y: height - action.y },
        thickness: 0.5,
      });
    else if (action.image)
      page.drawImage(action.image, {
        x: action.x,
        y: height - action.y - action.h,
        width: action.w,
        height: action.h,
      });
    else
      page.drawText(action.text, {
        x: action.x,
        y: height - action.y - action.size,
        size: action.size,
        font: action.face,
      });
  }
  doc.setTitle(`Comprobante ${saleNumber(sale)} - ${BUSINESS.name}`);
  doc.setAuthor(BUSINESS.name);
  return new File([await doc.save()], `JN-${saleNumber(sale)}.pdf`, {
    type: "application/pdf",
  });
}
export function createReceipt({ toast }) {
  const $ = (id) => document.getElementById(id),
    dialog = $("pos-receipt");
  let sale = null,
    file = null,
    generation = 0,
    preparing = false;
  let paper = "58";
  try {
    if (localStorage.getItem("jn_receipt_width") === "80") paper = "80";
  } catch {}
  const actions = document.createElement("div");
  actions.className = "receipt-actions";
  actions.innerHTML = `<label for="receipt-paper">Ancho del ticket</label><select id="receipt-paper" class="pos-input"><option value="58">58 mm</option><option value="80">80 mm</option></select><div class="receipt-buttons"><button id="receipt-print" class="button button-secondary" type="button">Imprimir</button><button id="receipt-share" class="button button-primary" type="button">Compartir / PDF</button></div><p id="receipt-pdf-status" class="pos-hint" role="status"></p>`;
  const ticket = document.createElement("article");
  ticket.id = "receipt-ticket";
  ticket.className = "jn-ticket";
  dialog.insertBefore(actions, $("pos-new-sale"));
  dialog.insertBefore(ticket, actions);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "icon-button";
  close.textContent = "✕";
  close.setAttribute("aria-label", "Cerrar comprobante");
  close.addEventListener("click", () => dialog.close());
  dialog.querySelector(".pos-dialog-head").append(close);
  $("receipt-paper").value = paper;
  function node(tag, text, className) {
    const item = document.createElement(tag);
    if (text != null) item.textContent = String(text);
    if (className) item.className = className;
    return item;
  }
  function render() {
    ticket.replaceChildren();
    ticket.style.width = `${paper}mm`;
    const logo = document.createElement("img");
    logo.src = logoUrl;
    logo.alt = "Logo de COMERCIAL J&N";
    logo.className = "receipt-logo";
    logo.addEventListener(
      "error",
      () => {
        logo.hidden = true;
      },
      { once: true },
    );
    ticket.append(
      logo,
      node("h2", BUSINESS.name),
      node("p", `RUC ${BUSINESS.ruc}`),
      node("p", BUSINESS.address),
      node("hr"),
      node("h3", `COMPROBANTE N.º ${saleNumber(sale)}`),
      node("p", sale.fecha),
      node("hr"),
    );
    const details = node("div", null, "receipt-details");
    details.append(node("p", `Cliente: ${sale.cliente || "Público general"}`));
    if (sale.doc)
      details.append(
        node(
          "p",
          `${String(sale.doc).length === 11 ? "RUC" : "DNI"}: ${sale.doc}`,
        ),
      );
    details.append(node("p", `Cajero: ${sale.vendedor || "—"}`));
    ticket.append(details, node("hr"));
    const table = node("table"),
      thead = node("thead"),
      heading = node("tr");
    for (const label of ["Cant.", "Producto", "P.U.", "Total"])
      heading.append(node("th", label));
    thead.append(heading);
    table.append(thead);
    const body = node("tbody");
    for (const line of sale.lineas || []) {
      const row = node("tr");
      for (const content of [
        line.cant,
        line.nombre,
        value(line.precio),
        value(line.sub),
      ])
        row.append(node("td", content));
      body.append(row);
    }
    table.append(body);
    ticket.append(table, node("hr"));
    const totals = node("dl", null, "receipt-totals");
    for (const [label, amount] of summary(sale)) {
      const term = node("dt", label),
        def = node("dd", amount);
      if (label === "TOTAL") term.className = def.className = "receipt-grand";
      totals.append(term, def);
    }
    ticket.append(
      totals,
      node("hr"),
      node("p", "¡GRACIAS POR SU COMPRA!", "receipt-thanks"),
      node("p", "Importes expresados en soles (S/)."),
    );
  }
  async function prepare() {
    const current = ++generation,
      currentSale = sale,
      currentPaper = paper;
    file = null;
    preparing = true;
    $("receipt-share").disabled = true;
    $("receipt-pdf-status").textContent = "Preparando PDF…";
    try {
      const result = await buildReceiptPdf(currentSale, Number(currentPaper));
      if (current !== generation) return;
      file = result;
      $("receipt-share").textContent = "Compartir / PDF";
      $("receipt-pdf-status").textContent =
        "PDF listo para compartir o descargar.";
    } catch {
      if (current !== generation) return;
      $("receipt-share").textContent = "Guardar como PDF";
      $("receipt-pdf-status").textContent =
        "Puedes guardar el comprobante como PDF desde Imprimir.";
    } finally {
      if (current === generation) {
        preparing = false;
        $("receipt-share").disabled = false;
      }
    }
  }
  function cleanPrint() {
    document.getElementById("jn-print-root")?.remove();
    document.body.classList.remove("jn-printing");
  }
  function print() {
    if (!sale) return;
    cleanPrint();
    const root = document.createElement("div");
    root.id = "jn-print-root";
    const clone = ticket.cloneNode(true);
    clone.removeAttribute("id");
    root.append(clone);
    root.style.setProperty("--ticket-width", `${paper}mm`);
    document.body.append(root);
    document.body.classList.add("jn-printing");
    try {
      window.print();
    } catch {
      cleanPrint();
      toast("No se pudo abrir la impresión en este navegador.", true);
    }
  }
  window.addEventListener("afterprint", cleanPrint);
  $("receipt-print").addEventListener("click", print);
  $("receipt-paper").addEventListener("change", () => {
    paper = $("receipt-paper").value === "80" ? "80" : "58";
    try {
      localStorage.setItem("jn_receipt_width", paper);
    } catch {}
    if (sale) {
      render();
      void prepare();
    }
  });
  $("receipt-share").addEventListener("click", async () => {
    if (!sale || preparing) return;
    if (!file) {
      toast("En la impresión elige Guardar como PDF.");
      print();
      return;
    }
    const sharedFile = file;
    try {
      if (navigator.canShare?.({ files: [sharedFile] }) && navigator.share) {
        await navigator.share({
          files: [sharedFile],
          title: `Comprobante J&N ${saleNumber(sale)}`,
        });
        return;
      }
    } catch (error) {
      if (error.name === "AbortError") return;
    }
    const url = URL.createObjectURL(sharedFile),
      anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = sharedFile.name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast("Se inició la descarga del comprobante PDF.");
  });
  return {
    show(value, { historical = false } = {}) {
      sale = value;
      $("pos-success-title").textContent = historical
        ? "Comprobante de venta"
        : "¡Venta registrada!";
      $("pos-new-sale").hidden = historical;
      for (const selector of [
        ".pos-success-mark",
        "#pos-receipt > .pos-hint",
        "#pos-sale-number",
        "#pos-sale-date",
        "#pos-sale-lines",
        "#pos-sale-summary",
      ])
        dialog.querySelectorAll(selector).forEach((element) => {
          element.hidden = true;
        });
      render();
      void prepare();
      if (!dialog.open) dialog.showModal();
    },
    reset() {
      generation++;
      sale = file = null;
      preparing = false;
      ticket.replaceChildren();
      $("receipt-pdf-status").textContent = "";
      cleanPrint();
      if (dialog.open) dialog.close();
    },
  };
}
