// Lector de barras para páginas HTTPS. ZXing se descarga solo al abrir la cámara.
const ZXING_URL =
  "https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/zxing-browser.min.js";
const ZXING_INTEGRITY =
  "sha384-ylLhng89kD62+PVK1cjm4rAYg69zDlGrbbSfAE2Eb8Xqf8RoAQCMcRoUXZh7pAPC";
const NATIVE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];
// Valores de BarcodeFormat en la versión fijada de ZXing: Code128, EAN8/13, UPC-A/E.
const ZXING_FORMATS = [4, 6, 7, 14, 15];
let libraryPromise = null;
let active = null;

function loadLibrary() {
  if (window.ZXingBrowser?.BrowserMultiFormatReader)
    return Promise.resolve(window.ZXingBrowser);
  if (libraryPromise) return libraryPromise;
  libraryPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
      if (error) {
        script.remove();
        libraryPromise = null;
        reject(error);
      } else resolve(window.ZXingBrowser);
    };
    const timeout = window.setTimeout(
      () =>
        finish(
          new Error(
            "El lector tardó demasiado en cargar. Usa la búsqueda manual e intenta escanear de nuevo con internet.",
          ),
        ),
      15000,
    );
    script.src = ZXING_URL;
    script.integrity = ZXING_INTEGRITY;
    script.crossOrigin = "anonymous";
    script.referrerPolicy = "no-referrer";
    script.onload = () =>
      finish(
        window.ZXingBrowser?.BrowserMultiFormatReader
          ? null
          : new Error("No se pudo preparar el lector. Usa la búsqueda manual."),
      );
    script.onerror = () =>
      finish(
        new Error(
          "No se pudo descargar el lector. Revisa tu conexión o usa la búsqueda manual.",
        ),
      );
    document.head.append(script);
  });
  return libraryPromise;
}

function stopTracks(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

function cameraError(error) {
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
    return "No se permitió usar la cámara. Puedes habilitarla en los permisos del navegador o buscar el producto por nombre o código.";
  }
  if (
    error?.name === "NotFoundError" ||
    error?.name === "DevicesNotFoundError"
  ) {
    return "No encontramos una cámara. Escribe el código o busca el producto por nombre.";
  }
  if (error?.name === "NotReadableError" || error?.name === "TrackStartError") {
    return "No se pudo abrir la cámara. Cierra otras aplicaciones que la estén usando o utiliza la búsqueda manual.";
  }
  return (
    error?.message || "No se pudo iniciar la cámara. Usa la búsqueda manual."
  );
}

function installStyles() {
  if (document.getElementById("jn-scanner-styles")) return;
  const style = document.createElement("style");
  style.id = "jn-scanner-styles";
  style.textContent = `
    .jn-scanner{border:0;border-radius:20px;padding:0;width:min(94vw,540px);max-height:94dvh;overflow:auto;color:#18334b;background:white;box-shadow:0 24px 80px #0d3b6655}
    .jn-scanner::backdrop{background:#0d263fbd;backdrop-filter:blur(3px)}
    .jn-scanner-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:20px 22px}
    .jn-scanner-head h2{font-size:20px;font-weight:700;line-height:1.3;margin:0}
    .jn-scanner-close{border:0;background:#f0f4f8;border-radius:10px;width:42px;height:42px;color:#0d3b66;font-size:25px;cursor:pointer}
    .jn-scanner-preview{position:relative;background:#10263a;aspect-ratio:4/3;overflow:hidden}
    .jn-scanner video{display:block;width:100%;height:100%;object-fit:cover}
    .jn-scanner-guide{position:absolute;inset:27% 8%;border:2px solid #e4a514;border-radius:12px;pointer-events:none;box-shadow:0 0 0 100vmax #0003}
    .jn-scanner-body{padding:20px 22px 22px;font-size:14px;line-height:1.6}
    .jn-scanner-status{margin:0 0 12px;color:#405b73;min-height:44px}
    .jn-scanner-status.is-error{color:#a43838}
    .jn-scanner-hint{color:#5d6d80;margin:0 0 18px;font-size:13px}
    .jn-scanner-manual{width:100%;min-height:48px;padding:12px;border:1px solid #dfe7f0;border-radius:11px;background:#f6f8fb;color:#0d3b66;font-weight:700;cursor:pointer}
    .jn-scanner button:focus-visible{outline:3px solid #1a5b9c;outline-offset:3px}
    @media(max-width:540px){.jn-scanner{width:calc(100vw - 20px)}.jn-scanner-head,.jn-scanner-body{padding-left:18px;padding-right:18px}}
  `;
  document.head.append(style);
}

