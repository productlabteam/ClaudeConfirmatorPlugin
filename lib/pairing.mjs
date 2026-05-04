// Manages local shared-mode credentials and pairing state.
// Credentials live inside ~/.claude/claude-confirmator.json under `shared`.

import { Api, ApiError } from "./api.mjs";
import { saveConfig } from "./config.mjs";

export const DEFAULT_API_BASE = "https://claudeconfirm.productlab.one";
export const BOT_USERNAME = "claudeconfirmbot";

export function buildDeepLink(pairToken) {
  return `https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(pairToken)}`;
}

// Initialize shared-mode credentials if missing. Mutates and persists config.
export async function ensurePaired(config) {
  const shared = config.shared ?? {};
  const base = shared.api_base || DEFAULT_API_BASE;

  if (!shared.client_id || !shared.client_secret) {
    const api = new Api({ base });
    const init = await api.pairInit();
    config.shared = {
      api_base: base,
      client_id: init.client_id,
      client_secret: init.client_secret,
      pair_token: init.pair_token,
      deep_link: init.deep_link ?? buildDeepLink(init.pair_token),
      paired: false,
    };
    await saveConfig(config);
    return { config, justInitialized: true };
  }

  return { config, justInitialized: false };
}

export function apiFor(config) {
  const s = config.shared ?? {};
  return new Api({
    base: s.api_base || DEFAULT_API_BASE,
    clientId: s.client_id,
    clientSecret: s.client_secret,
  });
}

// Check pair status with backend, persist updates locally.
export async function refreshPairStatus(config) {
  const api = apiFor(config);
  try {
    const status = await api.pairStatus();
    config.shared.paired = !!status.paired;
    if (status.language) config.language = status.language;
    if (typeof status.paused === "boolean") config.shared.paused = status.paused;
    await saveConfig(config);
    return status;
  } catch (e) {
    if (e instanceof ApiError && e.kind === "auth") {
      // Credentials revoked server-side. Wipe so next run re-pairs.
      delete config.shared;
      await saveConfig(config);
    }
    throw e;
  }
}

// Force a fresh deep link (e.g. previous one expired).
export async function rotateDeepLink(config) {
  const api = apiFor(config);
  // Backend exposes pair/init in idempotent form keyed by client_secret if provided.
  // But to keep this simple we just call init unauthenticated and replace creds
  // ONLY if the user explicitly asked (handled by caller via /confirm-link --reset).
  const init = await api.pairInit();
  config.shared.pair_token = init.pair_token;
  config.shared.deep_link = init.deep_link ?? buildDeepLink(init.pair_token);
  await saveConfig(config);
  return config.shared.deep_link;
}
