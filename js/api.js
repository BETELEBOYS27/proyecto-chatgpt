import { CONFIG } from "./config.js";

export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

export function isApiConfigured() {
  try {
    const url = new URL(CONFIG.API_URL);
    return (
      url.protocol === "https:" &&
      url.hostname === "script.google.com" &&
      /^\/macros\/s\/[^/]+\/exec$/.test(url.pathname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

// Envía JSON como text/plain para evitar la solicitud previa de CORS.
export async function api(action, payload = {}, token = "") {
  if (!isApiConfigured()) {
    throw new ApiError(
      "CONFIGURATION_REQUIRED",
      "Falta conectar la aplicación. Sigue la guía de instalación."
    );
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    CONFIG.REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(CONFIG.API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=UTF-8",
      },
      body: JSON.stringify({ action, payload, token }),
      redirect: "follow",
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new ApiError(
        "HTTP_ERROR",
        "El servicio no pudo responder. Intenta nuevamente en unos momentos."
      );
    }

    let result;
    try {
      result = await response.json();
    } catch {
      throw new ApiError(
        "INVALID_RESPONSE",
        "La respuesta no es válida. Revisa que Apps Script esté publicado para Cualquiera."
      );
    }

    if (result?.ok !== true) {
      throw new ApiError(
        result?.error?.code || "API_ERROR",
        result?.error?.message || "No se pudo completar la solicitud."
      );
    }

    return result.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;

    if (error.name === "AbortError") {
      throw new ApiError(
        "TIMEOUT",
        "La conexión tardó demasiado. Intenta otra vez."
      );
    }

    throw new ApiError(
      "NETWORK_ERROR",
      "No se pudo conectar. Revisa tu internet y vuelve a intentarlo."
    );
  } finally {
    window.clearTimeout(timeout);
  }
}
