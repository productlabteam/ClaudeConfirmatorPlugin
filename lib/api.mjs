// Public Claude Confirmator API client (shared mode).
// Backend lives at config.shared.api_base. All errors throw with a tagged
// `kind` so the hook can decide whether to fall back to the local prompt.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_PATH = join(HERE, "..", "package.json");

let cachedUA = null;
async function userAgent() {
  if (cachedUA) return cachedUA;
  try {
    const pkg = JSON.parse(await readFile(PKG_PATH, "utf8"));
    cachedUA = `claude-confirmator-plugin/${pkg.version} (node)`;
  } catch {
    cachedUA = `claude-confirmator-plugin/unknown (node)`;
  }
  return cachedUA;
}

export class ApiError extends Error {
  constructor(kind, msg, status) {
    super(msg);
    this.kind = kind; // "network" | "api" | "auth" | "timeout"
    this.status = status;
  }
}

async function request(method, base, path, { body, auth, timeoutMs } = {}) {
  const url = base.replace(/\/+$/, "") + path;
  const headers = { "user-agent": await userAgent() };
  if (auth) headers["authorization"] = `Bearer ${auth}`;
  if (body !== undefined) headers["content-type"] = "application/json";

  const ac = new AbortController();
  const timer = timeoutMs ? setTimeout(() => ac.abort(), timeoutMs) : null;

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ac.signal,
    });
  } catch (e) {
    if (e.name === "AbortError") throw new ApiError("timeout", "request timed out");
    throw new ApiError("network", e.message);
  } finally {
    if (timer) clearTimeout(timer);
  }

  let json = null;
  try { json = await res.json(); } catch { /* may be empty */ }

  if (!res.ok) {
    const kind = res.status === 401 || res.status === 403 ? "auth" : "api";
    throw new ApiError(kind, json?.error ?? `HTTP ${res.status}`, res.status);
  }
  return json;
}

export class Api {
  constructor({ base, clientId, clientSecret }) {
    this.base = base;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  // POST /v1/pair/init — no auth required. Returns { client_id, client_secret, pair_token, deep_link, expires_at }.
  pairInit() {
    return request("POST", this.base, "/v1/pair/init", { timeoutMs: 10_000 });
  }

  // GET /v1/pair/status — Bearer auth. Returns { paired, language?, telegram_user_id?, paused }.
  pairStatus() {
    return request("GET", this.base, "/v1/pair/status", {
      auth: this.clientSecret, timeoutMs: 10_000,
    });
  }

  // POST /v1/notify — Bearer. Returns { request_id }.
  notify(payload) {
    return request("POST", this.base, "/v1/notify", {
      auth: this.clientSecret, body: payload, timeoutMs: 15_000,
    });
  }

  // GET /v1/wait — long poll. Returns { decision: "approve"|"reject"|"timeout", comment?, language? }.
  wait(requestId, timeoutSec) {
    return request("GET", this.base, `/v1/wait?request_id=${encodeURIComponent(requestId)}&timeout=${timeoutSec}`, {
      auth: this.clientSecret, timeoutMs: (timeoutSec + 10) * 1000,
    });
  }

  // POST /v1/unpair — server-side cleanup; idempotent.
  unpair() {
    return request("POST", this.base, "/v1/unpair", {
      auth: this.clientSecret, timeoutMs: 10_000,
    });
  }
}