function notify(session, message, isError = false) {
  if (!session.alive) return;
  session.status.textContent = message;
  session.status.classList.toggle("is-error", isError);
  if (isError) {
    try {
      session.onMessage?.(message, true);
    } catch {
      /* El aviso no debe detener la limpieza. */
    }
  }
}

function detected(session, text, format, native) {
  if (!session.alive) return;
  const compatible = native
    ? NATIVE_FORMATS.includes(format)
    : ZXING_FORMATS.includes(format);
  if (!compatible) return;
  const code = String(text || "").trim();
  if (!code || code.length > 100 || /[\u0000-\u001f\u007f]/.test(code)) return;
  session.finish(code);
  const formatName = native
    ? format
    : { 4: "code_128", 6: "ean_8", 7: "ean_13", 14: "upc_a", 15: "upc_e" }[
        format
      ];
  try {
    session.onDetected?.(code, { format: formatName });
  } catch {
    /* La promesa ya entrega la lectura. */
  }
}

async function startZxing(session) {
  notify(
    session,
    "Preparando el lector… Mantén el código dentro del recuadro.",
  );
  const library = await loadLibrary();
  if (!session.alive) return;
  const reader = new library.BrowserMultiFormatReader(new Map(), {
    delayBetweenScanAttempts: 120,
    delayBetweenScanSuccess: 200,
  });
  reader.possibleFormats = ZXING_FORMATS;
  const controls = await reader.decodeFromStream(
    session.stream,
    session.video,
    (result, error, callbackControls) => {
      if (!session.alive) {
        try {
          callbackControls?.stop();
        } catch {
          /* Ya estaba cerrado. */
        }
        return;
      }
      if (callbackControls) session.controls = callbackControls;
      if (result)
        detected(session, result.getText(), result.getBarcodeFormat(), false);
      // No encontrar un código o fallar su suma de control es normal entre fotogramas.
    },
  );
  if (!session.alive) {
    try {
      controls?.stop();
    } catch {
      /* Cancelado durante la preparación. */
    }
    stopTracks(session.stream);
    return;
  }
  session.controls = controls;
  notify(
    session,
    "Apunta al código de barras. La cámara se cerrará al leer un producto.",
  );
}

async function startNative(session, Detector) {
  const detector = new Detector({ formats: NATIVE_FORMATS });
  let failures = 0;
  const tick = async () => {
    if (!session.alive) return;
    try {
      if (session.video.readyState >= 2) {
        const results = await detector.detect(session.video);
        failures = 0;
        for (const result of results) {
          detected(session, result.rawValue, result.format, true);
          if (!session.alive) return;
        }
      }
    } catch {
      failures += 1;
      if (failures >= 4) {
        try {
          await startZxing(session);
        } catch (error) {
          fail(session, error);
        }
        return;
      }
    }
    if (session.alive) session.timer = window.setTimeout(tick, 150);
  };
  notify(
    session,
    "Apunta al código de barras. La cámara se cerrará al leer un producto.",
  );
  void tick();
}

function fail(session, error) {
  if (!session.alive) return;
  window.clearTimeout(session.timer);
  try {
    session.controls?.stop();
  } catch {
    /* Limpieza incluso si el lector falló. */
  }
  stopTracks(session.stream);
  session.video.srcObject = null;
  notify(session, cameraError(error), true);
}

