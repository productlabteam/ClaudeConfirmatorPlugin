#!/usr/bin/env node
// Claude Code PreToolUse hook.
// Reads JSON event from stdin; writes hookSpecificOutput JSON to stdout.
// On any error / timeout, exits 0 with empty stdout — Claude Code falls back
// to its built-in permission prompt.
//
// Routes by config.mode:
//   shared      → public Claude Confirmator API (long-poll)
//   self-hosted → user's own Telegram bot (long-poll Bot API)

import { appendFile, open, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { loadConfig, LOG_PATH, LOCK_PATH, assertSelfHosted } from "./lib/config.mjs";
import { renderToolCard, escMd, buildKeyboard, redact } from "./lib/format.mjs";
import { Telegram, waitForDecision, readOffset, writeOffset } from "./lib/telegram.mjs";
import { isReleased, drainModeCommands } from "./lib/mode.mjs";
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

async function acquireLock(deadline) {
  while (Date.now() < deadline) {
    try {
      const fh = await open(LOCK_PATH, "wx");
      await fh.write(String(process.pid));
      await fh.close();
      return true;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
}
async function releaseLock() { try { await unlink(LOCK_PATH); } catch {} }

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

// ─── shared mode ──────────────────────────────────────────────────────────
async function runShared(config, event) {
  try {
    const { config: paired } = await ensurePaired(config);
    config = paired;
  } catch (e) {
    await log(`shared: pair_init failed (${e.kind ?? "?"}): ${e.message}`);
    return;
  }

  if (!config.shared.paired) {
    try {
      const status = await refreshPairStatus(config);
      if (!status.paired) {
        const link = config.shared.deep_link || buildDeepLink(config.shared.pair_token);
        const reason = await t("hook.pair_required", config.language, { link });
        await log(`shared: not paired — ask with deep link`);
        emit({ permissionDecision: "ask", permissionDecisionReason: reason });
        return;
      }
    } catch (e) {
      await log(`shared: pair_status failed (${e.kind}): ${e.message}`);
      return;
    }
  }

  if (config.shared.paused) { await log(`shared: paused — passthrough`); return; }

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
    await log(`shared: notify failed (${e.kind}): ${e.message}`);
    return;
  }

  let res;
  try { res = await api.wait(notify.request_id, config.timeoutSeconds); }
  catch (e) { await log(`shared: wait failed (${e.kind}): ${e.message}`); return; }

  if (res.decision === "approve") { emit({ permissionDecision: "allow" }); return; }
  if (res.decision === "reject") {
    const reason = res.comment || (await t("hook.rejected", config.language));
    emit({ permissionDecision: "deny", permissionDecisionReason: reason });
    return;
  }
  await log(`shared: req=${notify.request_id} decision=${res.decision} → passthrough`);
}

// ─── self-hosted mode (legacy preserved) ──────────────────────────────────
async function runSelfHosted(config, event) {
  try { assertSelfHosted(config); }
  catch (e) { await log(`self-hosted: ${e.message} — passthrough`); return; }

  const lang = config.language;
  const tg = new Telegram(config.selfHosted.botToken);
  const chatId = config.selfHosted.chatId;

  try {
    await drainModeCommands({
      tg, chatId, readOffset, writeOffset,
      sendReply: (msg) => tg.sendMessage(String(chatId), escMd(msg)),
    });
  } catch (e) { await log(`drain error: ${e.message}`); }

  if (await isReleased()) { await log(`released — passthrough`); return; }

  const lockDeadline = Date.now() + 30_000;
  const haveLock = await acquireLock(lockDeadline).catch(async (e) => {
    await log(`lock error: ${e.message}`); return false;
  });
  if (!haveLock) { await log(`lock busy — passthrough`); return; }

  try {
    const requestId = randomUUID().slice(0, 8);
    const text = await renderToolCard({
      toolName: event.tool_name,
      toolInput: event.tool_input ?? {},
      cwd: event.cwd,
      redactSecrets: config.redactSecrets,
      lang,
    });
    const keyboard = await buildKeyboard(requestId, lang);
    const sent = await tg.sendMessage(String(chatId), text, { reply_markup: keyboard });

    const deadline = Date.now() + config.timeoutSeconds * 1000;
    const decision = await waitForDecision({ tg, chatId, requestId, deadline });

    const stripKb = () =>
      tg.editMessageReplyMarkup(sent.chat.id, sent.message_id, { inline_keyboard: [] }).catch(() => {});

    if (decision.kind === "approve") {
      await stripKb();
      await tg.editMessageText(sent.chat.id, sent.message_id, text + "\n\n" + await t("bot.notify.approved", lang)).catch(() => {});
      emit({ permissionDecision: "allow" });
      return;
    }
    if (decision.kind === "reject") {
      await stripKb();
      await tg.editMessageText(sent.chat.id, sent.message_id, text + "\n\n" + await t("bot.notify.rejected", lang)).catch(() => {});
      emit({ permissionDecision: "deny", permissionDecisionReason: await t("hook.rejected", lang) });
      return;
    }
    if (decision.kind === "released") {
      await stripKb();
      await tg.editMessageText(sent.chat.id, sent.message_id, text + "\n\n" + await t("bot.notify.released", lang)).catch(() => {});
      return;
    }
    if (decision.kind === "comment") {
      await stripKb();
      const safe = escMd(decision.text);
      await tg.editMessageText(sent.chat.id, sent.message_id, text + "\n\n" + await t("bot.notify.commented", lang, { text: safe })).catch(() => {});
      emit({ permissionDecision: "deny", permissionDecisionReason: decision.text });
      return;
    }

    await stripKb();
    await tg.editMessageText(sent.chat.id, sent.message_id, text + "\n\n" + await t("bot.notify.timeout", lang)).catch(() => {});
    await log(`timeout req=${requestId}`);
  } catch (e) {
    await log(`self-hosted run: ${e.stack ?? e.message}`);
  } finally {
    await releaseLock();
  }
}

// ─── entry ────────────────────────────────────────────────────────────────
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

  if (config.mode === "self-hosted") return runSelfHosted(config, event);
  return runShared(config, event);
}

main().catch(async (e) => {
  await log(`fatal: ${e.stack ?? e.message}`);
  process.exit(0);
});
