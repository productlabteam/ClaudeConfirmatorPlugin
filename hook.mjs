#!/usr/bin/env node
// Claude Code PreToolUse hook (shared mode only).
// Reads the tool-call event from stdin; writes a hookSpecificOutput JSON to
// stdout. On any error / timeout, exits 0 with empty stdout — Claude Code
// falls back to its built-in permission prompt.
//
// Talks to https://claudeconfirm.productlab.one (configurable via
// shared.api_base). The first time a session triggers a gated tool, the hook
// auto-pairs with the public Telegram bot @claudeconfirmbot and surfaces a
// deep link to the user via permissionDecision: "ask".

import { appendFile } from "node:fs/promises";
import { loadConfig, LOG_PATH } from "./lib/config.mjs";
import { redact } from "./lib/format.mjs";
import { ensurePaired, refreshPairStatus, apiFor, buildDeepLink } from "./lib/pairing.mjs";
import { t } from "./lib/i18n.mjs";

async function log(msg) {
  try { await appendFile(LOG_PATH, `[${new Date().toISOString()}] ${msg}\n`); } catch {}
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

function emit(decision) {
  if (!decision) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", ...decision },
  }));
}

function redactObj(obj) {
  if (typeof obj === "string") return redact(obj);
  if (Array.isArray(obj)) return obj.map(redactObj);
  if (obj && typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = redactObj(v);
    return out;
  }
  return obj;
}

async function run(config, event) {
  try {
    const { config: paired } = await ensurePaired(config);
    config = paired;
  } catch (e) {
    await log(`pair_init failed (${e.kind ?? "?"}): ${e.message}`);
    return;
  }

  if (!config.shared.paired) {
    try {
      const status = await refreshPairStatus(config);
      if (!status.paired) {
        const link = config.shared.deep_link || buildDeepLink(config.shared.pair_token);
        const reason = await t("hook.pair_required", config.language, { link });
        await log(`not paired — ask with deep link`);
        emit({ permissionDecision: "ask", permissionDecisionReason: reason });
        return;
      }
    } catch (e) {
      await log(`pair_status failed (${e.kind}): ${e.message}`);
      return;
    }
  }

  if (config.shared.paused) { await log(`paused — passthrough`); return; }

  const api = apiFor(config);
  const safeInput = config.redactSecrets ? redactObj(event.tool_input ?? {}) : event.tool_input;

  let notify;
  try {
    notify = await api.notify({
      tool_name: event.tool_name,
      tool_input: safeInput,
      cwd: event.cwd,
      session_id: event.session_id,
      timeout_seconds: config.timeoutSeconds,
    });
  } catch (e) {
    await log(`notify failed (${e.kind}): ${e.message}`);
    return;
  }

  let res;
  try { res = await api.wait(notify.request_id, config.timeoutSeconds); }
  catch (e) { await log(`wait failed (${e.kind}): ${e.message}`); return; }

  if (res.decision === "approve") { emit({ permissionDecision: "allow" }); return; }
  if (res.decision === "reject") {
    const reason = res.comment || (await t("hook.rejected", config.language));
    emit({ permissionDecision: "deny", permissionDecisionReason: reason });
    return;
  }
  await log(`req=${notify.request_id} decision=${res.decision} → passthrough`);
}

async function main() {
  let raw;
  try { raw = await readStdin(); }
  catch (e) { await log(`stdin read failed: ${e.message}`); return; }

  let event;
  try { event = JSON.parse(raw); }
  catch (e) { await log(`stdin not JSON: ${e.message}`); return; }

  let config;
  try { config = await loadConfig(); }
  catch (e) { await log(`config load: ${e.message} — passthrough`); return; }

  if (!config.tools.includes(event.tool_name)) return;

  return run(config, event);
}

main().catch(async (e) => {
  await log(`fatal: ${e.stack ?? e.message}`);
  process.exit(0);
});