async function start(session) {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "La cámara necesita abrirse desde la dirección HTTPS de tu aplicación. También puedes escribir el código manualmente.",
    );
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });
  if (!session.alive) {
    stopTracks(stream);
    return;
  }
  session.stream = stream;
  session.video.srcObject = stream;
  await session.video.play();
  if (!session.alive) return;

  let Detector = null;
  try {
    if (
      typeof window.BarcodeDetector === "function" &&
      typeof window.BarcodeDetector.getSupportedFormats === "function"
    ) {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      if (NATIVE_FORMATS.every((format) => supported.includes(format)))
        Detector = window.BarcodeDetector;
    }
  } catch {
    /* ZXing cubre navegadores sin detección nativa. */
  }
  if (!session.alive) return;
  if (Detector) {
    try {
      await startNative(session, Detector);
    } catch {
      await startZxing(session);
    }
  } else await startZxing(session);
}

// Se resuelve una sola vez: texto leído o null al cerrar. onDetected es opcional;
// el consumidor debe usar el callback O el retorno, nunca ambos para sumar al carrito.
export function scanBarcode({ onDetected, onMessage } = {}) {
  stopScanner();
  installStyles();
  const trigger = document.activeElement;
  const dialog = document.createElement("dialog");
  dialog.className = "jn-scanner";
  dialog.setAttribute("aria-labelledby", "jn-scanner-title");
  dialog.setAttribute("aria-describedby", "jn-scanner-status");
  // Plantilla fija; los códigos y mensajes se asignan siempre con textContent.
  dialog.innerHTML = `
    <div class="jn-scanner-head"><h2 id="jn-scanner-title">Escanear producto</h2><button type="button" class="jn-scanner-close" aria-label="Cerrar cámara">×</button></div>
    <div class="jn-scanner-preview"><video muted playsinline aria-label="Vista de la cámara"></video><div class="jn-scanner-guide" aria-hidden="true"></div></div>
    <div class="jn-scanner-body"><p id="jn-scanner-status" class="jn-scanner-status" role="status" aria-live="polite">Solicitando acceso a la cámara…</p><p class="jn-scanner-hint">Acerca el código EAN, UPC o Code128, evita reflejos y mantén el teléfono firme.</p><button type="button" class="jn-scanner-manual">Usar búsqueda manual</button></div>
  `;
  document.body.append(dialog);
  const promise = new Promise((resolve) => {
    const session = {
      alive: true,
      dialog,
      video: dialog.querySelector("video"),
      status: dialog.querySelector(".jn-scanner-status"),
      stream: null,
      controls: null,
      timer: null,
      onDetected,
      onMessage,
      finish(value) {
        if (!session.alive) return;
        session.alive = false;
        window.clearTimeout(session.timer);
        try {
          session.controls?.stop();
        } catch {
          /* Siempre detener los tracks. */
        }
        stopTracks(session.stream);
        session.video.pause();
        session.video.srcObject = null;
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("pagehide", onPageHide);
        if (dialog.open) dialog.close();
        dialog.remove();
        if (active === session) active = null;
        if (trigger?.isConnected && !document.hidden)
          trigger.focus({ preventScroll: true });
        resolve(value);
      },
    };
    const onVisibility = () => {
      if (document.hidden) session.finish(null);
    };
    const onPageHide = () => session.finish(null);
    active = session;
    dialog
      .querySelector(".jn-scanner-close")
      .addEventListener("click", () => session.finish(null));
    dialog
      .querySelector(".jn-scanner-manual")
      .addEventListener("click", () => session.finish(null));
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      session.finish(null);
    });
    dialog.addEventListener("close", () => session.finish(null));
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    try {
      dialog.showModal();
      void start(session).catch((error) => fail(session, error));
    } catch (error) {
      session.finish(null);
      try {
        onMessage?.(
          "Tu navegador no pudo abrir el lector. Usa la búsqueda manual.",
          true,
        );
      } catch {
        /* Aviso opcional. */
      }
    }
  });
  return promise;
}

export function stopScanner() {
  active?.finish(null);
}
