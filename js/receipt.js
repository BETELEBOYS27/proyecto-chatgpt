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
      } else {
        resolve(window.PDFLib);
      }
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

// Logo completo incorporado: no necesita descargar ni subir un PNG.
const logoUrl = "data:image/png;base64," + [
  "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".replace("n d", "nd"),
  "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",
].join("");

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

  if (sale.medio === "Efectivo" && sale.recibido != null) {
    rows.push(
      ["Recibido", money(sale.recibido)],
      ["Vuelto", money(sale.vuelto)],
    );
  }

  return rows;
}

export async function buildReceiptPdf(sale, paper = 58) {
  const lib = await pdfLibrary();
  const doc = await lib.PDFDocument.create();

  const font = await doc.embedFont(lib.StandardFonts.Helvetica);
  const bold = await doc.embedFont(lib.StandardFonts.HelveticaBold);

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

  const width = Number(paper) === 80 ? (80 * 72) / 25.4 : (58 * 72) / 25.4;
  const margin = 8;
  const usable = width - margin * 2;
  const actions = [];
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
    const image = await doc.embedJpg(logo);
    const imageWidth = 64;
    const imageHeight = Math.min(90, (imageWidth * image.height) / image.width);

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

  if (sale.doc) {
    text(`${String(sale.doc).length === 11 ? "RUC" : "DNI"}: ${sale.doc}`);
  }

  text(`Cajero: ${sale.vendedor || "—"}`);
  rule();

  const xs = [margin, margin + 18, width - margin - 62, width - margin - 30];
  const widths = [15, usable - 83, 29, 30];

  function row(cells, strong = false) {
    const face = strong ? bold : font;
    const size = 7;
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

  for (const line of sale.lineas || []) {
    row([String(line.cant), line.nombre, value(line.precio), value(line.sub)]);
  }

  rule();

  for (const [label, amount] of summary(sale)) {
    text(`${label}: ${amount}`, {
      size: label === "TOTAL" ? 10 : 8,
      strong: label === "TOTAL",
    });
  }

  rule();
  text("¡GRACIAS POR SU COMPRA!", { size: 9, strong: true, center: true });
  text("Importes expresados en soles (S/).", { size: 6, center: true });

  const height = y + 10;
  const page = doc.addPage([width, height]);

  for (const action of actions) {
    if (action.rule) {
      page.drawLine({
        start: { x: margin, y: height - action.y },
        end: { x: width - margin, y: height - action.y },
        thickness: 0.5,
      });
    } else if (action.image) {
      page.drawImage(action.image, {
        x: action.x,
        y: height - action.y - action.h,
        width: action.w,
        height: action.h,
      });
    } else {
      page.drawText(action.text, {
        x: action.x,
        y: height - action.y - action.size,
        size: action.size,
        font: action.face,
      });
    }
  }

  doc.setTitle(`Comprobante ${saleNumber(sale)} - ${BUSINESS.name}`);
  doc.setAuthor(BUSINESS.name);

  return new File([await doc.save()], `JN-${saleNumber(sale)}.pdf`, {
    type: "application/pdf",
  });
}

export function createReceipt({ toast }) {
  document.querySelectorAll("[data-brand] img").forEach((img) => {
    img.src = logoUrl;
  });

  const $ = (id) => document.getElementById(id);
  const dialog = $("pos-receipt");

  let sale = null;
  let file = null;
  let generation = 0;
  let preparing = false;
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

    if (sale.doc) {
      details.append(
        node(
          "p",
          `${String(sale.doc).length === 11 ? "RUC" : "DNI"}: ${sale.doc}`,
        ),
      );
    }

    details.append(node("p", `Cajero: ${sale.vendedor || "—"}`));
    ticket.append(details, node("hr"));

    const table = node("table");
    const thead = node("thead");
    const heading = node("tr");

    for (const label of ["Cant.", "Producto", "P.U.", "Total"]) {
      heading.append(node("th", label));
    }

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
      ]) {
        row.append(node("td", content));
      }

      body.append(row);
    }

    table.append(body);
    ticket.append(table, node("hr"));

    const totals = node("dl", null, "receipt-totals");

    for (const [label, amount] of summary(sale)) {
      const term = node("dt", label);
      const def = node("dd", amount);

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
    const current = ++generation;
    const currentSale = sale;
    const currentPaper = paper;

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

    const url = URL.createObjectURL(sharedFile);
    const anchor = document.createElement("a");
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
      ]) {
        dialog.querySelectorAll(selector).forEach((element) => {
          element.hidden = true;
        });
      }

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
